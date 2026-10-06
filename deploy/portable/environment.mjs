// Shared by the manager and container. Never evaluate config or print secrets.
import {randomBytes} from 'node:crypto';
export function parseEnvironment(text) {
  const values={};
  for(const line of text.split(/\r?\n/)) {
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if(!match||Object.hasOwn(values,match[1]))throw Error('Invalid or duplicate environment field');
    values[match[1]]=match[2];
  }
  return values;
}
export function validateEnvironment(env) {
  const url=new URL(env.APP_URL||'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||env.APP_ORIGIN!==url.origin)throw Error('APP_URL and APP_ORIGIN must identify the same HTTP(S) origin');
  if(env.NODE_ENV!=='production'||env.ALLOW_DEV_EMAIL_DELIVERY!=='false')throw Error('Production mode and real email delivery policy required');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_EMAIL||''))throw Error('Valid administrator email required');
  if((env.ADMIN_PASSWORD||'').length<16||(env.JWT_SECRET||'').length<32)throw Error('Dedicated strong administrator and session secrets required');
  for(const key of ['AI_CONFIG_ENCRYPTION_KEY','PAYMENT_CONFIG_ENCRYPTION_KEY','AUTH_CONFIG_ENCRYPTION_KEY'])if(!/^[a-f0-9]{64}$/i.test(env[key]||''))throw Error('Independent encryption keys required');
  const keys=['JWT_SECRET','AI_CONFIG_ENCRYPTION_KEY','PAYMENT_CONFIG_ENCRYPTION_KEY','AUTH_CONFIG_ENCRYPTION_KEY'].map(k=>env[k]);
  if(new Set(keys).size!==keys.length)throw Error('Encryption and session secrets must be independent');
  if(env.REGISTRATION_ENABLED!=='false') {
    const ready=env.EMAIL_PROVIDER==='smtp'?env.EMAIL_SMTP_HOST&&env.EMAIL_SMTP_USER&&env.EMAIL_SMTP_PASSWORD&&env.EMAIL_FROM:env.EMAIL_API_KEY&&env.EMAIL_FROM;
    if(!ready)throw Error('Registration requires configured email delivery');
  }
  if(!['local','oss'].includes(env.ASSET_STORAGE||'local'))throw Error('Unsupported storage adapter');
  return env;
}
export function initialEnvironment(origin,email) {
  const url=new URL(origin);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use an origin without credentials, path or query');
  return validateEnvironment({NODE_ENV:'production',APP_URL:url.origin,APP_ORIGIN:url.origin,ADMIN_EMAIL:email,ADMIN_PASSWORD:randomBytes(24).toString('hex'),JWT_SECRET:randomBytes(48).toString('hex'),...Object.fromEntries(['AI_CONFIG_ENCRYPTION_KEY','PAYMENT_CONFIG_ENCRYPTION_KEY','AUTH_CONFIG_ENCRYPTION_KEY'].map(k=>[k,randomBytes(32).toString('hex')])),REGISTRATION_ENABLED:'false',ALLOW_DEV_EMAIL_DELIVERY:'false',AI_ENABLED:'false',ASSET_STORAGE:'local'});
}
