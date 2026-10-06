import {Router} from 'express';
import {row,rows,run} from './db.mjs';
import {requireAuth} from './auth.mjs';
import {createHash} from 'node:crypto';
function notices(user){
 const support=rows("SELECT m.id,m.created_at,r.id request_id,r.title FROM support_messages m JOIN support_requests r ON r.id=m.request_id WHERE r.user_id=? AND m.author_type='admin' ORDER BY m.id DESC LIMIT 20",[user.id]).map(m=>({key:'support:'+m.id,title:'官方回复：'+m.title,createdAt:m.created_at,path:'/support?request='+m.request_id}));
 const updates=rows("SELECT r.id,r.published_json,COALESCE((SELECT MAX(h.created_at) FROM community_history h WHERE h.record_id=r.id),r.published_at) published_at FROM community_records r WHERE r.kind='article' AND r.archived=0 AND r.published_json IS NOT NULL ORDER BY published_at DESC,r.id DESC LIMIT 20").map(r=>({key:`article:${r.id}:${createHash('sha256').update(r.published_json).digest('hex').slice(0,16)}`,title:'官方更新：'+JSON.parse(r.published_json).title,createdAt:r.published_at,path:'/community?article='+r.id}));
 const read=new Set(rows('SELECT notice_key FROM notification_reads WHERE user_id=?',[user.id]).map(r=>r.notice_key));
 return [...support,...updates].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(n=>({...n,read:read.has(n.key)}));
}
export function notificationsRouter(){
 const router=Router();router.use('/notifications',requireAuth,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 router.get('/notifications',(req,res)=>{const items=notices(req.user);res.json({items,unread:items.filter(n=>!n.read).length,scope:'最近官方更新与本人的客服回复'});});
 router.post('/notifications/read',(req,res)=>{
  if(typeof req.body.key!=='string'||req.body.key.length>100||Object.keys(req.body).some(k=>k!=='key'))return res.status(400).json({error:'通知编号无效'});
  if(!notices(req.user).some(n=>n.key===req.body.key))return res.status(404).json({error:'通知已不可用'});
  run('INSERT OR IGNORE INTO notification_reads(user_id,notice_key) VALUES(?,?)',[req.user.id,req.body.key]);res.json({ok:true});
 });return router;
}
