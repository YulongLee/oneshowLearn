// Disposable cashier UI fixture. No production database, credentials or gateway calls.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import bcrypt from 'bcryptjs';
const dir=process.argv[2];
assert.match(dir,/^\/tmp\/oneshowlearn-checkout-[a-zA-Z0-9]+$/);
assert.ok(!existsSync(`${dir}/preview.db`),'Use a fresh disposable directory');
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:`${dir}/preview.db`,UPLOAD_DIR:`${dir}/uploads`,JWT_SECRET:randomBytes(32).toString('hex'),PAYMENT_CONFIG_ENCRYPTION_KEY:randomBytes(32).toString('hex'),APP_ORIGIN:'http://127.0.0.1:4191',API_PORT:'18841'});
const {createApp}=await import('../server/index.mjs');
const {run,row}=await import('../server/db.mjs');
const {savePaymentConfig,adminPaymentConfig}=await import('../server/payment-configuration.mjs');
const {paymentTransport}=await import('../server/payment-providers.mjs');
const keys=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const merchant=keys(),wx=keys(),ali=keys(),remote=new Map();
run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'admin',1)",['checkout-owner@example.test',bcrypt.hashSync('Preview-Only-2026',4),'预览管理员']);
run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'learner',1)",['checkout-learner@example.test',bcrypt.hashSync('Preview-Only-2026',4),'收银台测试']);
const owner=row("SELECT * FROM users WHERE role='admin'");
const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','AI 产品从 0 到 1','published')").lastInsertRowid);
const packId=Number(run("INSERT INTO project_packs(path_id,slug,title,subtitle,status,price_cents) VALUES(?,'ai-opc-product-company','AI OPC | 一个人的 AI 产品公司','隔离预览：模拟课程与支付，不可真实付款','published',49900)",[pathId]).lastInsertRowid);
const productId=Number(run("INSERT INTO products(pack_id,sku,title,price_cents) VALUES(?,'preview-only','AI OPC | 一个人的 AI 产品公司',49900)",[packId]).lastInsertRowid);
const defaults=adminPaymentConfig().settings;
savePaymentConfig(owner,0,{settings:{...defaults,productId,priceCents:49900,originalPriceCents:99900,wechat:{enabled:true,appId:'wx-preview',mchId:'1234567890',serialNo:'ABCDE0123',publicKeyId:'PUB_KEY_ID_PREVIEW',publicKey:wx.publicKey},alipay:{enabled:true,appId:'ali-preview',sellerId:'208800001234',publicKey:ali.publicKey}},secrets:{wechatPrivateKey:merchant.privateKey,wechatApiV3Key:'a'.repeat(32),alipayPrivateKey:merchant.privateKey}});
let behavior='normal';
paymentTransport.fetch=async(url,options)=>{
  const route=String(url).replace('https://api.mch.weixin.qq.com','');let data,status=200;
  if(route.endsWith('/native')){
    const body=JSON.parse(options.body);remote.set(body.out_trade_no,{appid:'wx-preview',mchid:'1234567890',out_trade_no:body.out_trade_no,amount:body.amount,trade_state:'NOTPAY'});
    data={code_url:`weixin://wxpay/bizpayurl?pr=PREVIEW_ONLY_${body.out_trade_no}`};
  }else{
    const no=route.split('/out-trade-no/')[1].split(/[/?]/)[0];data=remote.get(no);
    if(behavior==='query-timeout')throw Object.assign(new Error('fixture timeout'),{name:'TimeoutError'});
    if(route.endsWith('/close')){await new Promise(resolve=>setTimeout(resolve,1500));data.trade_state='CLOSED';data=null;status=204;}
  }
  const responseData=data?{...data}:null;if(responseData&&responseData.trade_state!=='SUCCESS')delete responseData.amount;
  const raw=responseData?JSON.stringify(responseData):'',timestamp=String(Math.floor(Date.now()/1000)),nonce='preview-only';
  return new Response(data?raw:null,{status,headers:{'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,'Wechatpay-Serial':'PUB_KEY_ID_PREVIEW','Wechatpay-Signature':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),wx.privateKey).toString('base64')}});
};
paymentTransport.alipay=async(_settings,_secrets,route,body)=>{
  if(route.endsWith('/precreate')){
    if(behavior==='alipay-permission')throw Object.assign(new Error('fixture permission'),{code:'ACQ.ACCESS_FORBIDDEN',verifiedResponse:true,noPaymentCreated:true});
    remote.set(body.out_trade_no,{out_trade_no:body.out_trade_no,total_amount:body.total_amount,trade_status:'WAIT_BUYER_PAY'});
    return {out_trade_no:body.out_trade_no,qr_code:`https://qr.alipay.com/PREVIEWONLY${body.out_trade_no}`};
  }
  if(behavior==='query-timeout')throw Object.assign(new Error('fixture timeout'),{name:'TimeoutError'});
  const data=remote.get(body.out_trade_no);
  if(!data)throw Object.assign(new Error('fixture missing'),{code:'ACQ.TRADE_NOT_EXIST',responseHttpStatus:400});
  if(route.endsWith('/close')){await new Promise(resolve=>setTimeout(resolve,1500));data.trade_status='TRADE_CLOSED';}
  return data;
};
paymentTransport.alipayConfirmMissing=async()=>({code:'40004',subCode:'ACQ.TRADE_NOT_EXIST'});
const app=createApp();
// Local fixture process only; this endpoint is not part of the application router.
app.post('/__preview/behavior',(req,res)=>{assert.ok(['normal','query-timeout','alipay-permission'].includes(req.body.mode));behavior=req.body.mode;res.json({mode:behavior});});
app.post('/__preview/expire',(_req,res)=>{run("UPDATE payment_checkouts SET expires_at=? WHERE order_id IN(SELECT id FROM orders WHERE status='pending')",[new Date(Date.now()-60000).toISOString()]);res.json({fixtureOnly:true});});
app.listen(18841,'127.0.0.1',()=>console.log(`Disposable cashier preview ready. Database: ${dir}/preview.db. All payments are mocks.`));
