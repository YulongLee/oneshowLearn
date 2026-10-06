import {useEffect,useState} from 'react';
import {ArrowRight,Receipt} from '@phosphor-icons/react';
import {api,money} from './api.js';
import {accountOrderMatches,accountOrderPath,accountOrderState} from './account-center-model.js';

export function AccountOrders({navigate}) {
  const [items,setItems]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[filter,setFilter]=useState('all'),[offset,setOffset]=useState(0),[total,setTotal]=useState(0),[query,setQuery]=useState('');
  useEffect(()=>{let active=true;setItems(null);setError('');const timer=setTimeout(()=>api(`/me/orders?offset=${offset}&status=${filter}&q=${encodeURIComponent(query)}`).then(data=>{if(active){setItems(data.items||[]);setTotal(data.total||0);}}).catch(e=>{if(active)setError(e.message);}),200);return()=>{active=false;clearTimeout(timer);};},[retry,offset,filter,query]);
  const visible=(items||[]).filter(order=>accountOrderMatches(order,filter));
  return <><header className="as-panel-heading"><div><h2>我的订单</h2><p>查看当前账号的订单与退款登记，每页 20 笔；按订单号查找历史记录。</p></div><span className="as-muted-badge">仅自己可见</span></header>
    <label className="wsp-search">订单号<input aria-label="搜索历史订单号" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}} placeholder="输入订单号…"/></label>
    <nav className="as-order-filters" aria-label="筛选订单状态">{[['all','全部'],['pending','待支付'],['paid','已支付'],['closed','已关闭 / 退款']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setOffset(0);}}>{label}</button>)}</nav>
    {error?<div className="as-error" role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重新加载</button></div>:items===null?<p className="as-loading" role="status">正在读取订单…</p>:!visible.length?<div className="as-orders-empty"><Receipt size={36}/><h3>{query||filter!=='all'?'没有匹配的订单':'还没有订单'}</h3><p>{query||filter!=='all'?'试试其他订单号或状态筛选。':'购买后可在这里查看付款状态与订单记录。'}</p>{!query&&filter==='all'&&!items.length&&<button onClick={()=>navigate('/membership')}>查看课程与权益<ArrowRight size={16}/></button>}</div>:<div className="as-order-list">{visible.map(order=>{const state=accountOrderState(order),path=accountOrderPath(order);return <article className="as-order-card" key={order.id}><div className="as-order-icon"><Receipt size={24}/></div><div className="as-order-content"><div className="as-order-title"><h3>{order.title}</h3><span className={`as-status as-status-${state.tone}`}>{state.label}</span></div><p>订单号：{order.orderNo}</p><small>{order.provider==='wechat'?'微信支付':order.provider==='alipay'?'支付宝':'历史人工确认订单'}</small></div><div className="as-order-action"><strong>{money(order.amountCents)}</strong>{order.refundedCents>0&&<small>已登记退回 {money(order.refundedCents)}</small>}<button disabled={!path} onClick={()=>path&&navigate(path)}>查看订单<ArrowRight size={15}/></button></div></article>;})}</div>}
    {total>20&&<nav className="as-order-filters" aria-label="订单分页"><button disabled={items===null||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-20))}>上一页</button><span>{Math.floor(offset/20)+1} / {Math.ceil(total/20)} 页 · {total} 笔</span><button disabled={items===null||offset+20>=total} onClick={()=>setOffset(v=>v+20)}>下一页</button></nav>}
    <div className="as-order-note">付款与课程开通以服务器核验结果为准。订单查询不会自动发起付款；人工确认订单可通过帮助与售后核对；退款金额为管理员核实后登记。</div>
    <div className="as-support-link"><span>付款、课程访问或退款申请有问题？</span><button onClick={()=>navigate('/support')}>帮助与售后<ArrowRight size={15}/></button></div>
  </>;
}
