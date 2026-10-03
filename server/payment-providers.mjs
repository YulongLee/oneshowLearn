import {createDecipheriv,randomBytes,sign,verify} from 'node:crypto';
import {AlipaySdk} from 'alipay-sdk';
import {paymentError,normalizeAlipayKey} from './payment-configuration.mjs';

export function alipayClient(settings,secrets){return new AlipaySdk({appId:settings.appId,privateKey:normalizeAlipayKey(secrets.alipayPrivateKey,true),keyType:'PKCS8',alipayPublicKey:normalizeAlipayKey(settings.publicKey),signType:'RSA2',timeout:12000,endpoint:'https://openapi.alipay.com'});}
// Injection points are used only by isolated tests, never selected by request data.
export const paymentTransport={fetch:(...args)=>fetch(...args),checkoutFlow:provider=>provider==='alipay'?'page':'qr',alipay:async(s,k,route,body)=>{
  const client=paymentTransport.client(s,k);
  // The standard API verifies signed business errors as well as success. Unlike
  // curl's unverified HTTP error, a signed definite rejection can retire an attempt.
  if(route==='/v3/alipay/trade/precreate'){
    const {notify_url,...bizContent}=body;
    const result=await client.exec('alipay.trade.precreate',{notifyUrl:notify_url,bizContent},{validateSign:true});
    if(result.code!=='10000'){
      const error=Object.assign(paymentError(502,'支付宝未接受下单'),{providerCode:result.subCode||result.code,verifiedResponse:true});
      error.noPaymentCreated=['ACQ.ACCESS_FORBIDDEN','isv.insufficient-isv-permissions','ACQ.INVALID_PARAMETER','ACQ.PARTNER_ERROR','isv.invalid-app-id','isv.invalid-signature'].includes(error.providerCode);
      throw error;
    }
    return {out_trade_no:result.outTradeNo,qr_code:result.qrCode};
  }
  return (await client.curl('POST',route,{body})).data;
}};
paymentTransport.client=alipayClient;
// Local signing only: no gateway request, and not evidence that a trade exists.
export function alipayPagePayment(c,order){
  if(order.provider!=='alipay'||order.payment_flow!=='page'||order.status!=='pending'||Date.parse(order.expires_at)<=Date.now())throw paymentError(409,'订单不可发起支付宝付款，请查询状态或重新购买');
  const expires=new Date(Date.parse(order.expires_at)+8*3600000).toISOString().slice(0,19).replace('T',' ');
  const url=paymentTransport.client(c.settings.alipay,c.secrets).pageExecute('alipay.trade.page.pay','GET',{
    notifyUrl:`${c.settings.publicOrigin}/api/payments/notify/alipay/${c.version}`,
    returnUrl:`${c.settings.publicOrigin}/membership?paymentReturn=${order.id}`,
    bizContent:{out_trade_no:order.order_no,product_code:'FAST_INSTANT_TRADE_PAY',seller_id:c.settings.alipay.sellerId,total_amount:(order.amount_cents/100).toFixed(2),subject:order.title.slice(0,128),time_expire:expires}
  });
  const target=new URL(url);
  if(target.origin!=='https://openapi.alipay.com'||target.pathname!=='/gateway.do'||target.username||target.password||target.hash||target.searchParams.get('method')!=='alipay.trade.page.pay')throw paymentError(502,'支付宝收银台地址无效');
  return target.href;
}
// SDK v3 throws HTTP business errors before verifying their response signatures.
// A channel switch requires a second, signed read-only query before trusting absence.
paymentTransport.alipayConfirmMissing=async(s,k,orderNo)=>alipayClient(s,k).exec('alipay.trade.query',{bizContent:{outTradeNo:orderNo}},{validateSign:true});
export function verifyWechat(raw,headers,settings){
  const get=name=>typeof headers.get==='function'?headers.get(name):headers[name.toLowerCase()];
  const timestamp=get('Wechatpay-Timestamp'),nonce=get('Wechatpay-Nonce'),signature=get('Wechatpay-Signature'),serial=get('Wechatpay-Serial');
  const fail=code=>{throw Object.assign(paymentError(400,'微信支付签名无效'),{code});};
  if(!timestamp||!nonce||!serial||!signature)fail('PAYMENT_RESPONSE_SIGNATURE_MISSING');
  if(!/^\d+$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||nonce.length>256)fail('PAYMENT_RESPONSE_SIGNATURE_FORMAT');
  if(Math.abs(Date.now()/1000-Number(timestamp))>300)fail('PAYMENT_RESPONSE_TIMESTAMP_INVALID');
  if(serial!==settings.publicKeyId)fail(serial.startsWith('PUB_KEY_ID_')?'PAYMENT_RESPONSE_KEY_ID_MISMATCH':'PAYMENT_RESPONSE_CERTIFICATE_MODE');
  if(signature.startsWith('WECHATPAY/SIGNTEST/'))fail('PAYMENT_RESPONSE_SIGNATURE_PROBE');
  if(!verify('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),settings.publicKey,Buffer.from(signature,'base64')))fail('PAYMENT_RESPONSE_SIGNATURE_INVALID');
}
async function wechatRequest(c,method,route,payload){
  const settings=c.settings.wechat,body=payload?JSON.stringify(payload):'',timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex');
  const signature=sign('RSA-SHA256',Buffer.from(`${method}\n${route}\n${timestamp}\n${nonce}\n${body}\n`),c.secrets.wechatPrivateKey).toString('base64');
  const response=await paymentTransport.fetch(`https://api.mch.weixin.qq.com${route}`,{method,headers:{'Content-Type':'application/json',Accept:'application/json','Wechatpay-Serial':settings.publicKeyId,Authorization:`WECHATPAY2-SHA256-RSA2048 mchid="${settings.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${settings.serialNo}",signature="${signature}"`},...(body?{body}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});
  const raw=await response.text();if(raw.length>128000)throw paymentError(502,'支付平台响应异常');
  // Verify raw signed bytes before trusting either a QR code or a paid status.
  try{verifyWechat(raw,response.headers,settings);}catch(error){
    // An unsigned error is never a trusted business result. Report HTTP rejection
    // separately, without accepting its body or bypassing verification for orders.
    if(error.code==='PAYMENT_RESPONSE_SIGNATURE_MISSING'&&response.status===401)error.code='PAYMENT_REQUEST_AUTH_REJECTED';
    throw error;
  }
  if(!response.ok){const error=paymentError(502,'微信支付请求未成功，请核对商户配置或稍后查询订单');const code=raw&&JSON.parse(raw).code;if(code==='ORDER_NOT_EXIST')error.orderNotFound=true;if(/^[A-Z_]{1,60}$/.test(code||''))error.providerCode=code;error.verifiedResponse=true;error.noPaymentCreated=method==='POST'&&route==='/v3/pay/transactions/native'&&['NO_AUTH','MCH_NOT_EXISTS','PARAM_ERROR','SIGN_ERROR'].includes(code);throw error;}
  return raw?JSON.parse(raw):{};
}
export function amountCents(value){if(typeof value!=='string'||!/^\d+(\.\d{1,2})?$/.test(value))throw paymentError(400,'支付金额格式无效');const [a,b='']=value.split('.');const cents=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(cents))throw paymentError(400,'支付金额超出范围');return cents;}

// Read-only probes: never create orders, QR codes, charges or entitlements.
export async function probePaymentConnection(provider,c){
  if(provider==='wechat'){
    const number=`OSLCHECK${randomBytes(12).toString('hex')}`;
    try{await wechatRequest(c,'GET',`/v3/pay/transactions/out-trade-no/${number}?mchid=${encodeURIComponent(c.settings.wechat.mchId)}`);}
    catch(error){if(error.orderNotFound)return;throw error;}
    // The random diagnostic number should never refer to a real transaction.
    throw Object.assign(new Error('Unexpected probe response'),{code:'PAYMENT_PROBE_UNEXPECTED'});
  }
  if(provider!=='alipay')throw new Error('Unsupported payment provider');
  // Official SDK's configuration verification endpoint; curl verifies signed success responses.
  // Use the official SDK's documented positive offset; zero is rejected by the live API.
  await paymentTransport.alipay(c.settings.alipay,c.secrets,'/v3/alipay/user/deloauth/detail/query',{date:'20230102',offset:20,limit:1});
}
function shortDescription(title){let result='';for(const character of title){if(Buffer.byteLength(result+character)>120)break;result+=character;}return result;}
export async function createProviderPayment(provider,c,order){
  const notify=`${c.settings.publicOrigin}/api/payments/notify/${provider}/${c.version}`;
  let url;
  if(provider==='wechat'){
    const d=await wechatRequest(c,'POST','/v3/pay/transactions/native',{appid:c.settings.wechat.appId,mchid:c.settings.wechat.mchId,description:shortDescription(order.title),out_trade_no:order.order_no,notify_url:notify,time_expire:order.expires_at.replace(/\.\d{3}Z$/,'+00:00'),amount:{total:order.amount_cents,currency:'CNY'}});url=d.code_url;
    if(typeof url!=='string'||!/^weixin:\/\/wxpay\/bizpayurl\?/.test(url))throw paymentError(502,'微信未返回有效的支付二维码');
  }else{
    const d=await paymentTransport.alipay(c.settings.alipay,c.secrets,'/v3/alipay/trade/precreate',{out_trade_no:order.order_no,seller_id:c.settings.alipay.sellerId,total_amount:(order.amount_cents/100).toFixed(2),subject:order.title.slice(0,128),notify_url:notify,timeout_express:'15m'});
    url=d.qr_code;if(d.out_trade_no!==order.order_no||typeof url!=='string'||!/^https:\/\/qr\.alipay\.com\/[A-Za-z0-9]+(?:\?.*)?$/.test(url))throw paymentError(502,'支付宝未返回有效的支付二维码');
  }
  return url;
}
export function wechatTransaction(d,c){
  const fail=(code,message)=>{throw Object.assign(paymentError(400,message),{code});};
  if(d.appid!==c.settings.wechat.appId||d.mchid!==c.settings.wechat.mchId)fail('WECHAT_TRANSACTION_IDENTITY_MISMATCH','微信交易商户不匹配');
  if(!['SUCCESS','REFUND','NOTPAY','CLOSED','REVOKED','USERPAYING','PAYERROR','ACCEPT'].includes(d.trade_state))fail('WECHAT_TRANSACTION_STATE_INVALID','微信交易状态无效');
  const paid=d.trade_state==='SUCCESS';
  // The signed query omits amount on real unpaid/closed orders. That is not
  // payment evidence; SUCCESS must still carry a validated CNY integer amount.
  if(paid||d.amount!=null){
    if(d.amount?.currency!=='CNY'||!Number.isSafeInteger(d.amount?.total)||d.amount.total<0)fail('WECHAT_TRANSACTION_AMOUNT_INVALID','微信交易金额或币种无效');
  }
  return {orderNo:d.out_trade_no,reference:d.transaction_id,amount:d.amount?.total,paid,closed:['CLOSED','REVOKED','PAYERROR'].includes(d.trade_state)};
}
export function alipayTransaction(d,c,{query=false}={}){
  // App identity on query is tied to the signed request and verified response key.
  if((!query&&d.app_id!==c.settings.alipay.appId)||((!query||d.seller_id!==undefined)&&d.seller_id!==c.settings.alipay.sellerId))throw paymentError(400,'支付宝交易商户不匹配');
  return {orderNo:d.out_trade_no,reference:d.trade_no,amount:amountCents(d.total_amount),paid:['TRADE_SUCCESS','TRADE_FINISHED'].includes(d.trade_status),closed:d.trade_status==='TRADE_CLOSED'};
}
export async function queryProviderPayment(provider,c,orderNo,{strictMissing=false}={}){
  try{
    const transaction=provider==='wechat'?wechatTransaction(await wechatRequest(c,'GET',`/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(c.settings.wechat.mchId)}`),c):alipayTransaction(await paymentTransport.alipay(c.settings.alipay,c.secrets,'/v3/alipay/trade/query',{out_trade_no:orderNo}),c,{query:true});
    if(transaction.orderNo!==orderNo)throw paymentError(400,'查单返回的订单号不匹配');
    return transaction;
  }catch(e){
    // The official SDK throws HTTPS business errors before success-response signature
    // validation. A not-found result may ONLY close an expired attempt, never grant access.
    if(provider==='wechat'&&e.orderNotFound)return {orderNo,notFound:true,paid:false,closed:false};
    if(provider==='alipay'&&e.code==='ACQ.TRADE_NOT_EXIST'&&e.responseHttpStatus===400){
      if(strictMissing){
        const confirmed=await paymentTransport.alipayConfirmMissing(c.settings.alipay,c.secrets,orderNo);
        if(confirmed.code!=='40004'||confirmed.subCode!=='ACQ.TRADE_NOT_EXIST')throw paymentError(502,'旧订单状态尚未确认');
      }
      return {orderNo,notFound:true,paid:false,closed:false};
    }
    throw e;
  }
}
export async function closeProviderPayment(provider,c,orderNo){
  if(provider==='wechat')return wechatRequest(c,'POST',`/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`,{mchid:c.settings.wechat.mchId});
  return paymentTransport.alipay(c.settings.alipay,c.secrets,'/v3/alipay/trade/close',{out_trade_no:orderNo});
}
export function decodeWechatNotification(raw,headers,c){
  verifyWechat(raw,headers,c.settings.wechat);const payload=JSON.parse(raw);
  if(payload.event_type!=='TRANSACTION.SUCCESS'||payload.resource?.algorithm!=='AEAD_AES_256_GCM')throw paymentError(400,'不支持的微信支付通知');
  const r=payload.resource,bytes=Buffer.from(r.ciphertext,'base64');if(bytes.length<17)throw paymentError(400,'微信通知格式无效');
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(c.secrets.wechatApiV3Key),Buffer.from(r.nonce));cipher.setAuthTag(bytes.subarray(-16));cipher.setAAD(Buffer.from(r.associated_data||''));
  return wechatTransaction(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(0,-16)),cipher.final()]).toString()),c);
}
export function decodeAlipayNotification(raw,c){
  const params=new URLSearchParams(raw),data={};for(const [key,value] of params){if(key in data)throw paymentError(400,'重复通知字段');data[key]=value;}
  if(data.sign_type!=='RSA2'||!alipayClient(c.settings.alipay,c.secrets).checkNotifySignV2(data))throw paymentError(400,'支付宝签名无效');
  return alipayTransaction(data,c);
}
