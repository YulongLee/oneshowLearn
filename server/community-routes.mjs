import {Router} from 'express';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAuth,requireAdmin} from './auth.mjs';
import {safeResourceUrl} from './opc-definition.mjs';
import {canReadPack} from './opc-routes.mjs';
import {materialUrl} from './materials.mjs';
import {communityGroupReady,communityGroupAllowed,validCommunityImage} from './community-assets.mjs';
import {COMMUNITY_SETTINGS,COMMUNITY_CATEGORIES} from './community-definition.mjs';

const text=n=>z.string().trim().max(n);
const image=text(2000).refine(s=>!s||/^\/api\/materials\/[1-9]\d*$/.test(s)||(/^\/assets\/[\w./-]+$/.test(s)&&!s.includes('..'))||(/^https:\/\//.test(s)&&Boolean(safeResourceUrl(s))),'请上传图片，或填写 HTTPS 图片地址');
const article=z.object({title:text(160).min(2),summary:text(500),body:text(100000).min(1),category:z.enum(COMMUNITY_CATEGORIES.slice(1).map(x=>x[0])),topic:text(60),coverUrl:image,pinned:z.boolean(),recommended:z.boolean()});
const expiry=text(10).refine(s=>!s||/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'请选择有效的截止日期');
const settings=z.object({title:text(160).min(2),description:text(500),eyebrow:text(60).default(COMMUNITY_SETTINGS.eyebrow),tagline:text(500).default(COMMUNITY_SETTINGS.tagline),heroImage:image.default(''),groupTitle:text(80).min(2),groupDescription:text(500),groupInstructions:text(500).default(COMMUNITY_SETTINGS.groupInstructions),groupExpiresAt:expiry.default(''),qrUrl:image,groupEnabled:z.boolean(),groupAudience:z.enum(['entitled','signed-in']),resourceIds:z.array(z.number().int().positive()).max(8).refine(a=>new Set(a).size===a.length)});
const fail=(res,message,status=400)=>res.status(status).json({error:message});
const record=id=>row('SELECT * FROM community_records WHERE id=?',[id]);
const adminView=r=>({...r,draft:JSON.parse(r.draft_json),published:Boolean(r.published_json),draft_json:undefined,published_json:undefined});
const publicArticle=r=>({id:r.id,...JSON.parse(r.published_json),publishedAt:r.published_at});
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}

export function communityRouter(){
  db.exec(`CREATE TABLE IF NOT EXISTS community_records(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('article','settings')),draft_json TEXT NOT NULL,published_json TEXT,version INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,published_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS community_single_settings ON community_records(kind) WHERE kind='settings';
    CREATE TABLE IF NOT EXISTS community_history(id INTEGER PRIMARY KEY AUTOINCREMENT,record_id INTEGER NOT NULL REFERENCES community_records(id),payload TEXT NOT NULL,actor_id INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const router=Router();
  router.use(['/community','/admin/community'],(_q,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/community',requireAuth,(req,res)=>{
    const config=row("SELECT published_json FROM community_records WHERE kind='settings' AND archived=0");
    const saved={...COMMUNITY_SETTINGS,...(config?.published_json?JSON.parse(config.published_json):{})};
    const hasAccess=communityGroupAllowed(saved,req.user);
    const groupReady=communityGroupReady(saved);
    const items=rows("SELECT * FROM community_records WHERE kind='article' AND archived=0 AND published_json IS NOT NULL ORDER BY published_at DESC,id DESC").map(publicArticle).map(({body,...meta})=>({...meta,coverUrl:materialUrl(meta.coverUrl,req.user)}));
    const resources=saved.resourceIds.map(id=>row("SELECT ci.id,ci.title,ci.type,ci.is_preview,pp.id pack_id,pp.slug pack_slug FROM published_content_items ci JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published' JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published' JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published' WHERE ci.id=? AND ci.status='published'",[id])).filter(Boolean).map(r=>({...r,locked:!r.is_preview&&!canReadPack(req.user,r.pack_id)}));
    res.json({items,settings:{...saved,heroImage:materialUrl(saved.heroImage,req.user),qrUrl:groupReady&&hasAccess?materialUrl(saved.qrUrl,req.user):'',groupReady,groupAccessible:groupReady&&hasAccess,groupExpired:Boolean(saved.groupEnabled&&saved.qrUrl&&saved.groupExpiresAt&&!groupReady)},resources});
  });
  router.get('/community/articles/:id',requireAuth,(req,res)=>{const r=record(Number(req.params.id));if(!r||r.kind!=='article'||r.archived||!r.published_json)return fail(res,'文章尚未发布或已归档',404);res.json({item:publicArticle(r)});});
  router.use('/admin/community',requireAdmin);
  router.get('/admin/community',(_req,res)=>res.json({items:rows('SELECT * FROM community_records ORDER BY id DESC').map(adminView)}));
  const save=(req,res)=>{
    const old=req.params.id?record(Number(req.params.id)):null;
    if(req.params.id&&!old)return fail(res,'记录不存在',404);
    if(old&&String(old.version)!==req.headers['if-match'])return fail(res,'内容已被修改，请重新加载；没有覆盖其他修改。',409);
    const kind=old?.kind||req.body.kind;if(!['article','settings'].includes(kind))return fail(res,'内容类型无效');
    const parsed=(kind==='article'?article:settings).safeParse(req.body.draft);if(!parsed.success)return fail(res,parsed.error.issues.map(i=>i.message).join('；'));
    if((kind==='article'?[parsed.data.coverUrl]:[parsed.data.qrUrl,parsed.data.heroImage]).some(url=>!validCommunityImage(url)))return fail(res,'图片不存在或格式不支持，请上传 5MB 以内的 PNG、JPEG、WebP 图片');
    if(!old&&kind==='settings'&&row("SELECT id FROM community_records WHERE kind='settings'"))return fail(res,'社区设置已存在，请重新加载',409);
    if(kind==='settings'&&parsed.data.resourceIds.some(id=>!row('SELECT id FROM content_items WHERE id=?',[id])))return fail(res,'推荐资料不存在');
    const id=transaction(()=>{let id=old?.id;const payload=JSON.stringify(parsed.data);if(old)run("UPDATE community_records SET draft_json=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[payload,id]);else id=Number(run('INSERT INTO community_records(kind,draft_json) VALUES(?,?)',[kind,payload]).lastInsertRowid);run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'community',id,parsed.data.title,'draft','save']);return id;});
    res.status(old?200:201).json({item:adminView(record(id))});
  };
  router.post('/admin/community',save);router.put('/admin/community/:id',save);
  router.post('/admin/community/:id/:action',(req,res)=>{
    const r=record(Number(req.params.id)),action=req.params.action;if(!r)return fail(res,'记录不存在',404);
    if(!['publish','archive','restore'].includes(action))return fail(res,'操作不存在',404);
    if(req.headers['if-match']!==String(r.version))return fail(res,'内容已被修改，请重新加载',409);
    const draft=JSON.parse(r.draft_json);
    if(action==='publish'&&(r.kind==='article'?[draft.coverUrl]:[draft.qrUrl,draft.heroImage]).some(url=>!validCommunityImage(url)))return fail(res,'配图文件不可用，请重新上传后保存草稿');
    if(action==='publish'&&r.kind==='settings'&&draft.groupEnabled&&!draft.qrUrl)return fail(res,'启用微信群前请配置真实二维码');
    transaction(()=>{
      if(action==='publish'){run("UPDATE community_records SET published_json=draft_json,archived=0,version=version+1,published_at=COALESCE(published_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at=CURRENT_TIMESTAMP WHERE id=?",[r.id]);run('INSERT INTO community_history(record_id,payload,actor_id) VALUES(?,?,?)',[r.id,r.draft_json,req.user.id]);}
      else run('UPDATE community_records SET archived=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',[action==='archive'?1:0,r.id]);
      run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'community',r.id,draft.title,action==='archive'?'archived':action==='publish'?'published':'draft',action]);
    });res.json({item:adminView(record(r.id))});
  });
  router.get('/admin/community/:id/history',(req,res)=>res.json({items:rows('SELECT id,payload,created_at FROM community_history WHERE record_id=? ORDER BY id DESC LIMIT 30',[Number(req.params.id)]).map(({payload,...r})=>({...r,draft:JSON.parse(payload)}))}));
  return router;
}
