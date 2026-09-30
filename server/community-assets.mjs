import {openSync,readSync,closeSync} from 'node:fs';
import path from 'node:path';
import {row,rows} from './db.mjs';
import {config} from './config.mjs';

export function communityGroupReady(settings,now=Date.now()){
  return Boolean(settings.groupEnabled&&settings.qrUrl&&(!settings.groupExpiresAt||now<Date.parse(`${settings.groupExpiresAt}T23:59:59.999+08:00`)));
}
export function communityGroupAllowed(settings,user){
  return Boolean(user&&(['admin','editor'].includes(user.role)||settings.groupAudience==='signed-in'||row("SELECT id FROM entitlements WHERE user_id=? AND status='active' AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now')) LIMIT 1",[user.id])));
}
// Uploaded community images reuse private CMS assets; never expose the upload folder.
export function validCommunityImage(url){
  const match=String(url||'').match(/^\/api\/materials\/(\d+)$/);
  if(!match)return true;
  const asset=row('SELECT * FROM assets WHERE id=? AND url=?',[Number(match[1]),url]);
  if(!asset||asset.size_bytes>5*1024*1024)return false;
  const ext=path.extname(asset.filename).toLowerCase();
  if(!['.png','.jpg','.jpeg','.webp'].includes(ext))return false;
  let fd;
  try{
    fd=openSync(path.join(`${config.uploadDir}-private`,path.basename(asset.filename)),'r');
    const bytes=Buffer.alloc(12);if(readSync(fd,bytes,0,12,0)<12)return false;
    if(ext==='.png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if(ext==='.webp')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  }catch{return false;}finally{if(fd!==undefined)closeSync(fd);}
}
export function communityAssetAllowed(asset,user){
  if(!user||!row("SELECT name FROM sqlite_master WHERE type='table' AND name='community_records'"))return false;
  return rows('SELECT kind,published_json FROM community_records WHERE archived=0 AND published_json IS NOT NULL').some(r=>{
    const data=JSON.parse(r.published_json);
    if(r.kind==='article')return data.coverUrl===asset.url;
    return data.heroImage===asset.url||(data.qrUrl===asset.url&&communityGroupReady(data)&&communityGroupAllowed(data,user));
  });
}
