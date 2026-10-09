import {useEffect,useState} from 'react';
import {api} from './api.js';
import './commercial-admin.css';
export function CourseCertificates({user}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');if(user)api('/me/certificates').then(d=>active&&setData(d)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[user?.id,retry]);
 const download=async c=>{if(busy)return;setBusy(c.id);setError('');try{const d=await api('/me/certificates/'+c.id+'/document'),url=URL.createObjectURL(new Blob([d.html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='OneShowLearn-结业证书-'+c.id+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){setError(e.message);}finally{setBusy('');}};
 if(!user)return null;
 return <section className="ca-certificates" aria-label="课程结业证书"><h2>我的课程结业证书</h2><p>完成全部正式课时后自动发放，保留你的课程学习里程碑。</p>{error?<p role="alert">{error} <button onClick={()=>setRetry(v=>v+1)}>重新加载</button></p>:!data?<p role="status">正在读取证书…</p>:<>{data.items.map(c=><article key={c.id}><div><strong>{c.course_title}</strong><small>{c.recipient} · {c.issued_at.slice(0,10)} · {c.revoked_at?'已撤销':'已颁发'}</small><small>编号：{c.id}</small>{c.reason&&<small>{c.reason}</small>}</div><button disabled={Boolean(busy)||Boolean(c.revoked_at)} onClick={()=>download(c)}>{busy===c.id?'正在准备…':'下载证书'}</button></article>)}{!data.items.length&&<p>{data.courses.length?'完成以下课程即可获得结业证书。':'课程结业证书将在正式教学目录确认后开放。'}</p>}{data.courses.filter(c=>!data.items.some(i=>i.pack_id===c.pack_id)).map(c=><p key={c.pack_id}>{c.title} · {c.reason}{c.total?' · '+c.completed+'/'+c.total+' 节':''}</p>)}<small>下载后打开证书文件，可打印或保存为 PDF。证书与个人成果记录分别保存。</small></>}</section>;
}
