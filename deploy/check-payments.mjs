// Scoped release checks. Never create orders, merchant settings, or learner fixtures.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,chmodSync,copyFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [mode,staging,backup]=process.argv.slice(2);
const app='/var/www/oneshowlearn',envFile='/etc/oneshowlearn/oneshowlearn.env';
if(mode==='dependencies'){
  const old=JSON.parse(readFileSync(`${app}/package.json`)),next=JSON.parse(readFileSync(`${staging}/package.json`));
  const deps={...next.dependencies};delete deps['alipay-sdk'];delete deps.qrcode;
  assert.deepEqual(deps,old.dependencies);assert.deepEqual(next.devDependencies,old.devDependencies);
  assert.equal(next.dependencies['alipay-sdk'],'^4.14.0');assert.equal(next.dependencies.qrcode,'^1.5.4');
  assert.deepEqual(next.overrides,{'alipay-sdk':{urllib:'4.9.1'}});
  const before=JSON.parse(readFileSync(`${app}/package-lock.json`)),after=JSON.parse(readFileSync(`${staging}/package-lock.json`));
  for(const [name,pkg] of Object.entries(before.packages)){
    if(!name)continue;
    assert.ok(after.packages[name],`Existing dependency removed: ${name}`);
    assert.equal(after.packages[name].version,pkg.version,`Existing version changed: ${name}`);
    assert.equal(after.packages[name].integrity,pkg.integrity,`Existing integrity changed: ${name}`);
  }
  console.log('PASS existing dependencies unchanged; only scoped payment dependencies added');
}else if(mode==='key'||mode==='verify-env'){
  const before=parseEnv(readFileSync(`${backup}/oneshowlearn.env`,'utf8'));
  let raw=readFileSync(envFile,'utf8'),now=parseEnv(raw);
  if(mode==='key'&&!now.PAYMENT_CONFIG_ENCRYPTION_KEY){
    // Append only: retain every existing environment setting and comment.
    raw+=`\nPAYMENT_CONFIG_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`;
    writeFileSync(`${envFile}.payments-next`,raw,{mode:0o600,flag:'wx'});
    chmodSync(`${envFile}.payments-next`,0o600);renameSync(`${envFile}.payments-next`,envFile);now=parseEnv(raw);
  }
  assert.match(now.PAYMENT_CONFIG_ENCRYPTION_KEY||'',/^[a-f0-9]{64}$/i);
  for(const [key,value] of Object.entries(before))if(key!=='PAYMENT_CONFIG_ENCRYPTION_KEY'||value)assert.equal(now[key],value,`Existing environment setting changed: ${key}`);
  for(const key of Object.keys(now))assert.ok(key in before||key==='PAYMENT_CONFIG_ENCRYPTION_KEY');
  if(mode==='key'){copyFileSync(envFile,`${backup}/oneshowlearn-with-payment-key.env`);chmodSync(`${backup}/oneshowlearn-with-payment-key.env`,0o600);}
  console.log('PASS payment encryption key ready; existing environment settings preserved (values hidden)');
}else if(['rehearse','verify-live'].includes(mode)){
  const old=new DatabaseSync(`${backup}/oneshowlearn.db`,{readOnly:true});let current;
  if(mode==='rehearse'){
    const target=`${backup}/payment-migration-check.db`;copyFileSync(`${backup}/oneshowlearn.db`,target);chmodSync(target,0o600);
    process.env.DATABASE_PATH=target;process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-payment-migration-rehearsal';
    const {db}=await import(pathToFileURL(`${staging}/server/db.mjs`));
    const {migratePayments}=await import(pathToFileURL(`${staging}/server/payment-schema.mjs`));migratePayments(db);current=db;
  }else current=new DatabaseSync(`${app}/data/oneshowlearn.db`,{readOnly:true});
  assert.equal(current.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(current.prepare('PRAGMA foreign_key_check').all(),[]);
  let count=0;const metadata=[];const q=s=>'"'+s.replaceAll('"','""')+'"';
  for(const {name} of old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
    const cols=old.prepare(`PRAGMA table_info(${q(name)})`).all().map(c=>q(c.name)).join(',');
    const before=old.prepare(`SELECT ${cols} FROM ${q(name)} ORDER BY rowid`).all(),after=current.prepare(`SELECT ${cols} FROM ${q(name)} ORDER BY rowid`).all();
    if(mode==='verify-live'&&['users','auth_rate_limits'].includes(name)&&JSON.stringify(before)!==JSON.stringify(after))metadata.push(name);
    else{assert.deepEqual(after,before,`Unexpected data change: ${name}`);count++;}
  }
  for(const table of ['payment_configuration','payment_checkouts'])assert.equal(current.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,'Payment records must not be seeded');
  current.close();old.close();console.log(`PASS ${mode}: integrity, foreign keys, ${count} unchanged tables; authentication metadata: ${metadata.join(', ')||'none'}; payment tables empty`);
}else if(mode==='smoke'){
  process.loadEnvFile(envFile);
  const request=(route,options={})=>fetch('https://oneshowlearn.com/api'+route,{signal:AbortSignal.timeout(20000),...options});
  const offer=await request('/commerce/offer');assert.equal(offer.status,200);assert.equal(offer.headers.get('cache-control'),'no-store');
  const data=await offer.json();assert.equal(data.priceCents,39900);assert.equal(data.originalPriceCents,99900);assert.equal(data.productId,null);assert.ok(data.channels.length===2&&data.channels.every(c=>!c.available));
  for(const route of ['/admin/payments','/commerce/orders'])assert.equal((await request(route)).status,401);
  const checkout=await request('/commerce/checkout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(checkout.status,401);
  for(const provider of ['wechat','alipay']){
    assert.equal((await request(`/payments/notify/${provider}/0`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
    assert.equal((await request(`/payments/notify/${provider}/1`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
  }
  const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  assert.equal(login.status,200);const {token}=await login.json();assert.ok(token);const headers={authorization:`Bearer ${token}`};
  const response=await request('/admin/payments',{headers});assert.equal(response.status,200);const admin=await response.json();
  assert.equal(admin.version,0);assert.equal(admin.encryptionReady,true);assert.equal(admin.settings.productId,null);assert.ok(Object.values(admin.secretsConfigured).every(v=>v===false));assert.equal(admin.secrets,undefined);
  for(const route of ['/admin/community','/admin/cms/assets','/learning/entry','/learning/ai/conversations','/admin/orders'])assert.equal((await request(route,{headers})).status,200,route);
  const history=await request('/commerce/orders',{headers});assert.equal(history.status,200);assert.deepEqual((await history.json()).items,[]);
  console.log('PASS HTTPS prices 399/999, disabled channels, encrypted configuration readiness, anonymous guards, invalid callback rejection, existing APIs; no orders or settings written');
}else throw new Error('Unknown release check');
