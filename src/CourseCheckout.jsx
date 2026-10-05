import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import {api,money} from './api.js';
import {Modal} from './PersonalShared.jsx';
import {officialAlipayUrl} from './payment-navigation.js';
import {ServiceLinks} from './ServiceLinks.jsx';
export function CourseCheckout({offer,close,onPaid,initialOrderId=null}){
  const [channel,setChannel]=useState(offer.channels.find(c=>c.available)?.id||'wechat'),[order,setOrder]=useState(null),[orders,setOrders]=useState([]),[busy,setBusy]=useState(false),[busyAction,setBusyAction]=useState(''),[error,setError]=useState(''),[qrResult,setQrResult]=useState(null);
  // Never display the previous channel's image while a new QR is being encoded.
  const qr=qrResult?.url===order?.qrUrl?qrResult?.data||'':'';
  const key=useRef(crypto.randomUUID()),sending=useRef(false),paid=useRef(false);
  const switchRequest=useRef(null),retryRequest=useRef(null),generation=useRef(0);
  const [restoring,setRestoring]=useState(Boolean(initialOrderId));
  const isPage=order?.paymentFlow==='page';
  const history=async()=>{const d=await api('/commerce/orders');setOrders(d.items);};
  useEffect(()=>{history().catch(e=>setError(e.message));},[]);
  useEffect(()=>{if(!initialOrderId)return;let active=true;setRestoring(true);
    (async()=>{try{let d=await api(`/commerce/orders/${initialOrderId}`);if(active)setOrder(d);if(d.status==='pending'&&d.needsQuery)d=await api(`/commerce/orders/${initialOrderId}/sync`,{method:'POST'});if(active){setOrder(d);setChannel(d.provider);if(d.message)setError(d.message);}}
    catch(e){if(active)setError(e.message);}finally{if(active)setRestoring(false);}})();return()=>{active=false;};
  },[initialOrderId]);
  useEffect(()=>{let active=true;setQrResult(null);if(order?.qrUrl)QRCode.toDataURL(order.qrUrl,{width:240,margin:2,errorCorrectionLevel:'M'}).then(data=>{if(active)setQrResult({url:order.qrUrl,data});}).catch(()=>active&&setError('二维码生成失败，请稍后重新打开订单'));return()=>{active=false;};},[order?.qrUrl]);
  useEffect(()=>{if(order?.status!=='pending')return;let active=true;const timer=setInterval(async()=>{if(sending.current)return;const current=generation.current;try{const d=await api(`/commerce/orders/${order.id}`);if(active&&!sending.current&&current===generation.current)setOrder(d);}catch(e){if(active&&!sending.current&&current===generation.current)setError(e.message);}},4000);return()=>{active=false;clearInterval(timer);};},[order?.id,order?.status]);
  useEffect(()=>{if(order?.status==='paid'&&!paid.current){paid.current=true;onPaid();}},[order?.status]);
  const switchPayment=async(source,provider)=>{
    if(switchRequest.current?.orderId!==source.id||switchRequest.current?.provider!==provider)switchRequest.current={orderId:source.id,provider,requestKey:crypto.randomUUID()};
    setBusyAction('switch');
    return api(`/commerce/orders/${source.id}/switch`,{method:'POST',body:JSON.stringify({provider,requestKey:switchRequest.current.requestKey,expectedAmountCents:source.amountCents})});
  };
  const action=async(type,provider=channel)=>{if(sending.current||restoring)return;sending.current=true;generation.current++;let activeOrder=order;setBusy(true);setBusyAction(type);setError('');try{
    if(type==='pay'){
      const result=await api(`/commerce/orders/${order.id}/pay`,{method:'POST',body:'{}'});
      setOrder(result);if(result.status==='paid')return;
      const url=officialAlipayUrl(result.paymentUrl);if(!url)throw new Error('支付宝收银台地址无效，请联系管理员');
      window.location.assign(url);return;
    }
    if(['retry','renew'].includes(type)&&(retryRequest.current?.orderId!==order.id||retryRequest.current?.purpose!==type))retryRequest.current={orderId:order.id,purpose:type,key:crypto.randomUUID()};
    let result=type==='renew'?await api(`/commerce/orders/${order.id}/renew`,{method:'POST',body:JSON.stringify({provider,requestKey:retryRequest.current.key,expectedAmountCents:order.amountCents})}):type==='create'||type==='retry'?await api('/commerce/checkout',{method:'POST',body:JSON.stringify({provider,requestKey:type==='retry'?retryRequest.current.key:key.current,expectedAmountCents:type==='retry'?order.amountCents:offer.priceCents})}):type==='switch'?await switchPayment(order,provider):await api(`/commerce/orders/${order.id}/${type}`,{method:'POST'});
    if(result.needsSwitch){activeOrder=result;setOrder(result);result=await switchPayment(result,provider);}
    setOrder(result);setChannel(result.provider);if(result.message)setError(result.message);await history().catch(()=>{});
  }catch(e){setError(e.message);if(activeOrder)await api(`/commerce/orders/${activeOrder.id}`).then(setOrder).catch(()=>{});await history().catch(()=>{});}finally{sending.current=false;setBusy(false);setBusyAction('');}};
  return <Modal title="课程收银台" close={()=>!busy&&close()}><div className="co-checkout">
    {restoring?<p role="status">正在恢复订单并核验支付结果，请稍候…</p>:order?<><h3>{order.title}</h3><strong className="co-checkout-amount">{money(order.amountCents)}</strong><p>订单号：{order.orderNo}</p>
      {order.status==='paid'?<div className="co-checkout-success" role="status">支付已核验，课程权限已开通。<button className="co-primary" onClick={close}>完成</button></div>:order.status==='pending'?<>
        <div className="co-payment-methods" aria-label="切换支付方式">{offer.channels.map(c=><button key={c.id} disabled={!c.available||busy} aria-pressed={order.provider===c.id} onClick={()=>c.id!==order.provider&&action('switch',c.id)}>{c.label}<small>{c.id===order.provider?'当前支付方式':c.available?'切换到此方式':'暂未开放'}</small></button>)}</div>
        {busyAction==='switch'?<div className="co-checkout-empty" role="status">正在核验旧订单并切换支付方式…<small>确认旧付款已不可继续支付后，才会创建新的订单。</small></div>:isPage?<div className="co-checkout-empty" role="status"><strong>支付宝官方收银台</strong><p>{order.expired?'订单已到期，请先核验并更新订单。':'将在支付宝官方页面完成付款，付款方式以收银台显示为准。'}</p>{!order.expired&&<button className="co-primary" disabled={busy} onClick={()=>action('pay')}>{busyAction==='pay'?'正在准备收银台…':'前往支付宝收银台 →'}</button>}{order.failureMessage&&<p role="alert">{order.failureMessage}</p>}</div>:<><p>{qr?'请使用'+(order.provider==='wechat'?'微信':'支付宝')+'扫一扫完成付款':'付款码暂不可用，请查询状态或切换支付方式'}</p>{qr&&!order.expired?<img width="240" height="240" src={qr} alt={`${order.provider==='wechat'?'微信':'支付宝'}订单付款二维码`}/>:<div className="co-checkout-empty" role={order.failureMessage?'alert':'status'}>{order.expired?'订单已到期，可查询状态或切换支付方式':order.failureMessage||'二维码暂未返回，请先查询订单状态'}</div>}</>}
        {!isPage&&!order.qrUrl&&!order.expired&&<button className="co-preview" disabled={busy} onClick={()=>action('retry',order.provider)}>{busyAction==='retry'?'正在获取付款码…':'重新获取付款码'}</button>}
        {order.expired&&<button className="co-primary" disabled={busy} onClick={()=>action('renew',order.provider)}>{busyAction==='renew'?'正在核验并更新订单…':'更新订单，继续支付'}</button>}
        <small role="status">{order.nextCheckAt?'系统会自动核验支付结果，关闭页面后仍会继续处理。':isPage&&!order.needsQuery&&!order.expired?'请前往支付宝收银台付款，完成后可返回查询。':'可点击查询确认最新支付状态。'}{order.lastCheckedAt&&` 最近核验：${new Date(order.lastCheckedAt).toLocaleTimeString('zh-CN')}`}</small>
        <small>课程只在服务器核验到账后开通；支付宝返回页面不代表付款成功。切换会先确认原付款已关闭，关闭弹窗不会取消订单。</small><div className="co-checkout-actions"><button disabled={busy} onClick={()=>action('sync')}>查询支付状态</button><button disabled={busy} onClick={()=>{if(window.confirm('确认关闭此未支付订单？已到账订单将优先核验，不会退款。'))action('close');}}>关闭未付订单</button></div>
      </>:<><p role="status">{order.attemptState==='rejected'?'支付平台未接受本次下单，尚未生成可付款交易。':`订单${order.status==='cancelled'?'已关闭':'状态已更新'}。`}</p>{order.failureMessage&&<p className="co-checkout-error" role="alert">{order.failureMessage}</p>}<div className="co-payment-methods" aria-label="重新选择支付渠道">{offer.channels.filter(c=>c.id!==order.provider).map(c=><button key={c.id} disabled={busy||!c.available} onClick={()=>action('switch',c.id)}>改用{c.label}</button>)}</div><button className="co-preview" disabled={busy} onClick={()=>action('renew',order.provider)}>重新发起此渠道支付</button></>}
      <button className="co-preview" disabled={busy} onClick={()=>{generation.current++;setOrder(null);setError('');key.current=crypto.randomUUID();}}>返回支付方式</button>
    </>:<><h3>选择支付方式</h3><strong className="co-checkout-amount">{money(offer.priceCents)}</strong><div className="co-payment-methods">{offer.channels.map(c=><button key={c.id} disabled={!c.available||busy} aria-pressed={channel===c.id} onClick={()=>{setChannel(c.id);key.current=crypto.randomUUID();}}>{c.label}<small>{!c.available?'暂未开放':c.id==='alipay'?'官方收银台付款':'微信扫码付款'}</small></button>)}</div><p>单次购买当前绑定课程，不自动续费。实付金额以服务器生成的订单为准。</p><button className="co-primary" disabled={busy||!offer.channels.find(c=>c.id===channel)?.available} onClick={()=>action('create')}>{busy?'正在创建订单…':channel==='alipay'?'创建订单，使用支付宝付款':'生成微信付款二维码'}</button></>}
    {!restoring&&order?.status!=='paid'&&<aside className="co-device-guide"><strong>{(order?.provider||channel)==='wechat'?'微信付款提示':'支付宝付款提示'}</strong><p>{(order?.provider||channel)==='wechat'?'微信当前使用订单二维码付款。电脑端请用手机微信扫一扫；若你正在同一部手机上购买，请使用另一设备展示二维码，或切换支付宝进入官方收银台。':'支付宝将跳转官方收银台，付款方式以官方页面显示为准。付款后返回此处查询，服务器确认到账后开通。'}</p></aside>}
    <ServiceLinks compact/>
    {error&&error!==order?.failureMessage&&<p role="alert" className="co-checkout-error">{error}</p>}
    {orders.length>0&&<section className="co-order-history"><h4>我的订单</h4>{orders.map(o=><button key={o.id} disabled={busy} onClick={()=>{generation.current++;setOrder(o);setChannel(o.provider);setError('');paid.current=false;}}><span>{o.title}<small>{o.orderNo}</small></span><span>{money(o.amountCents)}<small>{o.status==='paid'?'已支付':o.status==='pending'?'待支付':'已关闭'}</small></span></button>)}</section>}
  </div></Modal>;
}
