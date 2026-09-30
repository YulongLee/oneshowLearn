import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db, row, rows, run } from './db.mjs';
import { config } from './config.mjs';
import { aiSettings } from './ai-provider.mjs';

export const AI_ENDPOINTS = ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'];
export const AI_FEATURES = ['tutor', 'ask', 'summary', 'notes', 'keypoints', 'mindmap', 'flashcards', 'web'];
const featureSchema = z.object(Object.fromEntries(AI_FEATURES.map(key => [key, key==='web'?z.boolean().default(true):z.boolean()]))).strict();
export const aiConfigSchema = z.object({
  enabled: z.boolean(), baseUrl: z.enum(AI_ENDPOINTS), model: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/),
  timeout: z.number().int().min(5000).max(60000), maxTokens: z.number().int().min(32).max(4096),
  dailyLimit: z.number().int().min(1).max(500), globalLimit: z.number().int().min(1).max(10000), features: featureSchema,
}).strict();
export const aiSaveSchema = z.object({ settings: aiConfigSchema, keyAction: z.enum(['keep', 'replace', 'environment', 'clear']).default('keep'),
  apiKey: z.string().trim().max(512).optional(),
}).strict().superRefine((d, ctx) => {
  if (d.keyAction === 'replace' && (!d.apiKey || d.apiKey.length < 12 || /\s/.test(d.apiKey))) ctx.addIssue({code:'custom',message:'请输入有效的新密钥'});
  if (d.keyAction !== 'replace' && d.apiKey) ctx.addIssue({code:'custom',message:'只有更换密钥时才能提交密钥'});
});
const fail = (status, message) => Object.assign(new Error(message), { status });
function masterKey(create = false) {
  const env = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (env) {
    if (!/^[0-9a-f]{64}$/i.test(env)) throw fail(503, 'AI 密钥加密配置无效，请联系服务器管理员。');
    return Buffer.from(env, 'hex');
  }
  if (config.isProduction) throw fail(503, '请先在服务器配置 AI_CONFIG_ENCRYPTION_KEY，再保存新密钥。');
  const file = path.join(path.dirname(config.databasePath), '.ai-config.key');
  if (!existsSync(file) && create) {
    try { writeFileSync(file, randomBytes(32), { mode: 0o600, flag: 'wx' }); } catch (e) { if(e.code!=='EEXIST')throw fail(503,'无法创建本地密钥加密文件。'); }
  }
  if (!existsSync(file)) throw fail(503, 'AI 密钥加密文件缺失，请恢复加密配置。');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw fail(503, 'AI 密钥文件权限不安全，请联系服务器管理员。');
  const key = readFileSync(file);
  if (key.length !== 32) throw fail(503, 'AI 密钥加密文件无效。');
  return key;
}
function encrypt(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', masterKey(true), iv);
  cipher.setAAD(Buffer.from('oneshowlearn-ai-key-v1'));
  const body = Buffer.concat([cipher.update(value,'utf8'), cipher.final()]);
  return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});
}
function decrypt(value) {
  try {
    const data=JSON.parse(value), cipher=createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(data.iv,'base64'));
    cipher.setAAD(Buffer.from('oneshowlearn-ai-key-v1'));cipher.setAuthTag(Buffer.from(data.tag,'base64'));
    return Buffer.concat([cipher.update(Buffer.from(data.body,'base64')),cipher.final()]).toString('utf8');
  } catch { throw fail(503, '已保存的 AI 密钥无法解密，请管理员恢复加密配置或重新设置密钥。'); }
}
export function aiRuntime() {
  const env=aiSettings(), record=row('SELECT * FROM ai_configuration WHERE id=1');
  const defaults={...env,features:Object.fromEntries(AI_FEATURES.map(key=>[key,true]))};
  if(!record)return {...defaults,version:0,keyMode:'environment',keyError:''};
  const settings={...defaults,...JSON.parse(record.settings),version:record.version,keyMode:record.key_mode,keyError:''};
  settings.features={...defaults.features,...settings.features};
  if(record.key_mode==='none')settings.key='';
  if(record.key_mode==='custom')try{settings.key=decrypt(record.key_cipher);}catch(e){settings.key='';settings.keyError=e.message;}
  return settings;
}
export function adminAiConfig() {
  const runtime=aiRuntime(), record=row('SELECT updated_at,updated_by FROM ai_configuration WHERE id=1');
  const {key,keyError,keyMode,version,...settings}=runtime;
  return {settings,version,keyMode,keyConfigured:Boolean(key),keyMask:key?'••••••••':'',keyError,
    environmentKeyConfigured:Boolean(process.env.AI_API_KEY),
    encryptionReady:!config.isProduction||/^[0-9a-f]{64}$/i.test(process.env.AI_CONFIG_ENCRYPTION_KEY||''),
    updatedAt:record?.updated_at||null,source:version?'后台配置':'服务器环境配置'};
}
export function saveAiConfig(user, version, data) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const record=row('SELECT * FROM ai_configuration WHERE id=1');
    if((record?.version||0)!==version)throw fail(409,'配置已被其他管理员修改，请重新加载后再编辑。');
    const previous=adminAiConfig();
    let mode=record?.key_mode||'environment',cipher=record?.key_cipher||null;
    if(data.keyAction==='replace'){mode='custom';cipher=encrypt(data.apiKey);}
    else if(data.keyAction==='environment'){mode='environment';cipher=null;}
    else if(data.keyAction==='clear'){mode='none';cipher=null;}
    const ready=mode==='environment'?Boolean(process.env.AI_API_KEY):mode==='custom'?Boolean(cipher&&(data.keyAction==='replace'||!previous.keyError)):false;
    if(data.settings.enabled&&!ready)throw fail(400,'开启服务前需要配置可用密钥；清除密钥时请同时关闭服务。');
    const changes=Object.keys(data.settings).filter(key=>JSON.stringify(previous.settings[key])!==JSON.stringify(data.settings[key]));
    if(data.keyAction!=='keep')changes.push(`credential:${data.keyAction}`);
    run(`INSERT INTO ai_configuration(id,settings,key_mode,key_cipher,version,updated_by) VALUES(1,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET settings=excluded.settings,key_mode=excluded.key_mode,key_cipher=excluded.key_cipher,version=excluded.version,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
      [JSON.stringify(data.settings),mode,cipher,version+1,user.id]);
    run('INSERT INTO ai_configuration_audit(actor_id,version,changes) VALUES(?,?,?)',[user.id,version+1,JSON.stringify(changes)]);
    db.exec('COMMIT');return adminAiConfig();
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function aiUsage(offset=0) {
  const items=rows(`SELECT *,CASE WHEN status='pending' AND created_at<datetime('now','-2 minutes') THEN 'interrupted' ELSE status END AS display_status FROM ai_usage ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?`,[offset]);
  const stats=row(`SELECT COUNT(*) AS calls,COALESCE(SUM(status='success'),0) AS succeeded,COALESCE(SUM(status='failed'),0) AS failed,
    COALESCE(SUM(input_tokens),0) AS inputTokens,COALESCE(SUM(output_tokens),0) AS outputTokens,COALESCE(SUM(input_tokens IS NOT NULL),0) AS meteredCalls FROM ai_usage WHERE created_at>=datetime('now','-1 day')`);
  const audits=rows('SELECT id,actor_id,version,changes,created_at FROM ai_configuration_audit ORDER BY id DESC LIMIT 30').map(item=>({...item,changes:JSON.parse(item.changes)}));
  return {items:items.slice(0,50),nextOffset:items.length>50?offset+50:null,stats,audits};
}
