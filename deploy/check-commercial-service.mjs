// Gateway-free rehearsal and post-release read-only acceptance.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv,isDeepStrictEqual} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [mode,backup,rehearsal]=process.argv.slice(2),app='/var/www/oneshowlearn';
assert.ok(['rehearse','live'].includes(mode));assert.match(backup,/^\/var\/backups\/oneshowlearn\/commercial-[a-zA-Z0-9]+$/);
const env=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8'));
const originalFetch=globalThis.fetch;let server,applicationDb;
const old=new DatabaseSync(backup+(mode==='live'?'/release.db':'/before.db'),{readOnly:true});
let base='http://127.0.0.1:8791/api';
try{
 if(mode==='rehearse'){
  assert.match(rehearsal,/^\/tmp\/oneshowlearn-commercial-deploy-[a-zA-Z0-9]+\/rehearsal$/);
  Object.assign(process.env,env,{NODE_ENV:'test',DATABASE_PATH:rehearsal+'/rehearsal.db',UPLOAD_DIR:rehearsal+'/uploads'});
  globalThis.fetch=(url,...rest)=>{assert.equal(new URL(url).hostname,'127.0.0.1','No external requests during rehearsal');return originalFetch(url,...rest);};
  const {createApp}=await import(pathToFileURL(rehearsal+'/server/index.mjs'));const imported=await import(pathToFileURL(rehearsal+'/server/db.mjs'));applicationDb=imported.db;
  server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;
 }
 const fetchRoute=route=>fetch(base+route,{signal:AbortSignal.timeout(10000)});
 const response=await fetchRoute('/service/public');assert.equal(response.status,200);const publicData=await response.json();assert.equal(publicData.published,false);assert.equal(publicData.settings.contactEmail,'');assert.match(publicData.settings.refundPolicy,/人工|管理员/);
 for(const route of ['/support/requests','/support/orders','/admin/service','/admin/support','/commerce/orders','/auth/profile'])assert.equal((await fetchRoute(route)).status,401,route);
 assert.equal((await fetch(base+'/admin/assets',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 const offer=await fetchRoute('/commerce/offer');assert.deepEqual(await offer.json(),JSON.parse(readFileSync(backup+'/offer.before.json')));
 const db=mode==='rehearse'?applicationDb:new DatabaseSync(app+'/data/oneshowlearn.db',{readOnly:true});
 const quote=n=>'"'+n.replaceAll('"','""')+'"';
 const tables=old.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
 for(const {name} of tables){const columns=old.prepare(`PRAGMA table_info(${quote(name)})`).all().map(c=>quote(c.name)).join(',');assert.ok(isDeepStrictEqual(db.prepare(`SELECT ${columns} FROM ${quote(name)} ORDER BY rowid`).all(),old.prepare(`SELECT ${columns} FROM ${quote(name)} ORDER BY rowid`).all()),`Protected table changed: ${name}; private values suppressed`);}
 for(const name of ['service_settings','service_history','support_requests','support_messages'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n,0,'No service fixtures/configuration uploaded');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 if(mode==='live')db.close();
 console.log(`PASS ${mode}: ${tables.length} protected tables equal, four additive service tables empty, private guards and authoritative pricing unchanged; no gateway calls.`);
}finally{if(server)await new Promise(r=>server.close(r));applicationDb?.close();old.close();globalThis.fetch=originalFetch;}
