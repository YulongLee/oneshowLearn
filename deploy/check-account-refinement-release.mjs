// Common read-only data/configuration/ownership protections, then account GETs.
import './check-outcome-release.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
const app='/var/www/oneshowlearn',db=new DatabaseSync(app+'/data/oneshowlearn.db',{readOnly:true});
const secret=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8')).JWT_SECRET,jwt=createRequire(app+'/package.json')('jsonwebtoken');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const get=(route,user)=>fetch('https://oneshowlearn.com/api'+route,{signal:AbortSignal.timeout(20000),headers:user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'2m'})}:{}});
try{
 const users=db.prepare("SELECT id,token_version FROM users u WHERE status='active' AND (email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) ORDER BY CASE role WHEN 'learner' THEN 0 ELSE 1 END,id LIMIT 2").all();assert.ok(users.length);
 for(const user of users){
  const stored=db.prepare('SELECT name,email,email_verified,password_hash,created_at FROM users WHERE id=?').get(user.id),data=db.prepare('SELECT bio,avatar,revision FROM account_profiles WHERE user_id=?').get(user.id);
  const res=await get('/auth/profile',user);assert.equal(res.status,200);assert.ok(res.headers.get('cache-control')?.includes('no-store'));
  const profile=await res.json(),expected={hasPassword:Boolean(stored.password_hash),name:stored.name,email:stored.email,emailVerified:Boolean(stored.email_verified),createdAt:stored.created_at,bio:data?.bio||'',avatar:data?.avatar||'',version:digest([stored.name,data?.revision||0])};
  assert.equal(digest(profile),digest(expected),'Profile matches current owner only; content suppressed');
  const identities=await get('/auth/identities',user);assert.equal(identities.status,200);const bindings=await identities.json();
  const list=db.prepare('SELECT provider,subject FROM login_identities WHERE user_id=?').all(user.id),phone=list.find(i=>i.provider==='phone')?.subject.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')||'';
  assert.equal(digest(bindings),digest({hasPassword:Boolean(stored.password_hash),phone,wechat:list.some(i=>i.provider==='wechat')}),'Owner-only masked identities; content suppressed');
  const orders=await get('/commerce/orders',user);assert.equal(orders.status,200);const items=(await orders.json()).items;assert.ok(Array.isArray(items)&&items.length<=20);
  for(const item of items){const saved=db.prepare('SELECT o.user_id,o.order_no,o.amount_cents,c.user_id checkout_owner FROM orders o JOIN payment_checkouts c ON c.order_id=o.id WHERE o.id=?').get(item.id);assert.ok(saved);assert.equal(saved.user_id,user.id);assert.equal(saved.checkout_owner,user.id);assert.equal(saved.order_no,item.orderNo);assert.equal(saved.amount_cents,item.amountCents);}
 }
 console.log('PASS current-owner profile/version/masked identities and bounded order GETs; no profile, password, session, order or provider mutations');
}finally{db.close();}
