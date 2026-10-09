import {lookup} from 'node:dns/promises';
import {inflateRawSync} from 'node:zlib';
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
const uploadHosts=new Set(['mineru.oss-cn-shanghai.aliyuncs.com']);
const resultHosts=new Set(['cdn-mineru.openxlab.org.cn','mineru.oss-cn-shanghai.aliyuncs.com']);
export function mineruURL(value,kind){
 const url=new URL(value),hosts=kind==='upload'?uploadHosts:resultHosts;
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!hosts.has(url.hostname)||url.hash)throw Error('MinerU 返回了未许可的地址');return url;
}
function publicAddress(a){return isIP(a)===4&&!/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|22[4-9]|23\d|24\d|25[0-5])\./.test(a);}
export async function limitedBody(response,max){
 if(!response.ok)throw Error('MinerU 请求未成功');
 if(Number(response.headers.get('content-length')||0)>max)throw Error('解析结果超出安全读取上限');
 const chunks=[];let size=0;try{for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('解析结果超出安全读取上限');chunks.push(chunk);}}catch(e){await response.body?.cancel?.().catch(()=>{});throw e;}return Buffer.concat(chunks);
}
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Read only full.md, never extract paths, images or executable content onto disk.
export function markdownFromZip(bytes){
 if(bytes.length>40*1024*1024)throw Error('结果压缩包过大');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('不支持此解析压缩包');
 const count=bytes.readUInt16LE(end+10),directory=bytes.readUInt32LE(end+16),length=bytes.readUInt32LE(end+12);
 if(count>2000||count===65535||directory+length>end)throw Error('压缩包索引无效');
 let pos=directory,selected;
 for(let n=0;n<count;n++){
  if(pos+46>end||bytes.readUInt32LE(pos)!==0x02014b50)throw Error('压缩包目录损坏');
  const nameLen=bytes.readUInt16LE(pos+28),next=pos+46+nameLen+bytes.readUInt16LE(pos+30)+bytes.readUInt16LE(pos+32);
  if(next>directory+length)throw Error('压缩包目录损坏');
  const name=bytes.subarray(pos+46,pos+46+nameLen).toString('utf8');
  if(/(^|\/)full\.md$/.test(name)){
   if(selected||name.split('/').some(s=>s==='..')||name.startsWith('/')||name.includes('\\'))throw Error('正文不唯一或路径无效');
   selected={flags:bytes.readUInt16LE(pos+8),method:bytes.readUInt16LE(pos+10),crc:bytes.readUInt32LE(pos+16),compressed:bytes.readUInt32LE(pos+20),size:bytes.readUInt32LE(pos+24),offset:bytes.readUInt32LE(pos+42)};
  }pos=next;
 }
 if(!selected||selected.flags&1||selected.size>2*1024*1024||selected.compressed>10*1024*1024||![0,8].includes(selected.method))throw Error('未找到可安全读取的 Markdown');
 const o=selected.offset;if(o+30>directory||bytes.readUInt32LE(o)!==0x04034b50)throw Error('正文索引损坏');
 const start=o+30+bytes.readUInt16LE(o+26)+bytes.readUInt16LE(o+28);if(start+selected.compressed>directory)throw Error('正文超出压缩包范围');
 const raw=bytes.subarray(start,start+selected.compressed),text=selected.method===8?inflateRawSync(raw,{maxOutputLength:2*1024*1024}):raw;
 if(text.length!==selected.size||crc32(text)!==selected.crc)throw Error('正文校验失败');
 const result=new TextDecoder('utf-8',{fatal:true}).decode(text).replace(/\u0000/g,'').trim();if(!result||result.length>500000)throw Error('正文为空或超过 50 万字');return result;
}
export function createMinerU({key=process.env.MINERU_API_KEY,fetcher=fetch,resolve=lookup}={}){
 if(!key)return null;
 async function api(endpoint,body){
  const response=await fetcher('https://mineru.net/api/v4/'+endpoint,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const bytes=await limitedBody(response,1024*1024);let data;try{data=JSON.parse(bytes);}catch{throw Error('MinerU 响应格式无效');}if(typeof data.code==='number'&&data.code!==0)throw Object.assign(Error('MinerU 拒绝请求，请核对密钥、额度与格式'),{definite:true});if(data.code!==0||!data.data)throw Error('MinerU 任务响应不完整');return data.data;
 }
 async function remote(url,kind,options={}){
  const u=mineruURL(url,kind),addresses=await resolve(u.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('解析服务地址不安全');
  return fetcher(u.href,{...options,redirect:'error',signal:AbortSignal.timeout(120000)});
 }
 return {
  async submit(name,id){const r=await api('file-urls/batch',{files:[{name,data_id:id}],model_version:'vlm',enable_table:true,enable_formula:true,language:'ch'});if(!/^[\w-]{1,128}$/.test(r.batch_id||'')||r.file_urls?.length!==1)throw Error('任务响应无效');mineruURL(r.file_urls[0],'upload');return {batchId:r.batch_id,uploadUrl:r.file_urls[0]};},
  async upload(url,stream,size){const r=await remote(url,'upload',{method:'PUT',body:Readable.toWeb(stream),duplex:'half',headers:{'Content-Length':String(size)}});await r.body?.cancel();if(!r.ok)throw Error('附件上传未成功');},
  async poll(batchId,id){const r=await api('extract-results/batch/'+encodeURIComponent(batchId));if(!Array.isArray(r.extract_result))throw Error('查询响应无效');const item=r.extract_result.find(i=>i.data_id===id);if(!item)throw Error('未返回匹配的文件任务');if(item.state==='done'){const response=await remote(item.full_zip_url,'result');return {state:'review',body:markdownFromZip(await limitedBody(response,40*1024*1024))};}if(item.state==='failed')return {state:'failed',error:'解析失败，请检查格式、页数及额度'};if(!['pending','running','converting','waiting-file'].includes(item.state))throw Error('任务状态未知');return {state:'running'};}
 };
}
