import {Router} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAuth,requireOwner,hasVerifiedLogin} from './auth.mjs';
import {courseAccess,placement} from './learning-model.mjs';

export function lessonFingerprint(p){const materials=rows(`SELECT m.library_id,m.role,l.title,l.body,l.status,v.revision_id FROM lesson_materials m JOIN content_library l ON l.id=m.library_id LEFT JOIN lesson_prompt_versions v ON v.placement_id=m.placement_id AND v.library_id=m.library_id WHERE m.placement_id=? ORDER BY m.library_id`,[p.id]);return createHash('sha256').update(JSON.stringify({id:p.id,lesson:p.lesson_id,config:p.config,version:p.lesson_version,materials})).digest('hex');}
export function courseCurriculum(packId){
 return rows(`SELECT p.id FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id AND l.status='published'
  JOIN project_steps s ON s.id=p.chapter_id AND s.status='published' JOIN project_packs c ON c.id=s.pack_id AND c.status='published'
  JOIN learning_paths lp ON lp.id=c.path_id AND lp.status='published' WHERE s.pack_id=? AND p.status='published' ORDER BY s.sort_order,s.id,p.sort_order,p.id`,[packId]).map(i=>placement(i.id)).filter(Boolean);
}
const manifest=lessons=>lessons.map(p=>({id:p.id,fingerprint:lessonFingerprint(p)}));
export function certificateCourseStates(){
 return rows(`SELECT p.id,p.title,COALESCE(cp.enabled,0) enabled,COALESCE(cp.version,0) version,cp.curriculum FROM project_packs p LEFT JOIN certificate_policies cp ON cp.pack_id=p.id WHERE p.status='published' ORDER BY p.id LIMIT 200`).map(c=>{
  const lessons=courseCurriculum(c.id);
  return {...c,curriculum:undefined,total:lessons.length,demo:lessons.filter(p=>p.config.isDemoMedia).length,empty:lessons.filter(p=>!hasTeachingContent(p)).length,current:JSON.stringify(manifest(lessons))===c.curriculum};
 });
}
function hasTeachingContent(p){
 if(p.config.slides.some(s=>typeof s.text==='string'&&s.text.trim()))return true;
 if([p.config.videoAssetId,p.config.pptAssetId].some(id=>id&&row('SELECT 1 FROM assets WHERE id=? AND size_bytes>0',[id])))return true;
 return Boolean(row("SELECT 1 FROM lesson_materials m JOIN content_library l ON l.id=m.library_id AND l.status='published' WHERE m.placement_id=? AND length(trim(l.body))>0",[p.id]));
}
export function recordCompletion(user,p){
 if(p.kind!=='course'||p.config.isDemoMedia)return;
 run(`INSERT INTO completion_receipts(user_id,placement_id,fingerprint) VALUES(?,?,?) ON CONFLICT(user_id,placement_id)
  DO UPDATE SET fingerprint=excluded.fingerprint,completed_at=CURRENT_TIMESTAMP`,[user.id,p.id,lessonFingerprint(p)]);
}
export function certificateEligibility(user,packId){
 const policy=row('SELECT * FROM certificate_policies WHERE pack_id=?',[packId]);
 if(!policy?.enabled)return {eligible:false,reason:'课程发证尚未启用'};
 if(!user||user.status!=='active'||user.role!=='learner'||!hasVerifiedLogin(user)||!courseAccess(user,packId))return {eligible:false,reason:'需要有效的课程学习权益'};
 const lessons=courseCurriculum(packId),current=JSON.stringify(manifest(lessons));
 if(!lessons.length||lessons.some(p=>p.config.isDemoMedia||!hasTeachingContent(p))||current!==policy.curriculum)return {eligible:false,reason:'课程内容已更新，管理员确认完整教学目录后恢复发证'};
 const completed=lessons.filter(p=>row(`SELECT 1 FROM completion_receipts r JOIN learning_progress pr ON pr.user_id=r.user_id AND pr.placement_id=r.placement_id
  WHERE r.user_id=? AND r.placement_id=? AND r.fingerprint=? AND pr.completed_at IS NOT NULL`,[user.id,p.id,lessonFingerprint(p)])).length;
 return {eligible:completed===lessons.length,completed,total:lessons.length,reason:completed===lessons.length?'已完成全部正式课时':'完成全部正式课时后自动领取',curriculum:current};
}
export function issueCourseCertificate(user,packId){
 const existing=row('SELECT * FROM course_certificates WHERE user_id=? AND pack_id=?',[user.id,packId]);
 if(existing)return existing; // Unique identity, no automatic revival of revoked certificates.
 const e=certificateEligibility(user,packId);if(!e.eligible)return null;
 const course=row('SELECT title FROM project_packs WHERE id=?',[packId]);
 run('INSERT OR IGNORE INTO course_certificates(id,user_id,pack_id,recipient,course_title,curriculum) VALUES(?,?,?,?,?,?)',[randomUUID(),user.id,packId,user.name,course.title,e.curriculum]);
 return row('SELECT * FROM course_certificates WHERE user_id=? AND pack_id=?',[user.id,packId]);
}
let issuanceCursor=0;
export function reconcileCertificates(){
 const users=rows(`SELECT u.* FROM users u WHERE u.id>? AND u.role='learner' AND u.status='active' AND EXISTS(SELECT 1 FROM completion_receipts r WHERE r.user_id=u.id) ORDER BY u.id LIMIT 25`,[issuanceCursor]);
 for(const user of users)for(const p of rows('SELECT pack_id FROM certificate_policies WHERE enabled=1 LIMIT 200'))issueCourseCertificate(user,p.pack_id);
 issuanceCursor=users.length===25?users.at(-1).id:0;
}
const summary=c=>({id:c.id,pack_id:c.pack_id,recipient:c.recipient,course_title:c.course_title,issued_at:c.issued_at,revoked_at:c.revoked_at,reason:c.revoked_at?c.reason:'',issuer:'OneShowLearn',type:'课程结业证书'});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function certificateHTML(c){
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OneShowLearn 结业证书</title><style>body{background:#f5f3ff;color:#1c1935;font-family:system-ui,sans-serif;margin:0;padding:24px}.certificate{background:white;max-width:900px;margin:20px auto;border:2px solid #7850ff;outline:8px solid white;padding:64px 40px;text-align:center;border-radius:12px}h1{font-size:38px;margin:35px 0}.brand{color:#7645ff;font-size:24px}.name{font-size:32px;font-weight:bold;margin:32px}.course{font-size:24px}.small{font-size:13px;color:#625e78;overflow-wrap:anywhere;line-height:2}button{display:block;margin:20px auto;padding:12px 24px;background:#7645ff;color:white;border:0;border-radius:8px}@media print{body{background:white;padding:0}button{display:none}.certificate{margin:0;break-inside:avoid}}@media(max-width:600px){.certificate{padding:30px 16px}h1{font-size:28px}}</style><section class="certificate"><div class="brand">OneShowLearn · Learn. Build. Grow.</div><h1>课程结业证书</h1><p>兹证明</p><div class="name">${escape(c.recipient)}</div><p>已完成以下课程的全部正式课时学习</p><div class="course">${escape(c.course_title)}</div><p>保持学习，让想法成为作品。</p><hr><div class="small">颁发方：OneShowLearn<br>颁发日期：${escape(c.issued_at.slice(0,10))}<br>证书编号：${escape(c.id)}</div></section><button id="print">打印 / 保存为 PDF</button><script>document.getElementById('print').onclick=()=>window.print()</script></html>`;
}
export function certificatesRouter(){
 const router=Router();
 router.get('/me/certificates',requireAuth,(req,res)=>{
  res.set('Cache-Control','private, no-store').json({items:rows('SELECT * FROM course_certificates WHERE user_id=? ORDER BY issued_at DESC LIMIT 200',[req.user.id]).map(summary),courses:rows('SELECT pack_id FROM certificate_policies WHERE enabled=1 LIMIT 200').filter(i=>courseAccess(req.user,i.pack_id)).map(i=>({pack_id:i.pack_id,title:row('SELECT title FROM project_packs WHERE id=?',[i.pack_id])?.title,...certificateEligibility(req.user,i.pack_id),curriculum:undefined}))});
 });
 router.get('/me/certificates/:id/document',requireAuth,(req,res)=>{
  const c=row('SELECT * FROM course_certificates WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
  if(!c)return res.status(404).json({error:'证书不存在'});
  if(c.revoked_at||!courseAccess(req.user,c.pack_id))return res.status(403).json({error:'证书当前不可下载，请联系管理员核对'});
  res.set('Cache-Control','private, no-store').json({html:certificateHTML(c)});
 });
 router.get('/admin/certificates',requireOwner,(req,res)=>{
  const offset=Math.max(0,Math.min(100000,Number(req.query.offset)||0));
  res.set('Cache-Control','private, no-store').json({items:rows('SELECT * FROM course_certificates ORDER BY issued_at DESC,id LIMIT 20 OFFSET ?',[offset]).map(summary),total:row('SELECT COUNT(*) n FROM course_certificates').n,offset,courses:certificateCourseStates()});
 });
 router.put('/admin/certificates/courses/:id',requireOwner,(req,res)=>{
  const input=z.object({enabled:z.boolean(),expectedLessons:z.number().int().min(1).max(1000)}).strict().safeParse(req.body),id=Number(req.params.id);
  if(!input.success)return res.status(400).json({error:'设置格式无效'});
  const lessons=courseCurriculum(id);if(!row('SELECT id FROM project_packs WHERE id=?',[id]))return res.status(404).json({error:'课程不存在'});
  if(input.data.enabled&&(lessons.length!==input.data.expectedLessons||lessons.some(p=>p.config.isDemoMedia||!hasTeachingContent(p))))return res.status(409).json({error:'请先发布数量匹配且包含教学内容的全部正式课时，不能使用空课时或演示素材发证'});
  const old=row('SELECT * FROM certificate_policies WHERE pack_id=?',[id]);if(String(req.headers['if-match'])!==String(old?.version||0))return res.status(409).json({error:'发证设置已变化，请刷新'});
  run(`INSERT INTO certificate_policies(pack_id,enabled,curriculum,version,actor_id) VALUES(?,?,?,1,?) ON CONFLICT(pack_id) DO UPDATE SET enabled=excluded.enabled,curriculum=excluded.curriculum,version=certificate_policies.version+1,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP`,[id,+input.data.enabled,JSON.stringify(manifest(lessons)),req.user.id]);
  run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'certificate-policy',id,'课程发证目录',input.data.enabled?'enabled':'disabled','save']);
  res.json({ok:true});
 });
 router.post('/admin/certificates/:id/revoke',requireOwner,(req,res)=>{
  const p=z.object({reason:z.string().trim().min(1).max(300)}).strict().safeParse(req.body);if(!p.success)return res.status(400).json({error:'请填写撤销原因'});
  const c=row('SELECT * FROM course_certificates WHERE id=?',[req.params.id]);if(!c)return res.status(404).json({error:'证书不存在'});
  if(!c.revoked_at){run('UPDATE course_certificates SET revoked_at=CURRENT_TIMESTAMP,reason=? WHERE id=?',[p.data.reason,c.id]);run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'certificate',c.pack_id,c.id,'revoked','revoke']);}res.json({ok:true});
 });return router;
}
