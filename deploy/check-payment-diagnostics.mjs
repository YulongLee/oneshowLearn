import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv,isDeepStrictEqual} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
const backup=process.argv[2],mode=process.argv[3],app='/var/www/oneshowlearn';
const env=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8'));
const db=new DatabaseSync(app+'/data/oneshowlearn.db',{readOnly:true});
const old=new DatabaseSync(backup+'/before.db',{readOnly:true});
try{
  const admin=db.prepare("SELECT id,token_version FROM users WHERE role='admin' AND status='active' AND email_verified=1 LIMIT 1").get();assert.ok(admin);
  const jwt=createRequire(app+'/package.json')('jsonwebtoken');
  const token=jwt.sign({sub:admin.id,ver:admin.token_version},env.JWT_SECRET,{expiresIn:'2m'});
  const request=(route,options={})=>fetch('https://oneshowlearn.com/api'+route,{signal:AbortSignal.timeout(20000),...options});
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const configResponse=await request('/admin/payments',{headers});assert.equal(configResponse.status,200);
  const c=await configResponse.json();
  if(['alipay','alipay-probe','checkout'].includes(mode)){
    const limited=db.prepare("SELECT id,token_version FROM users WHERE role IN ('editor','learner') AND status='active' AND email_verified=1 LIMIT 1").get();
    const limitedToken=limited&&jwt.sign({sub:limited.id,ver:limited.token_version},env.JWT_SECRET,{expiresIn:'2m'});
    for(const section of ['wechat','alipay','pricing']){
      const route=`/admin/payments/${section}`;
      const settings=section==='pricing'?Object.fromEntries(['productId','priceCents','originalPriceCents','publicOrigin'].map(key=>[key,c.settings[key]])):c.settings[section];
      const body=JSON.stringify({settings,...(section==='pricing'?{}:{secrets:{}})});
      assert.equal((await request(route,{method:'PUT',headers:{'Content-Type':'application/json'},body})).status,401);
      if(limitedToken)assert.equal((await request(route,{method:'PUT',headers:{...headers,Authorization:`Bearer ${limitedToken}`},body})).status,403);
      assert.equal((await request(route,{method:'PUT',headers,body})).status,428);
      assert.equal((await request(route,{method:'PUT',headers:{...headers,'If-Match':String(c.version+1)},body})).status,409);
      const crossed=section==='pricing'?{settings,secrets:{alipayPrivateKey:'rejected-test-input'}}:{settings:{...settings,priceCents:1},secrets:{}};
      assert.equal((await request(route,{method:'PUT',headers:{...headers,'If-Match':String(c.version)},body:JSON.stringify(crossed)})).status,400);
      console.log(`PASS ${section}: independent save owner/version/scope guards; no configuration saved`);
    }
    assert.equal((await request('/admin/payments/unknown',{method:'PUT',headers,body:'{}'})).status,404);
  }
  for(const provider of ['wechat','alipay']){
    const route=`/admin/payments/${provider}/test`;
    assert.equal((await request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    assert.equal((await request(route,{method:'POST',headers,body:'{}'})).status,428);
    assert.equal((await request(route,{method:'POST',headers:{...headers,'If-Match':String(c.version+1)},body:'{}'})).status,409);
    const secret=provider==='wechat'?'wechatPrivateKey':'alipayPrivateKey';
    if(!c.secretsConfigured[secret]){
      const r=await request(route,{method:'POST',headers:{...headers,'If-Match':String(c.version)},body:'{}'});assert.equal(r.status,200);
      const result=await r.json();assert.equal(result.status,'incomplete');assert.equal(result.version,c.version);assert.equal(result.provider,provider);assert.ok(result.limitations.length);
      console.log(`PASS ${provider}: missing configuration diagnosed without gateway request`);
    }else console.log(`PASS ${provider}: auth/version guards; configured gateway deliberately not invoked during release`);
  }
  const offer=await request('/commerce/offer');assert.equal(offer.status,200);assert.deepEqual(await offer.json(),JSON.parse(readFileSync(backup+'/offer.before.json')));
  for(const table of ['payment_configuration','products','project_packs','orders','order_items','payments','payment_checkouts','entitlements'])assert.ok(isDeepStrictEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),old.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()),`Unexpected mutation: ${table}; details suppressed`);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  console.log('PASS HTTPS diagnostics, preserved pricing/merchant configuration/order/entitlement records and database integrity');
}finally{db.close();old.close();}
