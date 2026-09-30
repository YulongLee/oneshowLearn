import {Router} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAdmin} from './auth.mjs';
import {safeResourceUrl} from './opc-definition.mjs';

const status=z.enum(['draft','published','archived']);
const text=(max)=>z.string().trim().max(max);
const order=z.number().int().min(0).max(100000);
const id=z.number().int().positive();
const link=text(2000).refine(v=>!v||Boolean(safeResourceUrl(v)),'资源地址不安全或格式不正确');
const schemas={
  paths:z.object({title:text(120).min(2),description:text(3000),level:text(40),status,sort_order:order}),
  packs:z.object({path_id:id,slug:text(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),title:text(120).min(2),subtitle:text(300),description:text(20000),deliverable:text(1000),cover_url:link.refine(v=>!v||!v.startsWith('/api/materials/'),'课程封面请使用公开图片地址'),price_cents:z.number().int().min(0).max(100000000),estimated_minutes:order,status,is_featured:z.boolean(),sort_order:order}),
  steps:z.object({pack_id:id,title:text(120).min(2),summary:text(3000),status,sort_order:order,phase:z.number().int().min(0).max(5)}),
  content:z.object({step_id:id,type:z.enum(['document','prompt','code','template','task','checklist','video','download']),title:text(200).min(2),body:text(200000),resource_url:link,duration_seconds:z.number().int().min(0).max(86400),is_preview:z.boolean(),status,sort_order:order}),
};
const tables={paths:'learning_paths',packs:'project_packs',steps:'project_steps',content:'content_items'};
const version=item=>createHash('sha256').update(JSON.stringify(item)).digest('hex');
function record(kind,id) {
  const item=row(`SELECT * FROM ${tables[kind]} WHERE id=?`,[id]);
  if(item&&kind==='steps')item.phase=row('SELECT phase FROM opc_stage_steps WHERE step_id=?',[id])?.phase||0;
  return item;
}
const tagged=item=>({...item,version:version(item)});
export function readiness(packId) {
  const pack=row('SELECT * FROM project_packs WHERE id=?',[packId]);
  const chapters=rows('SELECT * FROM project_steps WHERE pack_id=?',[packId]);
  const items=rows('SELECT ci.* FROM content_items ci JOIN project_steps ps ON ps.id=ci.step_id WHERE ps.pack_id=?',[packId]);
  const live=items.filter(i=>i.status==='published'&&(!i.library_id||row('SELECT status FROM content_library WHERE id=?',[i.library_id])?.status==='published')&&chapters.some(c=>c.id===i.step_id&&c.status==='published'));
  const checks=[
    {label:'所属学习路径已发布',ok:row('SELECT status FROM learning_paths WHERE id=?',[pack.path_id])?.status==='published'},
    {label:'至少一个已发布章节和资料',ok:live.length>0},
    {label:'已发布资料的正文与必需附件完整',ok:live.length>0&&live.every(i=>(i.body.trim()||i.resource_url)&&(!['video','download'].includes(i.type)||i.resource_url))},
  ];
  return {checks,ready:checks.every(c=>c.ok),chapters:chapters.length,items:items.length,published:live.length,preview:live.filter(i=>i.is_preview).length};
}
export function cmsRouter() {
  const router=Router();router.use(requireAdmin);
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/snapshot',(_req,res)=>res.json({paths:rows('SELECT * FROM learning_paths ORDER BY sort_order,id').map(tagged),packs:rows('SELECT * FROM project_packs ORDER BY sort_order,id').map(p=>({...tagged(p),...readiness(p.id)}))}));
  router.get('/packs/:id',(req,res)=>{
    const p=record('packs',Number(req.params.id));if(!p)return res.status(404).json({error:'课程不存在'});
    const steps=rows('SELECT id FROM project_steps WHERE pack_id=? ORDER BY sort_order,id',[p.id]).map(s=>({...tagged(record('steps',s.id)),items:rows('SELECT * FROM content_items WHERE step_id=? ORDER BY sort_order,id',[s.id]).map(tagged)}));
    res.json({pack:tagged(p),steps,readiness:readiness(p.id)});
  });
  router.get('/audit',(_req,res)=>res.json({items:rows('SELECT ca.*,u.name actor_name FROM cms_audit ca LEFT JOIN users u ON u.id=ca.actor_id ORDER BY ca.id DESC LIMIT 100')}));
  for(const kind of Object.keys(tables)) {
    const save=(req,res)=>{
      const parsed=schemas[kind].safeParse(req.body);
      if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message==='Invalid input'?'请检查表单内容':`请检查 ${parsed.error.issues[0]?.path.join('.')||'表单'}：${parsed.error.issues[0]?.message}`});
      const d=parsed.data,existing=req.params.id?record(kind,Number(req.params.id)):null;
      if(req.params.id&&!existing)return res.status(404).json({error:'记录不存在'});
      if(existing&&req.headers['if-match']!==version(existing))return res.status(409).json({error:'这条内容已被其他窗口修改。请关闭编辑并刷新后重试，当前修改没有覆盖原内容。'});
      if(kind==='packs') {
        if(!record('paths',d.path_id))return res.status(400).json({error:'所属路径不存在'});
        if(row('SELECT id FROM project_packs WHERE slug=? AND id!=?',[d.slug,existing?.id||0]))return res.status(409).json({error:'课程地址标识已被使用，请换一个'});
        if(d.status==='published'&&existing?.status!=='published'&&(!existing||!readiness(existing.id).ready||record('paths',d.path_id).status!=='published'))return res.status(400).json({error:'请先保存草稿，发布所属路径，并配置至少一个已发布章节及有内容的资料，再发布课程。'});
      }
      if(kind==='steps'&&!record('packs',d.pack_id))return res.status(400).json({error:'所属课程不存在'});
      if(kind==='content') {
        if(existing?.library_id){const source=row('SELECT * FROM content_library WHERE id=?',[existing.library_id]);for(const key of ['title','type','body','resource_url','duration_seconds'])d[key]=source[key];}
        if(!record('steps',d.step_id))return res.status(400).json({error:'所属章节不存在'});
        if(d.status==='published'&&(!d.body&&!d.resource_url||['video','download'].includes(d.type)&&!d.resource_url))return res.status(400).json({error:'发布前请补充正文或附件；视频和下载资料必须提供资源地址。'});
        if(d.resource_url.startsWith('/api/materials/')&&!row('SELECT id FROM assets WHERE url=?',[d.resource_url]))return res.status(400).json({error:'所选附件不存在，请重新上传或选择'});
      }
      const fields={...d};delete fields.phase;
      for(const key of ['is_featured','is_preview'])if(key in fields)fields[key]=Number(fields[key]);
      db.exec('BEGIN IMMEDIATE');
      try {
        let recordId=existing?.id;
        if(existing)run(`UPDATE ${tables[kind]} SET ${Object.keys(fields).map(k=>`${k}=?`).join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,[...Object.values(fields),recordId]);
        else recordId=Number(run(`INSERT INTO ${tables[kind]}(${Object.keys(fields).join(',')}) VALUES(${Object.keys(fields).map(()=>'?').join(',')})`,Object.values(fields)).lastInsertRowid);
        if(kind==='packs')run(`INSERT INTO products(pack_id,sku,title,price_cents,status) VALUES(?,?,?,?,?) ON CONFLICT(pack_id) DO UPDATE SET title=excluded.title,price_cents=excluded.price_cents,status=excluded.status,updated_at=CURRENT_TIMESTAMP`,[recordId,`OSL-${randomUUID()}`,d.title,d.price_cents,d.status==='published'?'active':'inactive']);
        if(kind==='steps') {
          if(d.phase)run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,?) ON CONFLICT(step_id) DO UPDATE SET phase=excluded.phase',[recordId,d.phase]);
          else run('DELETE FROM opc_stage_steps WHERE step_id=?',[recordId]);
        }
        run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,action,status) VALUES(?,?,?,?,?,?)',[req.user.id,kind,recordId,d.title,existing?'update':'create',d.status]);
        db.exec('COMMIT');res.status(existing?200:201).json({item:tagged(record(kind,recordId))});
      }catch(error){db.exec('ROLLBACK');throw error;}
    };
    if(kind!=='paths')router.post(`/${kind}`,save);
    router.put(`/${kind}/:id`,save);
  }
  return router;
}
