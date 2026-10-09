import {Router} from 'express';
import {createReadStream} from 'node:fs';
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {row,rows,run,db} from './db.mjs';
import {config} from './config.mjs';
import {requireOwner} from './auth.mjs';
import {createAssetStorage} from './asset-storage.mjs';
import {commercialSettings} from './commercial-analytics.mjs';
import {createMinerU} from './mineru-provider.mjs';
const formats=new Set(['.pdf','.pptx','.docx','.png','.jpg','.jpeg','.webp']);
const safeJob=j=>({id:j.id,asset_id:j.asset_id,state:j.state,error:j.error,library_id:j.library_id,version:j.version,created_at:j.created_at,updated_at:j.updated_at,checked_at:j.checked_at,name:j.original_name});
const busy=new Set();
export function documentParsingRouter({provider,storage=createAssetStorage()}={}){
 const router=Router(),getProvider=()=>provider===undefined?createMinerU():provider;
 const ready=()=>Boolean(commercialSettings().parser_enabled&&getProvider());
 router.get('/admin/parsing',requireOwner,(req,res)=>{
  const offset=Math.max(0,Math.min(100000,Number(req.query.offset)||0));
  res.set('Cache-Control','private, no-store').json({enabled:Boolean(commercialSettings().parser_enabled),configured:Boolean(getProvider()),formats:[...formats],maxBytes:200*1024*1024,items:rows('SELECT j.*,a.original_name FROM document_parse_jobs j JOIN assets a ON a.id=j.asset_id ORDER BY j.created_at DESC,j.id LIMIT 20 OFFSET ?',[offset]).map(safeJob),total:row('SELECT COUNT(*) n FROM document_parse_jobs').n,offset});
 });
 router.get('/admin/parsing/:id',requireOwner,(req,res)=>{const job=row('SELECT j.*,a.original_name FROM document_parse_jobs j JOIN assets a ON a.id=j.asset_id WHERE j.id=?',[req.params.id]);if(!job)return res.status(404).json({error:'任务不存在'});res.set('Cache-Control','private, no-store').json({...safeJob(job),body:job.body});});
 async function source(asset){
  const location=row('SELECT * FROM asset_storage WHERE asset_id=?',[asset.id]);
  if(location){if(!storage)throw Error('云端附件存储未配置');const r=await storage.open(location);if(r?.res?.status!==200){r?.stream?.destroy();throw Error('云端附件无法读取');}return r.stream;}
  if(path.basename(asset.filename)!==asset.filename||asset.url!==`/api/materials/${asset.id}`)throw Error('请选择私有附件');
  const file=path.join(config.uploadDir+'-private',asset.filename),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.size_bytes)throw Error('附件缺失或大小改变');return createReadStream(file);
 }
 router.post('/admin/parsing',requireOwner,async(req,res)=>{
  const p=z.object({assetId:z.number().int().positive(),consent:z.literal(true)}).strict().safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'请选择附件并确认传给 MinerU 解析'});
  if(!ready())return res.status(503).json({error:'请先配置服务器 MINERU_API_KEY 并开启资料解析'});
  const asset=row('SELECT * FROM assets WHERE id=?',[p.data.assetId]);
  if(!asset||asset.url!==`/api/materials/${asset.id}`||!formats.has(path.extname(asset.filename).toLowerCase())||!formats.has(path.extname(asset.original_name).toLowerCase())||asset.size_bytes>200*1024*1024)return res.status(400).json({error:'支持私有 PDF、PPTX、DOCX 或图片，最大 200MB、600 页；视频请准备字幕'});
  if(busy.size>=2||row("SELECT COUNT(*) n FROM document_parse_jobs WHERE state IN ('submitting','uploading','running')").n>=20)return res.status(429).json({error:'解析任务繁忙，请稍后提交'});
  let stream;try{stream=await source(asset);stream.on('error',()=>{});}catch{return res.status(409).json({error:'附件文件缺失或不可读，请先恢复附件'});}
  const id=randomUUID();try{run('INSERT INTO document_parse_jobs(id,asset_id,actor_id) VALUES(?,?,?)',[id,asset.id,req.user.id]);}catch{stream.destroy();return res.status(409).json({error:'附件已有进行中任务或待审核结果，请先处理原任务'});}
  busy.add(id);
  try{
   const client=getProvider(),task=await client.submit(asset.original_name,id);
   run("UPDATE document_parse_jobs SET state='uploading',batch_id=?,upload_url=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?",[task.batchId,task.uploadUrl,id]);
   const actor=row('SELECT role,status,token_version FROM users WHERE id=?',[req.user.id]);
   if(!ready()||actor?.status!=='active'||actor.role!=='admin'||actor.token_version!==req.user.token_version)throw Error('账号或设置变化');
   await client.upload(task.uploadUrl,stream,asset.size_bytes);
   run("UPDATE document_parse_jobs SET state='running',upload_url='',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?",[id]);
   res.status(202).json(safeJob(row('SELECT * FROM document_parse_jobs WHERE id=?',[id])));
  }catch(e){const definite=e.definite&&!row('SELECT batch_id FROM document_parse_jobs WHERE id=?',[id]).batch_id;run("UPDATE document_parse_jobs SET state=?,error=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?",[definite?'failed':'uncertain',definite?'MinerU 拒绝了提交，请核对密钥、接口额度与文件格式':'提交或上传结果尚未确认，请查询原任务，避免重复提交',id]);res.status(502).json({error:definite?'MinerU 未接受任务，请核对密钥、接口额度与文件格式':'任务提交未确认，请保留原任务并查询，避免重复提交',id});}
  finally{stream?.destroy();busy.delete(id);}
 });
 async function poll(id){
  const job=row('SELECT * FROM document_parse_jobs WHERE id=?',[id]);if(!job||!['running','uncertain','uploading'].includes(job.state)||!job.batch_id||busy.has(id))return;
  if(!ready())throw Error('解析未配置或已暂停');
  const actor=row('SELECT role,status FROM users WHERE id=?',[job.actor_id]);if(actor?.status!=='active'||actor.role!=='admin')throw Error('提交账号状态已变化');
  busy.add(id);run('UPDATE document_parse_jobs SET checked_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=?',[id]);
  try{
   const result=await getProvider().poll(job.batch_id,job.id);
   const freshActor=row('SELECT role,status FROM users WHERE id=?',[job.actor_id]);if(!ready()||freshActor?.role!=='admin'||freshActor.status!=='active')throw Error('账号或设置变化，结果尚未导入');
   if(!['review','failed','running'].includes(result.state)||result.state==='review'&&(!result.body||result.body.length>500000))throw Error('解析正文无效');
   run('UPDATE document_parse_jobs SET state=?,body=?,error=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND version=?',[result.state,result.body||'',result.error||'',id,job.version]);
  }finally{busy.delete(id);}
 }
 router.post('/admin/parsing/:id/check',requireOwner,async(req,res)=>{
  const job=row('SELECT * FROM document_parse_jobs WHERE id=?',[req.params.id]);if(!job)return res.status(404).json({error:'任务不存在'});
  if(!job.batch_id)return res.status(409).json({error:'接口未返回编号，请到 MinerU 后台确认原任务后再关闭'});
  if(busy.has(job.id)||job.checked_at&&Date.now()-Date.parse(job.checked_at+'Z')<15000)return res.status(429).json({error:'请稍后再查询此任务'});
  try{await poll(job.id);res.json(safeJob(row('SELECT * FROM document_parse_jobs WHERE id=?',[job.id])));}catch{res.status(502).json({error:'暂时无法查询 MinerU，任务已保留，请稍后重试'});}
 });
 router.post('/admin/parsing/:id/close',requireOwner,(req,res)=>{
  if(req.body.confirm!==true)return res.status(400).json({error:'请确认已核对原任务；关闭本地任务不会取消远端处理'});
  if(busy.has(req.params.id))return res.status(409).json({error:'任务正在处理，请稍后'});
  const r=run("UPDATE document_parse_jobs SET state='closed',upload_url='',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND state NOT IN ('imported','closed')",[req.params.id,Number(req.headers['if-match'])]);if(!r.changes)return res.status(409).json({error:'任务状态已变化，请刷新'});res.json({ok:true});
 });
 router.post('/admin/parsing/:id/import',requireOwner,(req,res)=>{
  const p=z.object({title:z.string().trim().min(2).max(200),body:z.string().trim().min(1).max(200000)}).strict().safeParse(req.body);if(!p.success)return res.status(400).json({error:'标题至少 2 个字，审核后的正文最多 20 万字；长文请分段整理'});
  const job=row('SELECT * FROM document_parse_jobs WHERE id=?',[req.params.id]);if(!job||job.state!=='review'||String(job.version)!==String(req.headers['if-match']))return res.status(409).json({error:'解析结果已变化，请刷新后核对'});
  db.exec('BEGIN IMMEDIATE');try{
   const asset=row('SELECT * FROM assets WHERE id=?',[job.asset_id]),result=run("INSERT INTO content_library(title,type,body,resource_url,status) VALUES(?,'document',?,?,'draft')",[p.data.title,p.data.body,asset.url]),libraryId=Number(result.lastInsertRowid);
   run("UPDATE document_parse_jobs SET state='imported',body=?,library_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[p.data.body,libraryId,job.id]);
   run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'library',libraryId,p.data.title,'draft','mineru-reviewed-import']);db.exec('COMMIT');res.status(201).json({libraryId,state:'draft'});
  }catch{db.exec('ROLLBACK');res.status(500).json({error:'导入未完成，原解析结果已保留'});}
 });
 router.pollPending=async()=>{if(!ready())return;for(const j of rows("SELECT id FROM document_parse_jobs WHERE state IN ('running','uploading') AND batch_id!='' AND attempts<1440 AND (checked_at IS NULL OR checked_at<datetime('now','-60 seconds')) ORDER BY checked_at LIMIT 2")){try{await poll(j.id);}catch{run("UPDATE document_parse_jobs SET error='查询暂未成功，可稍后在后台重试' WHERE id=?",[j.id]);}}};
 return router;
}
