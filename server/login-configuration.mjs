import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { row, run } from './db.mjs';
import { config } from './config.mjs';
import { AccountError, audit } from './account-security.mjs';

const defaults = () => ({ sms: { enabled:false, signName:'', templateCode:'', dailyLimit:100 }, wechat:{ enabled:false, appId:'' } });
const secretKeys = ['smsAccessKeyId','smsAccessKeySecret','wechatAppSecret'];
function key(create=false) {
  const value=process.env.AUTH_CONFIG_ENCRYPTION_KEY;
  if(value) { if(!/^[a-f\d]{64}$/i.test(value)) throw new AccountError(503,'登录服务加密配置无效'); return Buffer.from(value,'hex'); }
  if(config.isProduction) throw new AccountError(503,'服务器尚未配置 AUTH_CONFIG_ENCRYPTION_KEY');
  const file=path.join(path.dirname(config.databasePath),'.auth-config.key');
  if(!existsSync(file)&&create) try { writeFileSync(file,randomBytes(32),{mode:0o600,flag:'wx'}); } catch(e) { if(e.code!=='EEXIST')throw e; }
  if(!existsSync(file)) throw new AccountError(503,'登录服务加密文件缺失，请恢复原文件');
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)) throw new AccountError(503,'登录服务加密文件权限不安全');
  const bytes=readFileSync(file);if(bytes.length!==32)throw new AccountError(503,'登录服务加密文件无效');return bytes;
}
function encrypt(value) {
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(true),iv);c.setAAD(Buffer.from('osl-login-v1'));
  return JSON.stringify({iv:iv.toString('base64'),body:Buffer.concat([c.update(JSON.stringify(value)),c.final()]).toString('base64'),tag:c.getAuthTag().toString('base64')});
}
function decrypt(value) {
  try { const v=JSON.parse(value),c=createDecipheriv('aes-256-gcm',key(),Buffer.from(v.iv,'base64'));c.setAAD(Buffer.from('osl-login-v1'));c.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([c.update(Buffer.from(v.body,'base64')),c.final()])); }
  catch { throw new AccountError(503,'登录服务密钥无法解密，请恢复服务器加密配置'); }
}
export function loginConfiguration() {
  const c=row('SELECT * FROM login_configuration WHERE id=1');
  return c?{version:c.version,settings:JSON.parse(c.settings),secrets:decrypt(c.secrets_cipher)}:{version:0,settings:defaults(),secrets:{}};
}
export function loginOrigin() {
  const u=new URL(config.appUrl);
  if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||(u.protocol!=='https:'&&(config.isProduction||!['127.0.0.1','localhost'].includes(u.hostname)))) throw new AccountError(503,'请将服务器 APP_URL 配置为本站 HTTPS 根域名');
  return u.origin;
}
export const wechatCallback = () => `${loginOrigin()}/api/auth/wechat/callback`;
export function loginCapabilities() {
  try { const c=loginConfiguration();return {phoneLoginEnabled:c.settings.sms.enabled,wechatLoginEnabled:c.settings.wechat.enabled,externalRegistrationEnabled:config.registrationEnabled}; }
  catch { return {phoneLoginEnabled:false,wechatLoginEnabled:false,externalRegistrationEnabled:config.registrationEnabled}; }
}
export function adminLoginConfig() {
  const c=loginConfiguration();return {version:c.version,settings:c.settings,callbackUrl:wechatCallback(),
    secretsConfigured:Object.fromEntries(secretKeys.map(k=>[k,Boolean(c.secrets[k])])),
    encryptionReady:!config.isProduction||/^[a-f\d]{64}$/i.test(process.env.AUTH_CONFIG_ENCRYPTION_KEY||'')};
}
const text=z.string().trim().max(120);
const schema=z.object({settings:z.object({sms:z.object({enabled:z.boolean(),signName:text,templateCode:text,dailyLimit:z.number().int().min(1).max(10000)}).strict(),wechat:z.object({enabled:z.boolean(),appId:text}).strict()}).strict(),secrets:z.object({smsAccessKeyId:text.optional(),smsAccessKeySecret:text.optional(),wechatAppSecret:text.optional()}).strict().default({})}).strict();
export function saveLoginConfig(user,version,body) {
  if(!Number.isInteger(version))throw new AccountError(428,'请先载入最新登录配置');
  const p=schema.safeParse(body);if(!p.success)throw new AccountError(400,'请检查登录配置字段与短信每日上限');
  const c=loginConfiguration();if(c.version!==version)throw new AccountError(409,'配置已被更新，请重新载入');
  const secrets={...c.secrets,...p.data.secrets},s=p.data.settings;
  if(s.sms.enabled&&(!s.sms.signName||!/^SMS_\d+$/.test(s.sms.templateCode)||!secrets.smsAccessKeyId||!secrets.smsAccessKeySecret))throw new AccountError(400,'请填写阿里云短信签名、模板编号和 AccessKey');
  if(s.wechat.enabled&&(!/^wx[a-f\d]{16}$/i.test(s.wechat.appId)||!secrets.wechatAppSecret))throw new AccountError(400,'请填写微信网站应用 AppID 和 AppSecret');
  // Changing AppID would strand existing app-scoped identities. Migration is a separate operation.
  if(c.settings.wechat.appId&&s.wechat.appId!==c.settings.wechat.appId&&row("SELECT 1 FROM login_identities WHERE provider='wechat' LIMIT 1"))throw new AccountError(409,'已有绑定微信账号，不能直接更换 AppID；请先安排账号迁移');
  loginOrigin();
  const saved=run(`INSERT INTO login_configuration(id,version,settings,secrets_cipher,actor_id) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET version=excluded.version,settings=excluded.settings,secrets_cipher=excluded.secrets_cipher,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP
    WHERE login_configuration.version=?`,[version+1,JSON.stringify(s),encrypt(secrets),user.id,version]);
  if(saved.changes!==1)throw new AccountError(409,'配置已被更新，请重新载入');
  audit(user.id,user.id,'login_configuration_updated');return adminLoginConfig();
}
