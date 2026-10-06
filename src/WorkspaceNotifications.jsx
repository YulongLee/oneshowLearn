import {useEffect,useState} from 'react';
import {api} from './api.js';
import './functional-hardening.css';
export function WorkspaceNotifications({identity,navigate}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setData(null);setError('');if(identity)api('/notifications').then(d=>active&&setData(d)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[identity,retry]);
 const open=async n=>{setBusy(true);try{await api('/notifications/read',{method:'POST',body:JSON.stringify({key:n.key})});navigate(n.path);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="ws-popover ws-account-menu" aria-label="通知"><strong>学习通知{data?.unread>0?' · '+data.unread+' 条未读':''}</strong>{!identity?<p>登录后查看本人客服回复与官方更新。</p>:error?<p role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试</button></p>:!data?<p role="status">正在读取通知…</p>:<>{!data.items.length?<p>暂无官方更新或客服回复。</p>:data.items.map(n=><button disabled={busy} key={n.key} onClick={()=>open(n)}>{n.read?'':'• '}{n.title}<small>{n.createdAt.slice(0,10)}</small></button>)}<small>{data.scope}；已读仅代表查看，不代表售后已完成。</small></>}</section>;
}
