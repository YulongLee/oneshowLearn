import {api,getToken} from './api.js';
const CHUNK=4*1024*1024,MAX=1024*1024*1024;
const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
export async function uploadAsset(file,{onProgress=()=>{},signal}={}){
 if(!file.size||file.size>MAX)throw Error('单文件需为 1 字节至 1GB。');
 const token=getToken(),active=()=>{if(signal?.aborted)throw Error('上传已停止；重新选择同一文件可恢复。');if(getToken()!==token)throw Error('账号已变化，已停止上传。请重新登录后重试。');};
 const request=async(route,options={})=>{active();const result=await api(route,{...options,signal});active();return result;};
 const chunks=[];
 for(let offset=0;offset<file.size;offset+=CHUNK){active();chunks.push(await digest(file.slice(offset,offset+CHUNK)));onProgress({phase:'checking',percent:Math.round(Math.min(offset+CHUNK,file.size)/file.size*100)});}
 let session=await request('/admin/uploads',{method:'POST',body:JSON.stringify({name:file.name,size:file.size,mime:file.type,chunks})});
 const retry=async action=>{for(let n=0;;n++){try{return await action();}catch(e){active();if(n===2||![0,408,429,500,502,503,504].includes(e.status||0))throw e;await new Promise(r=>setTimeout(r,750*(n+1)));}}};
 for(let index=Math.floor(session.received/CHUNK);index<chunks.length&&session.state==='uploading';index++){
  session=await retry(()=>request(`/admin/uploads/${session.id}/chunks/${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(index*CHUNK,(index+1)*CHUNK)}));
  onProgress({phase:'uploading',percent:Math.round(session.received/file.size*100)});
 }
 for(let n=0;n<600;n++){
  active();if(session.state==='completed')return session.asset;
  onProgress({phase:'finalizing',percent:100});
  try{session=await request(`/admin/uploads/${session.id}/complete`,{method:'POST',body:'{}'});}catch(e){if(![0,408,500,502,503,504].includes(e.status||0))throw e;session=await retry(()=>request(`/admin/uploads/${session.id}`));if(session.state==='uploading')throw Error('云端整理未完成，已保留分片；重新选择同一文件可恢复。');}
  if(session.state==='completed')return session.asset;
  await new Promise(r=>setTimeout(r,2000));session=await retry(()=>request(`/admin/uploads/${session.id}`));
 }
 throw Error('附件仍在云端整理；稍后重新选择同一文件核对。不要重复创建其他上传。');
}
