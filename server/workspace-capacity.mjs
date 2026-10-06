import {Router} from 'express';
import {row,rows} from './db.mjs';
import {requireAuth} from './auth.mjs';
import {createHash} from 'node:crypto';
import {listPage} from './list-page.mjs';
export function workspaceCapacityRouter(){
 const router=Router();router.use(['/me/capacity','/me/export'],requireAuth,(_q,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 router.get('/me/capacity',(req,res)=>{const saved=row('SELECT state_json FROM workspace_state WHERE user_id=?',[req.user.id])?.state_json||'{}',state=JSON.parse(saved);res.json({workspaceBytes:Buffer.byteLength(saved,'utf8'),workspaceLimit:1024*1024,usage:Object.fromEntries([['notes',100],['achievements',100],['tasks',200],['favorites',200],['resourceFavorites',200],['contentFavorites',200]].map(([key,limit])=>[key,{used:(state[key]||[]).length,limit}])),learningNotes:{used:row('SELECT COUNT(*) n FROM learning_notes WHERE user_id=?',[req.user.id]).n,limit:1000},trashCountsTowardLimit:true});});
 router.get('/me/export',(req,res)=>{
  const saved=row('SELECT state_json FROM workspace_state WHERE user_id=?',[req.user.id]),versions=rows('SELECT id,version FROM learning_notes WHERE user_id=? ORDER BY id',[req.user.id]),snapshot=createHash('sha256').update(JSON.stringify({state:saved?.state_json||'{}',versions})).digest('hex'),p=listPage(req.query,{size:20,max:20});
  if(p.offset&&!req.query.snapshot)return res.status(428).json({error:'请从第一页开始导出'});
  if(req.query.snapshot&&req.query.snapshot!==snapshot)return res.status(409).json({error:'导出期间记录已变化，请重试完整导出；未更改你的内容'});
  res.json({format:'oneshowlearn-private-export-v1',exportedAt:new Date().toISOString(),...(p.offset===0?{workspace:saved?JSON.parse(saved.state_json):{}}:{}),learningNotes:rows('SELECT id,placement_id,title,body,video_time,slide_id,created_at,updated_at,deleted_at,version FROM learning_notes WHERE user_id=? ORDER BY id LIMIT ? OFFSET ?',[req.user.id,p.limit,p.offset]),snapshot,total:versions.length,nextOffset:p.offset+p.limit<versions.length?p.offset+p.limit:null,notice:'包含私人记录与可恢复回收站；不含账号凭据、支付票据或他人内容。请妥善保管。当前提供导出备份，不支持整包导入。'});
 });return router;
}
