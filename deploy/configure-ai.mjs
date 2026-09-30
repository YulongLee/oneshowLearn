// Root-only, invoked after the release snapshot. Input arrives over SSH stdin,
// not argv or a staging file. Only the approved Alibaba chat fields are accepted.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
assert.equal(process.getuid(),0);
const target='/etc/oneshowlearn/oneshowlearn.env';
const source=JSON.parse(readFileSync(0,'utf8'));
assert.deepEqual(Object.keys(source).sort(),['baseUrl','key','model']);
assert.equal(source.baseUrl,'https://dashscope.aliyuncs.com/compatible-mode/v1');
assert.ok(typeof source.key==='string'&&source.key.length>=12&&!/\s/.test(source.key));
assert.match(source.model,/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/);
const text=readFileSync(target,'utf8'),current=parseEnv(text);
// Never silently replace existing production model credentials.
for(const [key,value] of Object.entries({AI_API_KEY:source.key,AI_MODEL:source.model,AI_BASE_URL:source.baseUrl}))assert.ok(!current[key]||current[key]===value,`Existing ${key} differs; stop for review`);
const additions={AI_API_KEY:source.key,AI_MODEL:source.model,AI_BASE_URL:source.baseUrl,AI_ENABLED:'true',AI_TIMEOUT_MS:'45000',AI_MAX_TOKENS:'2400',AI_USER_DAILY_LIMIT:'30',AI_GLOBAL_DAILY_LIMIT:'300',AI_CONFIG_ENCRYPTION_KEY:randomBytes(32).toString('hex')};
const missing=Object.entries(additions).filter(([key])=>!current[key]);
const next=text+'\n# OneShowLearn AI service — server-only credentials\n'+missing.map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n';
const merged=parseEnv(next);
for(const [key,value] of Object.entries(current))if(value)assert.ok(merged[key]===value,`Changed existing ${key}`);
assert.match(merged.AI_CONFIG_ENCRYPTION_KEY,/^[0-9a-f]{64}$/i);
const temporary=target+`.ai-${process.pid}`;
writeFileSync(temporary,next,{mode:0o600,flag:'wx'});renameSync(temporary,target);
console.log('AI server settings installed; all existing nonempty settings preserved; credentials omitted');
