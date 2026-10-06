import {Router,raw} from 'express';
import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {constants,mkdirSync,openSync,closeSync,readSync,writeSync,fsyncSync,statSync,statfsSync,lstatSync,existsSync,unlinkSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {config} from './config.mjs';
import {db,row,rows,run} from './db.mjs';
import {requireAdmin,hasVerifiedLogin} from './auth.mjs';
import {rateLimit} from './account-security.mjs';
import {migrateUploads} from './upload-schema.mjs';
export const UPLOAD_CHUNK_BYTES=4*1024*1024,UPLOAD_MAX_BYTES=1024*1024*1024;
const extensions=new Set(['.pdf','.txt','.md','.csv','.json','.zip','.pptx','.docx','.xlsx','.mp4','.webm','.mp3','.png','.jpg','.jpeg','.webp','.vtt']);
const hash=data=>createHash('sha256').update(data).digest('hex');
const manifestSchema=z.object({name:z.string().min(1).max(255).refine(n=>!/[\x00-\x1f\\/]/.test(n)),size:z.number().int().positive().max(UPLOAD_MAX_BYTES),mime:z.string().max(120),chunks:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(256)}).strict().refine(m=>m.chunks.length===Math.ceil(m.size/UPLOAD_CHUNK_BYTES));
const fail=(status,message)=>{throw Object.assign(new Error(message),{isPaymentError:true,status});};
export function resumableUploadsRouter(storage){
 migrateUploads(db);
 const router=Router(),directory=config.uploadDir+'-staging',privateDirectory=config.uploadDir+'-private';
 const safeDirectory=dir=>{mkdirSync(dir,{recursive:true,mode:0o700});if(lstatSync(dir).isSymbolicLink()||!lstatSync(dir).isDirectory())fail(503,'上传目录不可用');};
 const file=s=>path.join(directory,s.id+'.part');
 const diskSpace=(dir,bytes)=>{const fs=statfsSync(dir);if(fs.bavail*fs.bsize<bytes+256*1024*1024)fail(507,'服务器暂存空间不足，请释放旧上传或联系管理员后重试');};
 const currentAdmin=req=>{const u=row('SELECT * FROM users WHERE id=?',[req.user.id]);if(!u||u.status!=='active'||!['admin','editor'].includes(u.role)||u.token_version!==req.user.token_version||!hasVerifiedLogin(u))fail(403,'登录或管理权限已变化，请重新登录');return u;};
 const session=req=>{if(!/^[a-f0-9-]{36}$/.test(req.params.id))fail(404,'上传不存在');const s=row('SELECT * FROM asset_upload_sessions WHERE id=? AND user_id=?',[req.params.id,req.user.id]);if(!s)fail(404,'上传不存在');if(s.state!=='completed'&&s.expires_at<=Date.now())fail(410,'上传已过期，请重新选择文件');return s;};
 const view=s=>({id:s.id,received:s.received,size:s.size,state:s.state,expiresAt:s.expires_at,chunkBytes:UPLOAD_CHUNK_BYTES,...(s.asset_id?{asset:{id:s.asset_id,url:'/api/materials/'+s.asset_id,name:s.name,size:s.size}}:{})});
 router.use('/admin/uploads',requireAdmin,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 router.get('/admin/uploads',(req,res)=>res.json({items:rows("SELECT * FROM asset_upload_sessions WHERE user_id=? AND state!='completed' AND expires_at>? ORDER BY rowid DESC LIMIT 4",[req.user.id,Date.now()]).map(s=>({...view(s),name:s.name}))}));
 router.post('/admin/uploads',async(req,res)=>{
  currentAdmin(req);rateLimit('resumable-start',String(req.user.id),30,3600);
  const parsed=manifestSchema.safeParse(req.body);if(!parsed.success||!extensions.has(path.extname(parsed.data?.name||'').toLowerCase()))fail(400,'文件或分片清单无效，单文件最大 1GB');
  const m=parsed.data,digest=hash(JSON.stringify(m)),prior=row('SELECT * FROM asset_upload_sessions WHERE user_id=? AND digest=? AND (expires_at>? OR state=\'completed\') ORDER BY rowid DESC LIMIT 1',[req.user.id,digest,Date.now()]);
  if(prior)return res.json(view(prior));
  safeDirectory(directory);
  for(const expired of rows("SELECT * FROM asset_upload_sessions WHERE state!='completed' AND expires_at<=? AND lease_until<=?",[Date.now(),Date.now()])){try{if(expired.storage_checkpoint)await storage?.abortCheckpoint?.(JSON.parse(expired.storage_checkpoint));const target=file(expired);if(existsSync(target))unlinkSync(target);const local=path.join(privateDirectory,expired.filename);if(existsSync(local)&&!row('SELECT id FROM assets WHERE filename=?',[expired.filename]))unlinkSync(local);run("DELETE FROM asset_upload_sessions WHERE id=? AND state!='completed' AND lease_until<=?",[expired.id,Date.now()]);}catch{/* Retain the exact failed cleanup target; never remove an unrelated file. */}}
  currentAdmin(req);const resumed=row("SELECT * FROM asset_upload_sessions WHERE user_id=? AND digest=? AND (expires_at>? OR state='completed') ORDER BY rowid DESC LIMIT 1",[req.user.id,digest,Date.now()]);if(resumed)return res.json(view(resumed));
  const own=row("SELECT COUNT(*) n,COALESCE(SUM(size),0) bytes FROM asset_upload_sessions WHERE user_id=? AND state!='completed'",[req.user.id]);
  if(own.n>=4||own.bytes+m.size>2*UPLOAD_MAX_BYTES||row("SELECT COALESCE(SUM(size),0) bytes FROM asset_upload_sessions WHERE state!='completed'").bytes+m.size>4*UPLOAD_MAX_BYTES)fail(429,'正在上传的文件较多，请完成或取消旧上传后重试');
  diskSpace(directory,m.size);
  const id=randomUUID(),filename=randomUUID()+path.extname(m.name).toLowerCase(),fd=openSync(path.join(directory,id+'.part'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd);
  try{run('INSERT INTO asset_upload_sessions(id,user_id,filename,name,mime,size,manifest,digest,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,req.user.id,filename,m.name,m.mime,m.size,JSON.stringify(m.chunks),digest,Date.now()+24*3600*1000]);}catch(e){unlinkSync(path.join(directory,id+'.part'));throw e;}
  res.status(201).json(view(row('SELECT * FROM asset_upload_sessions WHERE id=?',[id])));
 });
 router.get('/admin/uploads/:id',(req,res)=>res.json(view(session(req))));
 router.put('/admin/uploads/:id/chunks/:index',raw({type:'application/octet-stream',limit:UPLOAD_CHUNK_BYTES}),(req,res)=>{
  currentAdmin(req);const s=session(req),index=Number(req.params.index),manifest=JSON.parse(s.manifest),bytes=req.body;
  if(!Number.isSafeInteger(index)||index<0||index>=manifest.length||!Buffer.isBuffer(bytes)||bytes.length!==Math.min(UPLOAD_CHUNK_BYTES,s.size-index*UPLOAD_CHUNK_BYTES)||hash(bytes)!==manifest[index])fail(400,'分片大小或校验不一致，请重新选择原文件');
  if(s.state!=='uploading')return res.status(s.state==='completed'?200:409).json(s.state==='completed'?view(s):{error:'正在整理附件，请稍后查询上传状态'});
  const offset=index*UPLOAD_CHUNK_BYTES;
  if(offset<s.received)return res.json(view(s));
  if(offset!==s.received)fail(409,'分片顺序已变化，请查询上传状态后恢复');
  const fd=openSync(file(s),constants.O_RDWR|constants.O_NOFOLLOW);
  try{let written=0;while(written<bytes.length)written+=writeSync(fd,bytes,written,bytes.length-written,offset+written);fsyncSync(fd);run('UPDATE asset_upload_sessions SET received=? WHERE id=? AND received=? AND state=\'uploading\'',[s.received+bytes.length,s.id,s.received]);}finally{closeSync(fd);}
  res.json(view(row('SELECT * FROM asset_upload_sessions WHERE id=?',[s.id])));
 });
 router.delete('/admin/uploads/:id',async(req,res)=>{currentAdmin(req);const s=session(req),lease=randomUUID();if(!run("UPDATE asset_upload_sessions SET state='cancelling',lease=?,lease_until=? WHERE id=? AND state='uploading'",[lease,Date.now()+20*60*1000,s.id]).changes)fail(409,'附件已完成或正在整理，不能取消');try{if(s.storage_checkpoint)await storage?.abortCheckpoint?.(JSON.parse(s.storage_checkpoint));if(existsSync(file(s)))unlinkSync(file(s));run('DELETE FROM asset_upload_sessions WHERE id=? AND user_id=? AND lease=?',[s.id,req.user.id,lease]);res.status(204).end();}catch(e){run("UPDATE asset_upload_sessions SET state='uploading',lease=NULL,lease_until=0 WHERE id=? AND lease=?",[s.id,lease]);throw e;}});
 router.post('/admin/uploads/:id/complete',async(req,res)=>{
  currentAdmin(req);let s=session(req);if(s.state==='completed')return res.json(view(s));
  if(s.state==='cancelling')fail(409,'附件正在取消，请稍后重试');
  if(s.state==='completing'&&s.lease_until>Date.now())return res.status(202).json(view(s));
  if(s.received!==s.size)fail(409,'文件未上传完整，请继续上传剩余分片');
  const lease=randomUUID();if(!run("UPDATE asset_upload_sessions SET state='completing',lease=?,lease_until=? WHERE id=? AND (state='uploading' OR lease_until<=?)",[lease,Date.now()+20*60*1000,s.id,Date.now()]).changes)fail(409,'另一请求正在整理附件，请查询上传状态');
  let location,localCopy=false;
  try{
   const staged=file(s),fd=openSync(staged,constants.O_RDONLY|constants.O_NOFOLLOW),manifest=JSON.parse(s.manifest);
   try{if(statSync(staged).size!==s.size)fail(409,'上传文件长度不一致');for(let i=0;i<manifest.length;i++){const bytes=Buffer.alloc(Math.min(UPLOAD_CHUNK_BYTES,s.size-i*UPLOAD_CHUNK_BYTES));let got=0;while(got<bytes.length){const count=readSync(fd,bytes,got,bytes.length-got,i*UPLOAD_CHUNK_BYTES+got);if(!count)fail(409,'上传文件缺少内容');got+=count;}if(hash(bytes)!==manifest[i])fail(409,'上传文件校验失败，请重新上传');}}finally{closeSync(fd);}
   const f={filename:s.filename,path:staged,size:s.size,mimetype:s.mime,manifestDigest:s.digest,checkpoint:s.storage_checkpoint?JSON.parse(s.storage_checkpoint):null,saveCheckpoint:checkpoint=>run('UPDATE asset_upload_sessions SET storage_checkpoint=?,lease_until=? WHERE id=? AND lease=?',[JSON.stringify(checkpoint),Date.now()+20*60*1000,s.id,lease])};
   if(storage)location=await storage.put(f);else{safeDirectory(privateDirectory);const target=path.join(privateDirectory,s.filename);if(existsSync(target)){if(lstatSync(target).isSymbolicLink()||statSync(target).size!==s.size)fail(409,'旧整理文件不一致，请联系管理员核对');const recovered=openSync(target,constants.O_RDONLY|constants.O_NOFOLLOW);try{for(let i=0;i<manifest.length;i++){const bytes=Buffer.alloc(Math.min(UPLOAD_CHUNK_BYTES,s.size-i*UPLOAD_CHUNK_BYTES));if(readSync(recovered,bytes,0,bytes.length,i*UPLOAD_CHUNK_BYTES)!==bytes.length||hash(bytes)!==manifest[i])fail(409,'旧整理文件校验不一致，请联系管理员核对');}}finally{closeSync(recovered);}}else{diskSpace(privateDirectory,s.size);copyFileSync(staged,target,constants.COPYFILE_EXCL);}localCopy=true;}
   currentAdmin(req);db.exec('BEGIN IMMEDIATE');
   try{const latest=row('SELECT * FROM asset_upload_sessions WHERE id=?',[s.id]);if(latest.lease!==lease||latest.state!=='completing')fail(409,'上传整理状态已变化，请重新查询');const id=Number(run('INSERT INTO assets(filename,original_name,mime_type,size_bytes,url,uploaded_by) VALUES(?,?,?,?,?,?)',[s.filename,s.name,s.mime,s.size,'',req.user.id]).lastInsertRowid);run('UPDATE assets SET url=? WHERE id=?',['/api/materials/'+id,id]);if(location)run('INSERT INTO asset_storage(asset_id,provider,bucket,endpoint,object_key,etag,header_hex) VALUES(?,?,?,?,?,?,?)',[id,location.provider,location.bucket,location.endpoint,location.object_key,location.etag,location.header_hex]);run("UPDATE asset_upload_sessions SET state='completed',asset_id=?,lease=NULL,lease_until=0,storage_checkpoint=NULL WHERE id=? AND lease=?",[id,s.id,lease]);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   try{unlinkSync(staged);}catch{}res.status(201).json(view(row('SELECT * FROM asset_upload_sessions WHERE id=?',[s.id])));
  }catch(e){let removed=false;if(location)try{await storage.remove(location);removed=true;}catch{}if(localCopy)try{unlinkSync(path.join(privateDirectory,s.filename));}catch{}run("UPDATE asset_upload_sessions SET state='uploading',lease=NULL,lease_until=0,storage_checkpoint=CASE WHEN ? THEN NULL ELSE storage_checkpoint END WHERE id=? AND lease=?",[removed?1:0,s.id,lease]);throw e;}
 });return router;
}
