import {useEffect,useState} from 'react';
import {ArrowRight,Receipt} from '@phosphor-icons/react';
import {api,money} from './api.js';
import {accountOrderMatches,accountOrderPath,accountOrderState} from './account-center-model.js';

export function AccountOrders({navigate}) {
  const [items,setItems]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[filter,setFilter]=useState('all');
  useEffect(()=>{let active=true;setItems(null);setError('');api('/commerce/orders').then(data=>{if(active)setItems(data.items||[]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry]);
  const visible=(items||[]).filter(order=>accountOrderMatches(order,filter));
  return <><header className="as-panel-heading"><div><h2>我的订单</h2><p>查看当前账号最近 20 笔在线支付订单。</p></div><span className="as-muted-badge">仅自己可见</span></header>
    <nav className="as-order-filters" aria-label="筛选订单状态">{[['all','全部'],['pending','待支付'],['paid','已支付'],['closed','已关闭 / 退款']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</nav>
    {error?<div className="as-error" role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重新加载</button></div>:items===null?<p className="as-loading" role="status">正在读取订单…</p>:!visible.length?<div className="as-orders-empty"><Receipt size={36}/><h3>{items.length?'暂无此状态的订单':'还没有在线支付订单'}</h3><p>{items.length?'试试其他状态筛选。':'购买后可在这里查看付款状态与订单记录。'}</p>{!items.length&&<button onClick={()=>navigate('/membership')}>查看课程与权益<ArrowRight size={16}/></button>}</div>:<div className="as-order-list">{visible.map(order=>{const state=accountOrderState(order),path=accountOrderPath(order);return <article className="as-order-card" key={order.id}><div className="as-order-icon"><Receipt size={24}/></div><div className="as-order-content"><div className="as-order-title"><h3>{order.title}</h3><span className={`as-status as-status-${state.tone}`}>{state.label}</span></div><p>订单号：{order.orderNo}</p><small>{order.provider==='wechat'?'微信支付':order.provider==='alipay'?'支付宝':'支付渠道待确认'}</small></div><div className="as-order-action"><strong>{money(order.amountCents)}</strong><button disabled={!path} onClick={()=>path&&navigate(path)}>查看订单<ArrowRight size={15}/></button></div></article>;})}</div>}
    <div className="as-order-note">付款与课程开通以服务器核验结果为准。订单查询不会自动发起付款；历史人工确认订单不包含在此列表中。</div>
    <div className="as-support-link"><span>付款、课程访问或退款申请有问题？</span><button onClick={()=>navigate('/support')}>帮助与售后<ArrowRight size={15}/></button></div>
  </>;
}
