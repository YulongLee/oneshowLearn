import {Router} from 'express';
import {mkdirSync, existsSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import {config} from './config.mjs';
import {db, row, rows, run} from './db.mjs';
import {requireAdmin,hasVerifiedLogin} from './auth.mjs';
import {learningAssetAllowed} from './learning-model.mjs';
import {communityAssetAllowed} from './community-assets.mjs';
import {createAssetStorage,materialRange} from './asset-storage.mjs';
import {pipeline} from 'node:stream/promises';
import {resumableUploadsRouter} from './resumable-uploads.mjs';

const directory = `${config.uploadDir}-private`;
const extensions = new Set(['.pdf','.txt','.md','.csv','.json','.zip','.pptx','.docx','.xlsx','.mp4','.webm','.mp3','.png','.jpg','.jpeg','.webp','.vtt']);
// Browsers send UTF-8 multipart filenames; Busboy's default decoding is Latin-1.
function originalName(value) {
  if(!/^[\u0000-\u00ff]*$/.test(value))return value;
  try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(value,'latin1'));}catch{return value;}
}
const upload = multer({storage:multer.diskStorage({destination:(_r,_f,done)=>{mkdirSync(directory,{recursive:true,mode:0o700});done(null,directory);},filename:(_r,f,done)=>done(null,randomUUID()+path.extname(f.originalname).toLowerCase())}),limits:{fileSize:50*1024*1024,files:1},fileFilter:(_r,f,done)=>extensions.has(path.extname(f.originalname).toLowerCase())?done(null,true):done(Object.assign(new Error('不支持此文件格式，请上传 PDF、文档、ZIP、图片或音视频。'),{status:400}))});
export function materialUrl(value,user) {
  const match=String(value||'').match(/^\/api\/materials\/(\d+)$/);
  if(!match)return value;
  const ticket=jwt.sign({purpose:'material',asset:Number(match[1]),sub:user?.id||0,ver:Number(user?.token_version||0)},config.jwtSecret,{expiresIn:'15m'});
  return `${value}?ticket=${ticket}`;
}
function allowed(asset,user) {
  if(user&&['admin','editor'].includes(user.role))return true;
  if(communityAssetAllowed(asset,user))return true;
  if(learningAssetAllowed(asset.id,user))return true;
  return rows(`SELECT ci.is_preview,pp.id FROM published_content_items ci
    JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published'
    JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published'
    JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
    WHERE ci.resource_url=? AND ci.status='published'`,[asset.url]).some(item=>item.is_preview||user&&row(`SELECT id FROM entitlements WHERE user_id=? AND pack_id=? AND status='active' AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`,[user.id,item.id]));
}
export function materialsRouter(storage=createAssetStorage()) {
  const router=Router();
  router.use(resumableUploadsRouter(storage));
  // Keep the old client route compatible without creating another public file.
  router.post(['/admin/cms/assets','/admin/assets'],requireAdmin,(req,res,next)=>upload.single('file')(req,res,async error=>{
    if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:error.code==='LIMIT_FILE_SIZE'?'文件超过 50MB，请压缩后重试。':error.message});
    if(!req.file)return res.status(400).json({error:'请选择文件'});
    let location;
    try {
      const f=req.file;
      if(storage)location=await storage.put(f);
      db.exec('BEGIN IMMEDIATE');
      const name=originalName(f.originalname);
      const result=run('INSERT INTO assets(filename,original_name,mime_type,size_bytes,url,uploaded_by) VALUES(?,?,?,?,?,?)',[f.filename,name,f.mimetype,f.size,'',req.user.id]);
      const id=Number(result.lastInsertRowid),url=`/api/materials/${id}`;
      run('UPDATE assets SET url=? WHERE id=?',[url,id]);
      if(location)run('INSERT INTO asset_storage(asset_id,provider,bucket,endpoint,object_key,etag,header_hex) VALUES(?,?,?,?,?,?,?)',[id,location.provider,location.bucket,location.endpoint,location.object_key,location.etag,location.header_hex]);
      db.exec('COMMIT');
      if(location){try{unlinkSync(f.path);}catch{}}
      res.status(201).json({id,url,name,size:f.size});
    }catch(e){try{db.exec('ROLLBACK');}catch{}try{unlinkSync(req.file.path);}catch{}if(location){try{await storage.remove(location);}catch{console.error('OSS upload rollback cleanup failed');}}next(e);}
  }));
  router.get('/admin/cms/storage',requireAdmin,(_req,res)=>res.json(storage?.info||{provider:'local'}));
  router.get('/admin/cms/assets',requireAdmin,(_req,res)=>res.json({items:rows("SELECT a.id,original_name,mime_type,size_bytes,url,created_at,COALESCE(s.provider,'local') AS storage_provider FROM assets a LEFT JOIN asset_storage s ON s.asset_id=a.id ORDER BY a.id DESC").map(a=>({...a,private:a.url.startsWith('/api/materials/')}))}));
  router.get('/admin/cms/assets/:id/link',requireAdmin,(req,res)=>{
    const asset=row('SELECT * FROM assets WHERE id=?',[Number(req.params.id)]);
    if(!asset)return res.status(404).json({error:'附件不存在'});
    res.set('Cache-Control','no-store').json({url:materialUrl(asset.url,req.user)});
  });
  router.get('/materials/:id',async(req,res,next)=>{
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    let ticket;
    try {
      ticket=jwt.verify(String(req.query.ticket||''),config.jwtSecret,{algorithms:['HS256']});
      if(ticket.purpose!=='material'||ticket.asset!==Number(req.params.id))throw Error();
    }catch{return res.status(401).json({error:'下载链接已失效，请重新打开课程资料'});}
    try {
      const user=ticket.sub?row('SELECT * FROM users WHERE id=?',[Number(ticket.sub)]):null;
      if(ticket.sub&&(!user||user.status!=='active'||!hasVerifiedLogin(user)||Number(user.token_version)!==ticket.ver))return res.status(403).json({error:'登录状态已失效，请重新打开课程资料'});
      const asset=row('SELECT * FROM assets WHERE id=? AND url=?',[ticket.asset,`/api/materials/${ticket.asset}`]);
      if(!asset||!allowed(asset,user))return res.status(403).json({error:'资料未发布或当前账号没有访问权限'});
      const filename=path.basename(asset.filename),file=path.join(directory,filename);
      const location=row('SELECT * FROM asset_storage WHERE asset_id=?',[asset.id]);
      if(location){
        if(!storage)return res.status(503).json({error:'云端附件存储暂未配置，请联系管理员'});
        const range=materialRange(req.headers.range,asset.size_bytes);
        if(range===false)return res.status(416).set('Content-Range',`bytes */${asset.size_bytes}`).end();
        const remote=await storage.open(location,{range:range?.header,head:req.method==='HEAD'});
        if(remote&&remote.res.status!==(range?206:200)){remote.stream.destroy();throw new Error('Unexpected OSS range response');}
        res.status(range?206:200).set({'Accept-Ranges':'bytes','Content-Length':String(range?range.length:asset.size_bytes)});
        if(range)res.set('Content-Range',`bytes ${range.start}-${range.end}/${asset.size_bytes}`);
        res.type(path.extname(filename));
        if(!['.mp4','.webm','.mp3','.png','.jpg','.jpeg','.webp','.vtt'].includes(path.extname(filename)))res.attachment(asset.original_name);
        if(req.method==='HEAD')return res.end();
        const cancel=()=>remote.stream.destroy();res.once('close',cancel);
        try{await pipeline(remote.stream,res);}finally{res.off('close',cancel);}
        return;
      }
      if(!existsSync(file))return res.status(404).json({error:'附件文件不存在，请联系管理员'});
      if(['.mp4','.webm','.mp3','.png','.jpg','.jpeg','.webp','.vtt'].includes(path.extname(filename)))return res.sendFile(file);
      return res.download(file,asset.original_name);
    }catch(error){if(res.headersSent)return res.destroy();if(error.code==='NoSuchKey')return res.status(404).json({error:'附件文件不存在，请联系管理员'});next(error);}
  });
  return router;
}
