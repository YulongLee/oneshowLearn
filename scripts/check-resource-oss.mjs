// Creates only the OneShowLearn folder marker and a disposable round-trip probe.
// Reads the owner's supplied env without printing or persisting any credentials.
import OSS from 'ali-oss';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {createAssetStorage,ossSettings} from '../server/asset-storage.mjs';

async function main(){
  const source=process.argv[2];
  if(!source)throw new Error('Pass the owner-provided env file path');
  const supplied=parseEnv(await readFile(source,'utf8'));
  const env={ASSET_STORAGE:'oss',OSS_KEY_PREFIX:'oneshowlearn/resources/'};
  for(const name of ['BUCKET','REGION','ENDPOINT','ACCESS_KEY_ID','ACCESS_KEY_SECRET'])env[`OSS_${name}`]=supplied[`OFFERSTEADY_OSS_${name}`];
  const settings=ossSettings(env),storage=createAssetStorage(env);
  const client=new OSS({...settings,region:`oss-${settings.region}`,secure:true,timeout:60000});
  const marker=settings.prefix;
  let exists=false;
  try{await client.head(marker);exists=true;}catch(e){if(e.code!=='NoSuchKey')throw e;}
  if(!exists)await client.put(marker,Buffer.alloc(0),{headers:{'x-oss-object-acl':'private','x-oss-forbid-overwrite':'true'}});
  const file=new URL('../docs/resource-oss.md',import.meta.url);
  const contents=await readFile(file);
  let location;
  try{
    location=await storage.put({filename:`${randomUUID()}.txt`,path:file.pathname});
    const full=await storage.open(location);const chunks=[];for await(const chunk of full.stream)chunks.push(chunk);
    const actual=Buffer.concat(chunks);
    if(createHash('sha256').update(actual).digest('hex')!==createHash('sha256').update(contents).digest('hex'))throw new Error('Round-trip checksum failed');
    const partial=await storage.open(location,{range:'bytes=0-9'});const parts=[];for await(const chunk of partial.stream)parts.push(chunk);
    if(partial.res.status!==206||!Buffer.concat(parts).equals(contents.subarray(0,10)))throw new Error('Range check failed');
    const anonymous=await fetch(`https://${settings.bucket}.oss-${settings.region}.aliyuncs.com/${location.object_key}`,{method:'HEAD'});
    if(anonymous.status!==403)throw new Error('Private access check failed');
    console.log(JSON.stringify({folder:`oss://${settings.bucket}/${marker}`,created:!exists,uploadDownloadChecksum:'passed',range:'passed',anonymousAccess:'denied'}));
  }finally{if(location)await storage.remove(location);}
}
main().catch(error=>{console.error('OSS check failed:',error.code||error.name);process.exitCode=1;});
