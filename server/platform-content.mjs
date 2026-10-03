import {Router} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAdmin,optionalAuth} from './auth.mjs';
import {canReadPack} from './opc-routes.mjs';
import {safeResourceUrl} from './opc-definition.mjs';
import {SITE_DEFAULTS,currentPublicCopy} from './site-defaults.mjs';
import {HOME_CARDS} from './homepage-cards.mjs';

const state=z.enum(['draft','published','archived']);
const text=n=>z.string().trim().max(n);
const ids=z.array(z.number().int().positive()).max(40).refine(a=>new Set(a).size===a.length,'不能重复选择');
const media=text(2000).refine(s=>!s||Boolean(safeResourceUrl(s)),'附件地址不安全');
const image=text(2000).refine(s=>!s||/^\/assets\/[\w./-]+$/.test(s)&&!s.includes('..')||/^https:\/\//.test(s)&&Boolean(safeResourceUrl(s)),'封面仅支持 HTTPS 或 /assets/ 图片路径');
const route=text(200).refine(s=>/^\/(?:login|register|app|membership|opc(?:\/phase\/[1-5])?|paths(?:\/[a-z0-9-]+)?|packs\/[a-z0-9-]+|projects(?:\/[a-z0-9-]+)?|resources|courses|notes|favorites|plan|tutor|community)$/.test(s),'请选择有效的站内学习页面');
const librarySchema=z.object({title:text(200).min(2),type:z.enum(['document','prompt','code','template','task','checklist','video','download']),body:text(200000),resource_url:media,duration_seconds:z.number().int().min(0).max(86400),status:state});
const projectSchema=z.object({title:text(120).min(2),slug:text(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),description:text(20000),cover_url:image,category:z.enum(['saas','mini','mobile','tools','desktop','agent','automation','other']),tags:z.array(text(30).min(1)).max(8),deliverable:text(1000),status:state,sort_order:z.number().int().min(0).max(100000),courseIds:ids});
const homeCardSchema=z.object({tag:text(20).min(1),title:text(80).min(2),description:text(120),image:image.refine(Boolean,'请设置首页插图'),courseId:z.number().int().positive().nullable()});
const pageSchema=z.object({eyebrow:text(60),title:text(160).min(2),description:text(1000),image,ctaLabel:text(40).min(1),ctaPath:route,secondaryLabel:text(40).min(1),secondaryPath:route,footerTitle:text(120),footerDescription:text(500),courseIds:ids,projectIds:ids,hotCourseCards:z.array(homeCardSchema).length(4).optional()});
const version=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const tag=x=>({...x,version:version(x)});
const fail=(res,message,status=400)=>res.status(status).json({error:message});
const parse=(schema,req,res)=>{const p=schema.safeParse(req.body);if(!p.success){fail(res,p.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('；'));return null;}return p.data;};
const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
function audit(req,entity,id,title,status,action='update'){run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,entity,id,title,status,action]);}
function project(id){const p=row('SELECT * FROM practice_projects WHERE id=?',[id]);return p?{...p,tags:JSON.parse(p.tags),courseIds:rows('SELECT pack_id FROM practice_project_courses WHERE project_id=? ORDER BY sort_order',[id]).map(x=>x.pack_id)}:null;}
const publishedCourse=id=>row("SELECT pp.id,pp.slug,pp.title,pp.subtitle,pp.cover_url,pp.deliverable,pp.estimated_minutes FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published' WHERE pp.id=? AND pp.status='published'",[id]);
function projects(user){return rows("SELECT id FROM practice_projects WHERE status='published' ORDER BY sort_order,id").map(({id})=>{const p=project(id);const courses=p.courseIds.map(publishedCourse).filter(Boolean).map(c=>({...c,entitled:canReadPack(user,c.id)}));return {...p,courseIds:courses.map(c=>c.id),courses};}).filter(p=>p.courses.length);}
function pageRow(key){return row('SELECT * FROM site_pages WHERE key=?',[key]);}
const pageDraft=(key,payload)=>key==='public'?{...currentPublicCopy(payload),hotCourseCards:payload.hotCourseCards??HOME_CARDS}:payload;
function pageView(key,payload,user){
  if(key==='public')payload=currentPublicCopy(payload);
  const available=rows("SELECT pp.id FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published' WHERE pp.status='published' ORDER BY pp.is_featured DESC,pp.sort_order,pp.id");
  const courses=(payload.courseIds.length?payload.courseIds:available.slice(0,4).map(x=>x.id)).map(publishedCourse).filter(Boolean).map(c=>({...c,contentCount:row("SELECT COUNT(*) n FROM published_content_items ci JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published' WHERE ps.pack_id=? AND ci.status='published'",[c.id]).n}));
  const list=projects(user);const selected=payload.projectIds.length?payload.projectIds.map(id=>list.find(p=>p.id===id)).filter(Boolean):list.slice(0,4);
  const hotCourseCards=key==='public'?(payload.hotCourseCards??HOME_CARDS).map(card=>{
    const course=card.courseId?publishedCourse(card.courseId):null;
    return {...card,course:course?{id:course.id,slug:course.slug,contentCount:row("SELECT COUNT(*) n FROM published_content_items ci JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published' WHERE ps.pack_id=? AND ci.status='published'",[course.id]).n}:null};
  }):undefined;
  return {...payload,courses,projects:selected,...(hotCourseCards?{hotCourseCards}:{})};
}
function assetValid(url){return !url.startsWith('/api/materials/')||Boolean(row('SELECT id FROM assets WHERE url=?',[url]));}

export function platformContentRouter(){
  const router=Router();
  router.use((_q,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/site/pages/:key',optionalAuth,(req,res)=>{const key=req.params.key;if(!Object.hasOwn(SITE_DEFAULTS,key))return fail(res,'页面不存在',404);const saved=pageRow(key);res.json(pageView(key,saved?.published_json?JSON.parse(saved.published_json):SITE_DEFAULTS[key],req.user));});
  router.get('/practice-projects',optionalAuth,(req,res)=>res.json({items:projects(req.user)}));
  router.use('/admin/platform',requireAdmin);
  router.get('/admin/platform/library',(_req,res)=>res.json({items:rows('SELECT * FROM content_library ORDER BY id DESC').map(x=>({...tag(x),references:rows('SELECT ci.id,ci.title,ci.status,ci.is_preview,ps.title chapter,pp.title course,ps.id step_id FROM content_items ci JOIN project_steps ps ON ps.id=ci.step_id JOIN project_packs pp ON pp.id=ps.pack_id WHERE ci.library_id=?',[x.id])}))}));
  const saveLibrary=(req,res)=>{
    const d=parse(librarySchema,req,res);if(!d)return;
    const old=req.params.id?row('SELECT * FROM content_library WHERE id=?',[Number(req.params.id)]):null;
    if(req.params.id&&!old)return fail(res,'资料不存在',404);
    if(old&&req.headers['if-match']!==version(old))return fail(res,'资料已被修改，请刷新后重试；未覆盖已有内容。',409);
    if(!assetValid(d.resource_url))return fail(res,'所选附件不存在');
    if(d.status==='published'&&(!d.body&&!d.resource_url||['video','download'].includes(d.type)&&!d.resource_url))return fail(res,'发布前补充正文或附件；视频和下载必须有资源地址。');
    const id=transaction(()=>{let id=old?.id;if(old)run("UPDATE content_library SET title=?,type=?,body=?,resource_url=?,duration_seconds=?,status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",[d.title,d.type,d.body,d.resource_url,d.duration_seconds,d.status,id]);else id=Number(run('INSERT INTO content_library(title,type,body,resource_url,duration_seconds,status) VALUES(?,?,?,?,?,?)',[d.title,d.type,d.body,d.resource_url,d.duration_seconds,d.status]).lastInsertRowid);audit(req,'library',id,d.title,d.status,old?'update':'create');return id;});
    res.status(old?200:201).json({item:tag(row('SELECT * FROM content_library WHERE id=?',[id]))});
  };
  router.post('/admin/platform/library',saveLibrary);router.put('/admin/platform/library/:id',saveLibrary);
  router.post('/admin/platform/library/import/:id',(req,res)=>{
    const item=row('SELECT * FROM content_items WHERE id=?',[Number(req.params.id)]);if(!item)return fail(res,'原资料不存在',404);
    if(req.headers['if-match']!==version(item))return fail(res,'原资料已被修改，请刷新后重试。',409);
    if(item.library_id)return res.json({item:tag(row('SELECT * FROM content_library WHERE id=?',[item.library_id]))});
    const id=transaction(()=>{const id=Number(run('INSERT INTO content_library(title,type,body,resource_url,duration_seconds,status) VALUES(?,?,?,?,?,?)',[item.title,item.type,item.body,item.resource_url,item.duration_seconds,item.status]).lastInsertRowid);run("UPDATE content_items SET library_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",[id,item.id]);audit(req,'library',id,item.title,item.status,'import');return id;});res.status(201).json({item:tag(row('SELECT * FROM content_library WHERE id=?',[id]))});
  });
  router.post('/admin/platform/library/:id/attach',(req,res)=>{
    const parsed=z.object({stepId:z.number().int().positive(),isPreview:z.boolean(),status:state,sortOrder:z.number().int().min(0).max(100000)}).safeParse(req.body);
    if(!parsed.success)return fail(res,'请检查章节、排序和预览设置');
    const d=parsed.data,l=row('SELECT * FROM content_library WHERE id=?',[Number(req.params.id)]);if(!l||!row('SELECT id FROM project_steps WHERE id=?',[d.stepId]))return fail(res,'资料或章节不存在',404);
    if(row('SELECT id FROM content_items WHERE step_id=? AND library_id=?',[d.stepId,l.id]))return fail(res,'本章节已引用这份资料',409);
    const id=transaction(()=>{const id=Number(run('INSERT INTO content_items(step_id,type,title,body,resource_url,duration_seconds,is_preview,status,sort_order,library_id) VALUES(?,?,?,?,?,?,?,?,?,?)',[d.stepId,l.type,l.title,l.body,l.resource_url,l.duration_seconds,Number(d.isPreview),d.status,d.sortOrder,l.id]).lastInsertRowid);audit(req,'content',id,l.title,d.status,'attach');return id;});res.status(201).json({id});
  });
  router.get('/admin/platform/projects',(_req,res)=>res.json({items:rows('SELECT id FROM practice_projects ORDER BY sort_order,id').map(({id})=>tag(project(id)))}));
  const saveProject=(req,res)=>{const d=parse(projectSchema,req,res);if(!d)return;const old=req.params.id?project(Number(req.params.id)):null;if(req.params.id&&!old)return fail(res,'项目不存在',404);if(old&&req.headers['if-match']!==version(old))return fail(res,'项目已被修改，请刷新重试。',409);
    if(d.courseIds.some(id=>!row('SELECT id FROM project_packs WHERE id=?',[id])))return fail(res,'关联课程不存在');
    if(d.status==='published'&&!d.courseIds.some(publishedCourse))return fail(res,'发布项目至少需要关联一门已发布课程');
    if(row('SELECT id FROM practice_projects WHERE slug=? AND id!=?',[d.slug,old?.id||0]))return fail(res,'项目标识已使用',409);
    const id=transaction(()=>{let id=old?.id;const values=[d.title,d.slug,d.description,d.cover_url,d.category,JSON.stringify(d.tags),d.deliverable,d.status,d.sort_order];if(old)run("UPDATE practice_projects SET title=?,slug=?,description=?,cover_url=?,category=?,tags=?,deliverable=?,status=?,sort_order=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",[...values,id]);else id=Number(run('INSERT INTO practice_projects(title,slug,description,cover_url,category,tags,deliverable,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?)',values).lastInsertRowid);run('DELETE FROM practice_project_courses WHERE project_id=?',[id]);d.courseIds.forEach((pack,i)=>run('INSERT INTO practice_project_courses(project_id,pack_id,sort_order) VALUES(?,?,?)',[id,pack,i]));audit(req,'projects',id,d.title,d.status,old?'update':'create');return id;});res.status(old?200:201).json({item:tag(project(id))});};
  router.post('/admin/platform/projects',saveProject);router.put('/admin/platform/projects/:id',saveProject);
  router.get('/admin/platform/pages/:key',(req,res)=>{const key=req.params.key;if(!Object.hasOwn(SITE_DEFAULTS,key))return fail(res,'页面不存在',404);const p=pageRow(key);res.json({draft:pageDraft(key,p?JSON.parse(p.draft_json):SITE_DEFAULTS[key]),version:String(p?.version||0),published:Boolean(p?.published_json),history:rows('SELECT id,created_at FROM site_page_history WHERE page_key=? ORDER BY id DESC LIMIT 30',[key])});});
  router.post('/admin/platform/pages/:key/preview',(req,res)=>{if(!Object.hasOwn(SITE_DEFAULTS,req.params.key))return fail(res,'页面不存在',404);const d=parse(pageSchema,req,res);if(d)res.json(pageView(req.params.key,d,req.user));});
  router.put('/admin/platform/pages/:key',(req,res)=>{
    const key=req.params.key;if(!Object.hasOwn(SITE_DEFAULTS,key))return fail(res,'页面不存在',404);
    const parsed=parse(pageSchema,req,res);if(!parsed)return;
    const p=pageRow(key);if(req.headers['if-match']!==String(p?.version||0))return fail(res,'页面已被修改，请刷新后重试。',409);
    // Older clients must not erase separately configured marketing cards.
    const d=pageDraft(key,{...parsed,...(key==='public'&&!parsed.hotCourseCards?{hotCourseCards:p?JSON.parse(p.draft_json).hotCourseCards:undefined}:{})});
    if(d.courseIds.some(id=>!row('SELECT id FROM project_packs WHERE id=?',[id]))||d.projectIds.some(id=>!project(id))||d.hotCourseCards?.some(c=>c.courseId&&!row('SELECT id FROM project_packs WHERE id=?',[c.courseId])))return fail(res,'推荐课程或项目不存在');
    transaction(()=>{run("INSERT INTO site_pages(key,draft_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET draft_json=excluded.draft_json,version=site_pages.version+1,updated_at=CURRENT_TIMESTAMP",[key,JSON.stringify(d)]);audit(req,'pages',key==='public'?1:2,d.title,'draft');});res.json({version:String(pageRow(key).version)});
  });
  router.post('/admin/platform/pages/:key/publish',(req,res)=>{const key=req.params.key,p=pageRow(key);if(!p)return fail(res,'请先保存页面草稿');if(req.headers['if-match']!==String(p.version))return fail(res,'页面已被修改，请刷新后重试。',409);transaction(()=>{run('UPDATE site_pages SET published_json=draft_json,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE key=?',[key]);run('INSERT INTO site_page_history(page_key,payload,actor_id) VALUES(?,?,?)',[key,p.draft_json,req.user.id]);audit(req,'pages',key==='public'?1:2,JSON.parse(p.draft_json).title,'published','publish');});res.json({version:String(pageRow(key).version)});});
  router.get('/admin/platform/pages/:key/history/:id',(req,res)=>{const h=row('SELECT payload FROM site_page_history WHERE id=? AND page_key=?',[Number(req.params.id),req.params.key]);if(!h)return fail(res,'历史版本不存在',404);res.json({draft:pageDraft(req.params.key,JSON.parse(h.payload))});});
  return router;
}
