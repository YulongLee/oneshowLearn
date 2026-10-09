import {statfsSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {verifyBackup} from '../deploy/portable/manage.mjs';

// Read-only operator check. No database opens, credentials, provider operations,
// backup creation, cleanup, service restart or automatic recovery.
export async function inspectOperations({origin,dataDirectory,backupDirectory,maxBackupAgeHours=48,fetcher=fetch,diskStats=statfsSync,now=Date.now()}){
 const url=new URL(origin);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Use an HTTPS origin or explicit loopback HTTP origin');
 if(!Number.isFinite(maxBackupAgeHours)||maxBackupAgeHours<=0||maxBackupAgeHours>8760)throw Error('Invalid backup age');
 const checks=[];
 try{
  const response=await fetcher(new URL('/api/ready',url),{redirect:'error',signal:AbortSignal.timeout(5000)});
  let size=0,text='';const reader=response.body?.getReader();if(!reader)throw Error('Missing response');
  const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();throw Error('Oversized response');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
  const body=JSON.parse(text),ok=response.status===200&&body.ok===true&&body.service==='oneshowlearn-api';
  checks.push({id:'readiness',ok,message:ok?'API 与数据库只读就绪检查通过':'服务就绪检查未通过'});
 }catch{checks.push({id:'readiness',ok:false,message:'无法确认服务就绪，请检查服务与连接'});}
 if(dataDirectory)try{
  if(!path.isAbsolute(dataDirectory)||!statSync(dataDirectory).isDirectory())throw Error('Invalid data directory');
  const disk=diskStats(dataDirectory,{bigint:true}),remaining=Number(disk.bavail)/Number(disk.blocks);
  const ok=Number.isFinite(remaining)&&remaining>=.10;
  checks.push({id:'disk',ok,message:ok?'数据所在磁盘可用空间不少于 10%':'数据所在磁盘可用空间低于 10% 或无法确认'});
 }catch{checks.push({id:'disk',ok:false,message:'无法读取数据所在磁盘，请核对目录与权限'});}
 else checks.push({id:'disk',ok:false,message:'未指定数据目录，尚未检查磁盘'});
 if(backupDirectory)try{
  const manifest=verifyBackup(backupDirectory),created=typeof manifest.createdAt==='string'?Date.parse(manifest.createdAt):NaN;
  if(!Number.isFinite(created)){checks.push({id:'backup',ok:false,message:'指定备份哈希通过，但未记录有效创建时间，尚不能确认新鲜度'});return {ok:false,checks};}
  const age=now-created,ok=age>=-60000&&age<=maxBackupAgeHours*3600000;
  checks.push({id:'backup',ok,message:ok?'指定备份文件哈希及新鲜度检查通过':'指定备份哈希通过，但时间超出检查范围'});
 }catch{checks.push({id:'backup',ok:false,message:'指定备份校验未通过：请核对格式、完整性与权限'});}
 else checks.push({id:'backup',ok:false,message:'未指定受支持的备份目录，尚未检查备份'});
 return {ok:checks.every(c=>c.ok),checks};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {values}=parseArgs({options:{origin:{type:'string'},'data-dir':{type:'string'},'backup-dir':{type:'string'},'max-backup-age-hours':{type:'string',default:'48'}}});
  const result=await inspectOperations({origin:values.origin,dataDirectory:values['data-dir'],backupDirectory:values['backup-dir'],maxBackupAgeHours:Number(values['max-backup-age-hours'])});
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
 }catch{console.error('检查参数无效。请提供 --origin，并按需指定 --data-dir、--backup-dir；不会执行任何写入操作。');process.exitCode=1;}
}
