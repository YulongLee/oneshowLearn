import OSS from 'ali-oss';
import {open} from 'node:fs/promises';

export function ossSettings(env=process.env) {
  const provider=env.ASSET_STORAGE||'local';
  if(provider==='local')return null;
  if(provider!=='oss')throw new Error('ASSET_STORAGE must be local or oss');
  const bucket=env.OSS_BUCKET,region=String(env.OSS_REGION||'').replace(/^oss-/,''),endpoint=env.OSS_ENDPOINT;
  const prefix=env.OSS_KEY_PREFIX||'oneshowlearn/resources/';
  if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket||'')||!/^cn-[a-z0-9-]+$/.test(region)||endpoint!==`https://oss-${region}.aliyuncs.com`||!/^oneshowlearn\/(?:[a-z0-9_-]+\/)+$/.test(prefix)||!env.OSS_ACCESS_KEY_ID||!env.OSS_ACCESS_KEY_SECRET)throw new Error('Incomplete or unsafe OSS configuration');
  return {bucket,region,endpoint,prefix,accessKeyId:env.OSS_ACCESS_KEY_ID,accessKeySecret:env.OSS_ACCESS_KEY_SECRET};
}

export async function fileHeader(filename) {
  const file=await open(filename,'r');
  try{const bytes=Buffer.alloc(12);const {bytesRead}=await file.read(bytes,0,12,0);return bytes.subarray(0,bytesRead).toString('hex');}finally{await file.close();}
}

export function createAssetStorage(env=process.env,clientOverride) {
  const settings=ossSettings(env);
  if(!settings)return null;
  const {bucket,region,endpoint,prefix}=settings;
  const client=clientOverride||new OSS({...settings,region:`oss-${region}`,secure:true,timeout:60000});
  function validate(location){
    if(location.bucket!==bucket||location.endpoint!==endpoint||!location.object_key.startsWith(prefix)||location.object_key.includes('..'))throw new Error('OSS asset location does not match configured project storage');
  }
  return {
    info:{provider:'oss',bucket,prefix,region},
    async put(file){
      if(!/^[a-f0-9-]+\.[a-z0-9]+$/.test(file.filename))throw new Error('Invalid asset filename');
      const key=file.checkpoint?.name||`${prefix}${new Date().toISOString().slice(0,7)}/${file.filename}`;
      if(!key.startsWith(prefix)||key.includes('..')||!key.endsWith('/'+file.filename))throw new Error('Invalid resumed asset key');
      const header_hex=await fileHeader(file.path);
      const headers={'x-oss-object-acl':'private','x-oss-forbid-overwrite':'true','Content-Type':'application/octet-stream',...(file.manifestDigest?{'x-oss-meta-manifest':file.manifestDigest}:{})};
      let result;
      try{result=file.size>50*1024*1024?await client.multipartUpload(key,file.path,{headers,mime:'application/octet-stream',partSize:8*1024*1024,parallel:2,checkpoint:file.checkpoint||undefined,progress:async(_fraction,checkpoint)=>{if(checkpoint)await file.saveCheckpoint?.(checkpoint);}}):await client.put(key,file.path,{headers});}
      catch(error){
        // A lost completion response is not permission to overwrite an object.
        // Recover only this immutable session's exact content manifest and size.
        if(!file.manifestDigest)throw error;
        let head;try{head=await client.head(key);}catch{throw error;}
        const h=head.res?.headers||{};
        if(h['x-oss-meta-manifest']!==file.manifestDigest||Number(h['content-length'])!==file.size)throw error;
        result=head;
      }
      return {provider:'oss',bucket,endpoint,object_key:key,etag:result.res?.headers?.etag||'',header_hex};
    },
    async remove(location){validate(location);await client.delete(location.object_key);},
    async abortCheckpoint(checkpoint){if(!checkpoint?.uploadId)return;validate({bucket,endpoint,object_key:checkpoint.name||''});try{await client.abortMultipartUpload(checkpoint.name,checkpoint.uploadId);}catch(e){if(e.code!=='NoSuchUpload')throw e;}},
    async open(location,{range,head=false}={}){
      validate(location);
      if(head){await client.head(location.object_key);return null;}
      return client.getStream(location.object_key,{headers:range?{Range:range}:{}});
    }
  };
}

// A single normalized byte range supports seeking without unbounded/multipart requests.
export function materialRange(header,size){
  if(!header)return null;
  const match=String(header).match(/^bytes=(\d*)-(\d*)$/);
  if(!match||(!match[1]&&!match[2])||size<=0)return false;
  let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  let end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start> end||start>=size||(!match[1]&&Number(match[2])===0))return false;
  return {start,end,length:end-start+1,header:`bytes=${start}-${end}`};
}
