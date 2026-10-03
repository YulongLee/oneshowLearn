import {createCipheriv,createDecipheriv,createPrivateKey,createPublicKey,randomBytes} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {config} from './config.mjs';
export const paymentError=(status,message)=>Object.assign(new Error(message),{status,isPaymentError:true});
const defaults=()=>({productId:null,priceCents:39900,originalPriceCents:99900,publicOrigin:'https://oneshowlearn.com',
  wechat:{enabled:false,appId:'',mchId:'',serialNo:'',publicKeyId:'',publicKey:''},
  alipay:{enabled:false,appId:'',sellerId:'',publicKey:''}});
const text=z.string().trim().max(120),pem=z.string().trim().max(12000);
export const paymentSaveSchema=z.object({settings:z.object({productId:z.number().int().positive().nullable(),priceCents:z.number().int().min(1).max(10000000),originalPriceCents:z.number().int().min(1).max(10000000),publicOrigin:z.string().url().max(200),
  wechat:z.object({enabled:z.boolean(),appId:text,mchId:text,serialNo:text,publicKeyId:text,publicKey:pem}).strict(),
  alipay:z.object({enabled:z.boolean(),appId:text,sellerId:text,publicKey:pem}).strict()}).strict(),
  secrets:z.object({wechatPrivateKey:pem.optional(),wechatApiV3Key:z.string().max(32).optional(),alipayPrivateKey:pem.optional()}).strict().default({})}).strict();
export function paymentSectionSchema(section){
  if(section==='pricing')return z.object({settings:paymentSaveSchema.shape.settings.pick({productId:true,priceCents:true,originalPriceCents:true,publicOrigin:true})}).strict();
  const secretFields=section==='wechat'?{wechatPrivateKey:true,wechatApiV3Key:true}:{alipayPrivateKey:true};
  return z.object({settings:paymentSaveSchema.shape.settings.shape[section],secrets:paymentSaveSchema.shape.secrets.unwrap().pick(secretFields).default({})}).strict();
}
function masterKey(create=false){
  const env=process.env.PAYMENT_CONFIG_ENCRYPTION_KEY;
  if(env){if(!/^[a-f0-9]{64}$/i.test(env))throw paymentError(503,'支付加密配置无效');return Buffer.from(env,'hex');}
  if(config.isProduction)throw paymentError(503,'服务器需要先配置 PAYMENT_CONFIG_ENCRYPTION_KEY，再保存支付密钥');
  const file=path.join(path.dirname(config.databasePath),'.payment-config.key');
  if(!existsSync(file)&&create)try{writeFileSync(file,randomBytes(32),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  if(!existsSync(file))throw paymentError(503,'支付加密文件缺失，请恢复原文件');
  const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw paymentError(503,'支付密钥文件权限不安全');
  const key=readFileSync(file);if(key.length!==32)throw paymentError(503,'支付加密文件无效');return key;
}
function encrypt(secrets){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',masterKey(true),iv);cipher.setAAD(Buffer.from('oneshowlearn-payment-v1'));const body=Buffer.concat([cipher.update(JSON.stringify(secrets)),cipher.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});}
function decrypt(value){try{const d=JSON.parse(value),cipher=createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(d.iv,'base64'));cipher.setAAD(Buffer.from('oneshowlearn-payment-v1'));cipher.setAuthTag(Buffer.from(d.tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(d.body,'base64')),cipher.final()]));}catch{throw paymentError(503,'支付密钥无法解密，请恢复服务器加密配置');}}
export function paymentConfiguration(version){const record=version?row('SELECT * FROM payment_configuration WHERE version=?',[version]):row('SELECT * FROM payment_configuration ORDER BY version DESC LIMIT 1');if(!record)return {version:0,settings:defaults(),secrets:{}};return {version:record.version,settings:JSON.parse(record.settings),secrets:decrypt(record.secrets_cipher)};}
function validRSA(value,privateKey=false){const key=privateKey?createPrivateKey(value):createPublicKey(value);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw new Error('RSA 2048 required');}
// Accept the key tool's bare DER/Base64 as well as PEM, without guessing key identity.
export function normalizeAlipayKey(value,privateKey=false){
  const text=String(value||'').trim(),parse=privateKey?createPrivateKey:createPublicKey;
  let key;
  if(text.startsWith('-----BEGIN')){
    if(!privateKey&&!/^-----BEGIN (?:RSA )?PUBLIC KEY-----/.test(text))throw new Error('Public key required');
    key=parse(text);
  }else{
    const encoded=text.replace(/\s/g,'');
    if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Invalid Base64');
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))throw new Error('Invalid Base64');
    for(const type of privateKey?['pkcs8','pkcs1']:['spki','pkcs1'])try{key=parse({key:bytes,format:'der',type});break;}catch{}
  }
  if(!key||key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw new Error('RSA 2048 required');
  return key.export({type:privateKey?'pkcs8':'spki',format:'pem'});
}
const fieldError=(field,message)=>Object.assign(paymentError(400,message),{code:'PAYMENT_CONFIG_FIELD_INVALID',field});
function validateSharedConfig(settings){
  const url=new URL(settings.publicOrigin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw paymentError(400,'回调域名必须是 HTTPS 根域名，不含路径或参数');
  if(settings.originalPriceCents<settings.priceCents)throw paymentError(400,'原价不能低于售价');
}
function validateProviderConfig(name,c,secrets,required=true){
  const title=name==='wechat'?'微信':'支付宝';
  const check=(field,value,valid,message)=>{if(!required&&!value)return;if(!value||!valid(value))throw fieldError(field,message);};
  check(`${name}.appId`,c.appId,v=>Boolean(v.trim()),`请填写${title} AppID`);
  const merchant=name==='wechat'?'mchId':'sellerId';
  check(`${name}.${merchant}`,c[merchant],v=>/^\d+$/.test(v),`请填写有效的${name==='wechat'?'微信商户号':'支付宝卖家 UID（数字）'}`);
  for(const privateKey of [false,true]){
    const field=privateKey?`${name}PrivateKey`:`${name}.publicKey`,value=privateKey?secrets[`${name}PrivateKey`]:c.publicKey;
    check(field,value,v=>{try{name==='alipay'?normalizeAlipayKey(v,privateKey):validRSA(v,privateKey);return true;}catch{return false;}},`${title}${privateKey?(name==='alipay'?'应用私钥':'商户私钥'):'支付平台公钥'}格式无效：需要 RSA 2048 位或以上${name==='alipay'?'，支持密钥工具原始文本或 PEM；公钥请使用支付宝公钥，不是应用公钥':' PEM'}`);
  }
  if(name==='alipay'&&c.publicKey&&secrets.alipayPrivateKey){
    const platform=createPublicKey(normalizeAlipayKey(c.publicKey)).export({type:'spki',format:'der'});
    const application=createPublicKey(createPrivateKey(normalizeAlipayKey(secrets.alipayPrivateKey,true))).export({type:'spki',format:'der'});
    if(platform.equals(application))throw fieldError('alipay.publicKey','支付宝公钥填成了应用公钥：网站此处需要支付宝提供的支付宝公钥；应用公钥用于上传支付宝平台。');
  }
  if(name==='wechat'){
    check('wechat.serialNo',c.serialNo,v=>/^[A-Fa-f0-9]+$/.test(v),'微信商户 API 证书序列号需为十六进制');
    check('wechat.publicKeyId',c.publicKeyId,v=>/^PUB_KEY_ID_[A-Za-z0-9_]+$/.test(v),'微信支付公钥 ID 需以 PUB_KEY_ID_ 开头');
    check('wechatApiV3Key',secrets.wechatApiV3Key,v=>Buffer.byteLength(v)===32,'微信 APIv3 密钥需为 32 字节');
    if(c.publicKey&&secrets.wechatPrivateKey)validateWechatVerificationKey(c,secrets);
  }
}
export function validateWechatVerificationKey(settings,secrets){
  const platform=createPublicKey(settings.publicKey).export({type:'spki',format:'der'});
  const merchant=createPublicKey(createPrivateKey(secrets.wechatPrivateKey)).export({type:'spki',format:'der'});
  if(platform.equals(merchant))throw Object.assign(paymentError(400,'微信支付公钥填成了商户公钥：请上传微信商户平台「API 安全 → 微信支付公钥」下载的 PEM 文件，保留现有商户私钥。'),{code:'PAYMENT_WECHAT_KEY_CONFLICT'});
}
export function validatePaymentConfig(settings,secrets){
  validateSharedConfig(settings);
  for(const name of ['wechat','alipay'])if(settings[name].enabled){
    validateProviderConfig(name,settings[name],secrets);
    if(!settings.productId)throw paymentError(400,'开启支付前请选择对应课程商品');
  }
}
export function adminPaymentConfig(){
  const c=paymentConfiguration();return {version:c.version,settings:c.settings,secretsConfigured:Object.fromEntries(['wechatPrivateKey','wechatApiV3Key','alipayPrivateKey'].map(k=>[k,Boolean(c.secrets[k])])),
    products:rows(`SELECT p.id,p.title,p.price_cents,pp.slug,pp.status FROM products p JOIN project_packs pp ON pp.id=p.pack_id WHERE p.status='active' ORDER BY p.id`),
    encryptionReady:!config.isProduction||/^[a-f0-9]{64}$/i.test(process.env.PAYMENT_CONFIG_ENCRYPTION_KEY||'')};
}
export function savePaymentSection(user,version,section,input){
  const c=paymentConfiguration();
  const settings=section==='pricing'?{...c.settings,...input.settings}:{...c.settings,[section]:input.settings};
  return savePaymentConfig(user,version,{settings,secrets:input.secrets||{}},section);
}
export function savePaymentConfig(user,version,input,section){
  const c=paymentConfiguration();if(version!==c.version)throw paymentError(409,'支付配置已变化，请刷新后重试');
  const secrets={...c.secrets};for(const [key,value] of Object.entries(input.secrets))if(value)secrets[key]=value;
  const settings={...input.settings,publicOrigin:new URL(input.settings.publicOrigin).origin};
  if(section){
    validateSharedConfig(input.settings);
    if(section!=='pricing')validateProviderConfig(section,settings[section],secrets,settings[section].enabled);
    if(['wechat','alipay'].some(name=>settings[name].enabled)&&!settings.productId)throw paymentError(400,'开启支付前请选择对应课程商品');
  }else validatePaymentConfig(input.settings,secrets);
  if(!section||section==='alipay'){
    if(settings.alipay.publicKey)try{settings.alipay={...settings.alipay,publicKey:normalizeAlipayKey(settings.alipay.publicKey)};}catch{throw fieldError('alipay.publicKey','支付宝公钥格式无效：支持 RSA 2048 位原始文本或 PEM，请勿填写应用公钥');}
    if(input.secrets.alipayPrivateKey)try{secrets.alipayPrivateKey=normalizeAlipayKey(input.secrets.alipayPrivateKey,true);}catch{throw fieldError('alipayPrivateKey','支付宝应用私钥格式无效：支持 RSA 2048 位 PKCS1 / PKCS8 原始文本或 PEM');}
  }
  const product=settings.productId?row('SELECT * FROM products WHERE id=? AND pack_id IS NOT NULL AND status=\'active\'',[settings.productId]):null;
  if(settings.productId&&(!product||product.currency!=='CNY'))throw paymentError(400,'请选择有效的人民币课程商品');
  const encrypted=encrypt(secrets);
  db.exec('BEGIN IMMEDIATE');try{
    if((row('SELECT MAX(version) version FROM payment_configuration').version||0)!==version)throw paymentError(409,'支付配置已变化');
    run('INSERT INTO payment_configuration(version,settings,secrets_cipher,actor_id) VALUES(?,?,?,?)',[version+1,JSON.stringify(settings),encrypted,user.id]);
    if(product&&(!section||section==='pricing')){run('UPDATE products SET price_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[settings.priceCents,product.id]);run('UPDATE project_packs SET price_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[settings.priceCents,product.pack_id]);}
    run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[user.id,'payment_configuration',version+1,'支付与定价','saved','configuration-updated']);
    db.exec('COMMIT');return adminPaymentConfig();
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function publicPaymentOffer(){
  const c=paymentConfiguration(),s=c.settings;
  const product=s.productId?row(`SELECT p.id,p.price_cents,pp.slug FROM products p JOIN project_packs pp ON pp.id=p.pack_id JOIN learning_paths lp ON lp.id=pp.path_id WHERE p.id=? AND p.status='active' AND p.currency='CNY' AND pp.status='published' AND lp.status='published'`,[s.productId]):null;
  const valid=Boolean(product&&product.price_cents===s.priceCents);
  return {productId:valid?product.id:null,slug:valid?product.slug:null,priceCents:s.priceCents,originalPriceCents:s.originalPriceCents,channels:['wechat','alipay'].map(id=>({id,label:id==='wechat'?'微信支付':'支付宝',available:valid&&s[id].enabled}))};
}
