import { Router } from 'express';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, row, rows, run } from './db.mjs';
import { config } from './config.mjs';
import { requireAuth, requireOwner, signUser } from './auth.mjs';
import { AccountError, audit, rateLimit } from './account-security.mjs';
import { adminLoginConfig, loginConfiguration, loginOrigin, saveLoginConfig, wechatCallback } from './login-configuration.mjs';
import { sendLoginSms, exchangeWechatCode, wechatAuthorizationUrl } from './login-providers.mjs';

const now=()=>Math.floor(Date.now()/1000),random=()=>randomBytes(24).toString('hex');
const digest=value=>createHmac('sha256',config.jwtSecret).update(value).digest('hex');
const equals=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const phone=z.string().trim().regex(/^1[3-9]\d{9}$/),password=z.string().max(128).optional();
const parse=(schema,value)=>{const p=schema.safeParse(value);if(!p.success)throw new AccountError(400,'请检查手机号、验证码或登录参数');return p.data;};
const startSchema=z.object({purpose:z.enum(['login','bind']).default('login'),password,allowCreate:z.boolean().default(false)}).strict();
function transaction(fn) {db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
function available(kind,version) {
  const c=loginConfiguration();
  if(!c.settings[kind].enabled)throw new AccountError(503,kind==='sms'?'手机号登录暂未开放，请使用邮箱登录':'微信登录暂未开放，请使用其他方式');
  if(version!==undefined&&c.version!==version)throw new AccountError(409,'登录服务配置已更新，请重新获取验证码或扫码');
  return c;
}
// Binding requires proof of the current account, as well as ownership of the new identity.
async function bindingUser(req,data) {
  if(data.purpose!=='bind')return null;
  await new Promise((resolve,reject)=>requireAuth(req,{status:()=>({json:()=>reject(new AccountError(401,'请先登录需要绑定的账号'))})},resolve));
  rateLimit('identity-binding',req.user.id,10,600);
  const current=row('SELECT * FROM users WHERE id=?',[req.user.id]);
  if(current.password_hash) {
    if(!data.password||!await bcrypt.compare(data.password,current.password_hash))throw new AccountError(400,'绑定前请验证当前账号的登录密码');
  } else {
    const payload=jwt.verify(req.headers.authorization.slice(7),config.jwtSecret);
    if(!payload.iat||now()-payload.iat>600)throw new AccountError(401,'请用原登录方式重新登录，再绑定新方式（10 分钟内有效）');
  }
  const latest=row('SELECT * FROM users WHERE id=?',[current.id]);
  if(latest.status!=='active'||latest.token_version!==current.token_version||latest.password_hash!==current.password_hash)throw new AccountError(401,'账号状态已变化，请重新登录');
  return latest;
}
function resolveIdentity(provider,subject,challenge,allowCreate) {
  const identity=row('SELECT * FROM login_identities WHERE provider=? AND subject=?',[provider,subject]);
  let user;
  if(challenge.purpose==='bind') {
    user=row('SELECT * FROM users WHERE id=?',[challenge.user_id]);
    if(!user||user.status!=='active'||user.token_version!==challenge.token_version)throw new AccountError(401,'原账号登录状态已变化，请重新绑定');
    if(identity&&identity.user_id!==user.id)throw new AccountError(409,'此登录方式已属于其他账号，不能合并或覆盖课程记录');
    const prior=row('SELECT * FROM login_identities WHERE user_id=? AND provider=?',[user.id,provider]);
    if(prior&&prior.subject!==subject)throw new AccountError(409,'当前账号已有绑定；更换需联系管理员核实，不会自动覆盖');
  } else if(identity) user=row('SELECT * FROM users WHERE id=?',[identity.user_id]);
  else {
    if(!config.registrationEnabled||!allowCreate)throw new AccountError(409,config.registrationEnabled?'此登录方式尚未绑定账号。已有邮箱账号请先登录后绑定；新用户请勾选创建账号再继续。':'注册暂未开放，请先使用已有账号登录并绑定');
    const id=Number(run("INSERT INTO users(email,password_hash,name,role,status,email_verified) VALUES(NULL,'',?,'learner','active',0)",[provider==='phone'?`学习者 ${subject.slice(-4)}`:'微信学习者']).lastInsertRowid);
    user=row('SELECT * FROM users WHERE id=?',[id]);
  }
  if(!user||user.status!=='active')throw new AccountError(403,'账号不可用，请联系管理员');
  if(!identity) {run('INSERT INTO login_identities(user_id,provider,subject) VALUES(?,?,?)',[user.id,provider,subject]);audit(user.id,user.id,`${provider}_${challenge.purpose==='bind'?'bound':'registered'}`);}
  run('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?',[user.id]);
  return {id:user.id,email:user.email,name:user.name,role:user.role,status:user.status,email_verified:user.email_verified,token_version:user.token_version};
}
function prune(){run('DELETE FROM login_challenges WHERE expires_at<?',[now()-86400]);}
const cookieName=id=>`osl_wx_${id}`;
function cookieValue(req,id) {const part=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName(id)}=`));return part?.slice(cookieName(id).length+1)||'';}
const cookieOptions=()=>({httpOnly:true,secure:config.isProduction||loginOrigin().startsWith('https:'),sameSite:'lax',path:'/api/auth/wechat',maxAge:600000});

// Dependency injection is code-only for isolated tests; no mock mode or endpoint in production.
export function externalLoginRouter({sendSms=sendLoginSms,exchangeWechat=exchangeWechatCode}={}) {
  const router=Router();router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.post('/phone/request-code',async(req,res)=>{
    const data=parse(startSchema.extend({phone}),req.body),c=available('sms');
    const user=await bindingUser(req,data);
    rateLimit('sms-ip',req.ip,10,3600);rateLimit('sms-phone-minute',data.phone,1,60);rateLimit('sms-phone-day',data.phone,5,86400);rateLimit('sms-global-day','all',c.settings.sms.dailyLimit,86400);
    prune();const id=random(),code=String(randomInt(0,1000000)).padStart(6,'0');
    // Invalidate prior deliveries, including slow in-flight requests, before sending.
    run("UPDATE login_challenges SET status='superseded' WHERE kind='sms' AND subject=? AND status IN ('pending','sent')",[data.phone]);
    run(`INSERT INTO login_challenges(id,kind,purpose,subject,proof_hash,user_id,token_version,config_version,expires_at,created_at) VALUES(?,'sms',?,?,?,?,?,?,?,?)`,[id,data.purpose,data.phone,digest(`${id}:${code}`),user?.id??null,user?.token_version??null,c.version,now()+300,now()]);
    try {await sendSms(c,data.phone,code);run("UPDATE login_challenges SET status='sent' WHERE id=? AND status='pending'",[id]);}
    catch(e){run("UPDATE login_challenges SET status='failed' WHERE id=?",[id]);throw e;}
    res.json({challengeId:id,cooldownSeconds:60,message:'验证码已发送，5 分钟内有效'});
  });
  router.post('/phone/verify',async(req,res)=>{
    const data=parse(z.object({challengeId:z.string().regex(/^[a-f\d]{48}$/),phone,code:z.string().regex(/^\d{6}$/),allowCreate:z.boolean().default(false)}).strict(),req.body);
    rateLimit('sms-verify-ip',req.ip,40,600);
    const c=row("SELECT * FROM login_challenges WHERE id=? AND kind='sms'",[data.challengeId]);
    available('sms',c?.config_version);
    if(!c||c.status!=='sent'||c.expires_at<=now()||c.subject!==data.phone||c.attempts>=5)throw new AccountError(400,'验证码已失效，请重新获取');
    if(c.purpose==='bind') {
      await new Promise((resolve,reject)=>requireAuth(req,{status:()=>({json:()=>reject(new AccountError(401,'请重新登录'))})},resolve));
      if(req.user.id!==c.user_id||req.user.token_version!==c.token_version)throw new AccountError(403,'验证码不属于当前账号');
    }
    const fresh=row('SELECT status,attempts,expires_at FROM login_challenges WHERE id=?',[c.id]);
    available('sms',c.config_version);
    if(fresh.status!=='sent'||fresh.attempts>=5||fresh.expires_at<=now())throw new AccountError(400,'验证码已失效，请重新获取');
    run('UPDATE login_challenges SET attempts=attempts+1 WHERE id=?',[c.id]);
    if(!equals(c.proof_hash,digest(`${c.id}:${data.code}`)))throw new AccountError(400,'验证码不正确，请重新输入');
    const user=transaction(()=>{const user=resolveIdentity('phone',c.subject,c,data.allowCreate);run("UPDATE login_challenges SET status='consumed' WHERE id=?",[c.id]);return user;});
    res.json(c.purpose==='bind'?{ok:true}:{token:signUser(user),user});
  });
  router.get('/identities',requireAuth,(req,res)=>{
    const list=rows('SELECT provider,subject FROM login_identities WHERE user_id=?',[req.user.id]);
    res.json({hasPassword:Boolean(row('SELECT password_hash FROM users WHERE id=?',[req.user.id]).password_hash),phone:list.find(i=>i.provider==='phone')?.subject.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')||'',wechat:list.some(i=>i.provider==='wechat')});
  });
  router.post('/wechat/start',async(req,res)=>{
    const data=parse(startSchema,req.body),c=available('wechat'),user=await bindingUser(req,data);
    rateLimit('wechat-start',req.ip,15,600);prune();const id=random(),pollToken=random(),browser=random();
    run(`INSERT INTO login_challenges(id,kind,purpose,proof_hash,browser_hash,user_id,token_version,config_version,expires_at,created_at,allow_create) VALUES(?,'wechat',?,?,?,?,?,?,?,?,?)`,[id,data.purpose,digest(pollToken),digest(browser),user?.id??null,user?.token_version??null,c.version,now()+600,now(),Number(data.allowCreate)]);
    res.cookie(cookieName(id),browser,cookieOptions()).json({challengeId:id,pollToken,url:wechatAuthorizationUrl(c,wechatCallback(),id),expiresIn:600});
  });
  router.get('/wechat/callback',async(req,res)=>{
    res.set({'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
    const id=typeof req.query.state==='string'?req.query.state:'';
    const c=/^[a-f\d]{48}$/.test(id)?row("SELECT * FROM login_challenges WHERE id=? AND kind='wechat'",[id]):null;
    const page=(ok)=>res.status(ok?200:400).type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>微信授权 · OneShowLearn</title><body><h2>${ok?'微信授权完成':'微信授权未完成'}</h2><p>${ok?'请回到刚才的 OneShowLearn 窗口继续。此窗口可以关闭。':'请回到原窗口重新扫码。请勿转发授权链接。'}</p></body></html>`);
    if(!c||c.status!=='pending'||c.expires_at<=now()||!equals(c.browser_hash,digest(cookieValue(req,id))))return page(false);
    // Single claim before network I/O prevents callback replay and duplicate exchanges.
    run("UPDATE login_challenges SET status='exchanging' WHERE id=?",[id]);
    try {
      if(typeof req.query.code!=='string'||!req.query.code||req.query.code.length>256)throw new Error();
      const settings=available('wechat',c.config_version),subject=await exchangeWechat(settings,req.query.code);
      available('wechat',c.config_version);
      if(c.expires_at<=now())throw new Error();
      run("UPDATE login_challenges SET status='ready',subject=? WHERE id=? AND status='exchanging'",[subject,id]);return page(true);
    } catch {run("UPDATE login_challenges SET status='failed' WHERE id=?",[id]);return page(false);}
  });
  router.post('/wechat/finish',async(req,res)=>{
    rateLimit('wechat-poll-ip',req.ip,120,60);
    const data=parse(z.object({challengeId:z.string().regex(/^[a-f\d]{48}$/),pollToken:z.string().regex(/^[a-f\d]{48}$/)}).strict(),req.body);
    const c=row("SELECT * FROM login_challenges WHERE id=? AND kind='wechat'",[data.challengeId]);
    if(!c||!equals(c.proof_hash,digest(data.pollToken))||!equals(c.browser_hash,digest(cookieValue(req,c.id))))throw new AccountError(400,'微信登录请求无效，请重新扫码');
    available('wechat',c.config_version);
    if(c.expires_at<=now()||['failed','consumed'].includes(c.status))throw new AccountError(400,'微信授权已取消、过期或使用，请重新扫码');
    if(c.purpose==='bind') {
      await new Promise((resolve,reject)=>requireAuth(req,{status:()=>({json:()=>reject(new AccountError(401,'请重新登录'))})},resolve));
      if(req.user.id!==c.user_id||req.user.token_version!==c.token_version)throw new AccountError(403,'此微信绑定不属于当前账号');
    }
    if(c.status!=='ready')return res.json({status:'pending'});
    if(row('SELECT status FROM login_challenges WHERE id=?',[c.id]).status!=='ready')throw new AccountError(400,'此授权已使用，请重新扫码');
    const user=transaction(()=>{const user=resolveIdentity('wechat',c.subject,c,Boolean(c.allow_create));run("UPDATE login_challenges SET status='consumed' WHERE id=?",[c.id]);return user;});
    res.clearCookie(cookieName(c.id),cookieOptions()).json(c.purpose==='bind'?{status:'complete',ok:true}:{status:'complete',token:signUser(user),user});
  });
  return router;
}
export function loginAdminRouter() {
  const router=Router();router.use(requireOwner);router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/',(_req,res)=>res.json(adminLoginConfig()));
  router.put('/',(req,res)=>res.json(saveLoginConfig(req.user,req.get('If-Match')===undefined?NaN:Number(req.get('If-Match')),req.body)));
  return router;
}
