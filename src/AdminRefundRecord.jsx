import {useEffect,useRef,useState} from 'react';
import {api,money} from './api.js';

export function AdminRefundRecord({orderId,close,onSaved}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const blank=()=>({amount:'',providerReference:'',returnedAt:'',verificationNote:'',rightsAction:'keep',confirmedExternal:false});
 const [draft,setDraft]=useState(blank),key=useRef(crypto.randomUUID()),sending=useRef(false);
 const dirty=Boolean(draft.amount||draft.providerReference||draft.returnedAt||draft.verificationNote||draft.confirmedExternal||draft.rightsAction!=='keep');
 const load=async()=>{try{const d=await api(`/admin/refunds/${orderId}`);setData(d);setError('');}catch(e){setError(e.message);}};
 useEffect(()=>{load();},[orderId]);
 useEffect(()=>{const guard=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);window.addEventListener('oneshowlearn:before-navigate',guard);return()=>{window.removeEventListener('beforeunload',guard);window.removeEventListener('oneshowlearn:before-navigate',guard);};},[dirty,busy]);
 const dismiss=()=>{if(!busy&&(!dirty||window.confirm('关闭会丢弃未提交的退款登记，是否继续？')))close();};
 const change=(field,value)=>{setDraft(d=>({...d,[field]:value}));key.current=crypto.randomUUID();};
 const submit=async e=>{
  e.preventDefault();if(sending.current||!data)return;
  if(!/^\d+(?:\.\d{1,2})?$/.test(draft.amount)){setError('退款金额需为正数，最多两位小数。');return;}
  if(!window.confirm('确认已在支付平台核实款项实际退回？本操作只登记结果，不会执行退款。'))return;
  sending.current=true;setBusy(true);setError('');
  try{await api(`/admin/refunds/${orderId}`,{method:'POST',headers:{'If-Match':data.version},body:JSON.stringify({requestKey:key.current,amountCents:Math.round(Number(draft.amount)*100),providerReference:draft.providerReference,returnedAt:new Date(draft.returnedAt).toISOString(),verificationNote:draft.verificationNote,rightsAction:draft.rightsAction,confirmedExternal:draft.confirmedExternal})});setDraft(blank());key.current=crypto.randomUUID();await load();onSaved?.();}catch(e){setError(e.message+'；填写内容已保留。');}finally{sending.current=false;setBusy(false);}
 };
 return <section className="admin-panel hardening-panel" aria-label="人工退款结果登记"><div className="admin-section-title"><h2>核实外部退款后登记</h2><button disabled={busy} onClick={dismiss}>关闭</button></div><p>此操作不会向支付平台发起退款。客服处理完成不代表资金退回；仅管理员在平台核实后登记。</p>{error&&<p role="alert" className="admin-error">{error}<button disabled={busy} onClick={load}>重新读取（保留输入）</button></p>}{!data?<p>正在读取订单…</p>:<><p>订单 {data.order.order_no} · 原金额 {money(data.order.amount_cents)} · 已登记退回 {money(data.refundedCents)}</p>{data.records.map(r=><p key={r.id}>#{r.id} · {money(r.amount_cents)} · {r.returned_at} · {r.rights_action==='keep'?'保留权益':'仅处理本订单权益'} · 操作人 #{r.actor_id}</p>)}{data.order.status==='paid'&&<form onSubmit={submit}><fieldset disabled={busy}><label>本次实际退回金额（元）<input inputMode="decimal" required value={draft.amount} onChange={e=>change('amount',e.target.value)}/></label><label>实际退款流水<input required minLength={6} maxLength={128} value={draft.providerReference} onChange={e=>change('providerReference',e.target.value)}/></label><label>实际到账时间<input type="datetime-local" required value={draft.returnedAt} onChange={e=>change('returnedAt',e.target.value)}/></label><label>核验依据（不得填写密码、密钥）<textarea required minLength={10} maxLength={2000} rows={3} value={draft.verificationNote} onChange={e=>change('verificationNote',e.target.value)}/></label><label>权益处理<select value={draft.rightsAction} onChange={e=>change('rightsAction',e.target.value)}><option value="keep">保留权益（部分退款或来源待核实）</option><option value="revoke-order" disabled={!data.rights.length||data.rights.some(r=>!r.tracked)}>全额退款后仅收回本订单授权</option></select></label><p>历史未记录来源的订单不能自动收回。其他有效订单或人工授权不应被撤销。</p><label className="admin-check"><input type="checkbox" required checked={draft.confirmedExternal} onChange={e=>change('confirmedExternal',e.target.checked)}/>我已核实资金实际退回，非仅审批通过</label><button className="admin-primary">{busy?'正在登记…':'登记已核实退款'}</button></fieldset></form>}</>}</section>;
}
