import { createHash, createHmac, randomUUID } from 'node:crypto';
import { AccountError } from './account-security.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const encode=v=>encodeURIComponent(v).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function aliyunSmsRequest(c,phone,code,now=new Date(),nonce=randomUUID()) {
  // SendSms metadata places its business parameters in the query, even for POST.
  const params={PhoneNumbers:phone,SignName:c.settings.sms.signName,TemplateCode:c.settings.sms.templateCode,TemplateParam:JSON.stringify({code})};
  const query=Object.keys(params).sort().map(k=>`${encode(k)}=${encode(params[k])}`).join('&'),payload='';
  const headers={host:'dysmsapi.aliyuncs.com','x-acs-action':'SendSms','x-acs-version':'2017-05-25','x-acs-date':now.toISOString().replace(/\.\d{3}Z$/,'Z'),'x-acs-signature-nonce':nonce,'x-acs-content-sha256':hash(payload)};
  const names=Object.keys(headers).sort(),signed=names.join(';');
  const canonical=`POST\n/\n${query}\n${names.map(n=>`${n}:${headers[n]}\n`).join('')}\n${signed}\n${hash(payload)}`;
  const signature=createHmac('sha256',c.secrets.smsAccessKeySecret).update(`ACS3-HMAC-SHA256\n${hash(canonical)}`).digest('hex');
  headers.Authorization=`ACS3-HMAC-SHA256 Credential=${c.secrets.smsAccessKeyId},SignedHeaders=${signed},Signature=${signature}`;
  return {url:`https://dysmsapi.aliyuncs.com/?${query}`,options:{method:'POST',headers,body:payload,redirect:'error',signal:AbortSignal.timeout(10000)}};
}
export async function sendLoginSms(c,phone,code,fetcher=fetch) {
  const r=aliyunSmsRequest(c,phone,code);
  try { const response=await fetcher(r.url,r.options),body=await response.json();if(!response.ok||body.Code!=='OK')throw new Error(); }
  catch { throw new AccountError(503,'短信暂未发送成功，请稍后重试或使用邮箱登录'); }
}
export function wechatAuthorizationUrl(c,callback,state) {
  return `https://open.weixin.qq.com/connect/qrconnect?appid=${encode(c.settings.wechat.appId)}&redirect_uri=${encode(callback)}&response_type=code&scope=snsapi_login&state=${encode(state)}#wechat_redirect`;
}
export async function exchangeWechatCode(c,code,fetcher=fetch) {
  const url=new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  url.search=new URLSearchParams({appid:c.settings.wechat.appId,secret:c.secrets.wechatAppSecret,code,grant_type:'authorization_code'});
  try {
    const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(10000)}),data=await response.json();
    if(!response.ok||data.errcode||typeof data.openid!=='string'||!/^[-\w]{1,128}$/.test(data.openid)||!data.access_token||!String(data.scope).split(',').includes('snsapi_login'))throw new Error();
    // App-scoped OpenID only. Do not fetch profile data or keep provider tokens.
    return `${c.settings.wechat.appId}:${data.openid}`;
  } catch { throw new AccountError(503,'微信授权未完成或已过期，请重新扫码'); }
}
