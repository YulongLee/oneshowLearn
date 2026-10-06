import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
test('commercial hardening uses isolated records and never calls external providers',async t=>{
 const temp=mkdtempSync(path.join(tmpdir(),'osl-commercial-hardening-'));
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-commercial-only',AI_ENABLED:'false',ASSET_STORAGE:'local'});
 const {db,row,rows,run}=await import('../server/db.mjs'),{signUser}=await import('../server/auth.mjs'),{createApp}=await import('../server/index.mjs'),{grantOrderEntitlements}=await import('../server/learning-commerce.mjs');
 const add=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
 const user=role=>{const id=add('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[randomUUID()+'@example.invalid','unused',role,role]);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
 const a=user('learner'),b=user('learner'),owner=user('admin'),editor=user('editor');
 const pathId=add("INSERT INTO learning_paths(slug,title,status) VALUES('isolated-commercial','独立测试','published')"),pack=add("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'isolated-commercial','检索课程','published')",[pathId]);
 const product=add("INSERT INTO products(pack_id,sku,title,price_cents,status) VALUES(?,'TEST-COMMERCIAL','检索课程',49900,'active')",[pack]);
 const createOrder=(account=a,tracked=true)=>{const id=add("INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES(?,?,'paid',49900)",['ISOLATED-'+randomUUID(),account.id]);run("INSERT INTO order_items(order_id,product_id,title,price_cents) VALUES(?,?,'检索课程',49900)",[id,product]);if(tracked)grantOrderEntitlements(row('SELECT * FROM orders WHERE id=?',[id]));return id;};
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(route,account=a,method='GET',body,version)=>{const r=await fetch(base+route,{method,headers:{...(account?{Authorization:'Bearer '+account.token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(version?{'If-Match':version}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json()};};
 const refund=async(id,amountCents,rightsAction='keep',extra={})=>{const s=await req('/admin/refunds/'+id,owner),d={requestKey:randomUUID(),amountCents,providerReference:'TEST-'+randomUUID(),returnedAt:new Date().toISOString(),verificationNote:'隔离环境核验登记，不发起真实退款。',rightsAction,confirmedExternal:true,...extra};return {d,version:s.data.version,result:await req('/admin/refunds/'+id,owner,'POST',d,s.data.version)};};
 await t.test('refund ownership, confirmation, version and historic source guards',async()=>{
  const id=createOrder(a,false),s=(await req('/admin/refunds/'+id,owner)).data;
  for(const u of [a,b,editor])assert.equal((await req('/admin/refunds/'+id,u)).status,403);
  assert.equal((await req('/orders/'+id+'/refunds',b)).status,404);
  const d={requestKey:randomUUID(),amountCents:49900,providerReference:'TEST-HISTORICAL',returnedAt:new Date().toISOString(),verificationNote:'隔离测试历史来源核验',rightsAction:'revoke-order',confirmedExternal:true};
  assert.equal((await req('/admin/refunds/'+id,owner,'POST',d)).status,428);
  assert.equal((await req('/admin/refunds/'+id,owner,'POST',{...d,confirmedExternal:false},s.version)).status,400);
  assert.equal((await req('/admin/refunds/'+id,owner,'POST',d,'stale')).status,409);
  assert.equal((await req('/admin/refunds/'+id,owner,'POST',d,s.version)).status,409);
  assert.equal(row('SELECT status FROM orders WHERE id=?',[id]).status,'paid');
  assert.equal((await refund(id,49900)).result.status,201);
 });
 await t.test('partial refund amount, duplicate replay and cumulative ceiling',async()=>{
  const id=createOrder(),x=await refund(id,9900);assert.equal(x.result.status,201);
  assert.equal((await req('/admin/refunds/'+id,owner,'POST',x.d,x.version)).status,200);
  assert.equal((await req('/admin/refunds/'+id,owner,'POST',{...x.d,amountCents:9901},x.version)).status,409);
  assert.equal((await refund(id,49900)).result.status,400);
  assert.equal((await refund(id,1,'revoke-order')).result.status,400);
  assert.equal(row('SELECT status FROM orders WHERE id=?',[id]).status,'paid');
  assert.equal(row('SELECT status FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,pack]).status,'active');
  assert.equal((await req('/orders/'+id+'/refunds',a)).data.refundedCents,9900);
 });
  await t.test('full refund only revokes its own tracked grant',async()=>{
  const id=createOrder();run("UPDATE orders SET status='refunded' WHERE user_id=? AND id!=?",[a.id,id]);
  const x=await refund(id,49900,'revoke-order');assert.equal(x.result.status,201);
  assert.equal(row('SELECT status FROM orders WHERE id=?',[id]).status,'refunded');
  assert.equal(row('SELECT status FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,pack]).status,'revoked');
  const {settleOnlinePayment}=await import('../server/payment-lifecycle.mjs');
  run("INSERT INTO payment_configuration(version,settings,secrets_cipher) VALUES(999,'{}','isolated')");
  run("INSERT INTO payment_checkouts(order_id,user_id,product_id,provider,config_version,request_key,expires_at,provider_reference) VALUES(?,?,?,'wechat',999,?,'2030-01-01','ISOLATED-SETTLED')",[id,a.id,product,randomUUID()]);
  assert.throws(()=>settleOnlinePayment('wechat',999,{orderNo:row('SELECT order_no FROM orders WHERE id=?',[id]).order_no,amount:49900,paid:true,reference:'ISOLATED-SETTLED'}),/关闭或退款/);
  assert.equal(row('SELECT status FROM orders WHERE id=?',[id]).status,'refunded');assert.equal(row('SELECT status FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,pack]).status,'revoked');
 });
 await t.test('independent grant is retained and restored, including expired boundaries',async()=>{
  run("UPDATE entitlements SET source='manual',status='active',starts_at='2025-01-01 00:00:00',expires_at='2025-02-01 00:00:00',purchase_order_id=NULL WHERE user_id=? AND pack_id=?",[a.id,pack]);
  // Earlier ledgers belong to refunded orders; create this case with a fresh target.
  const p=add("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'isolated-independent','独立授权','published')",[pathId]),pr=add("INSERT INTO products(pack_id,sku,title,price_cents,status) VALUES(?,'INDEPENDENT','独立授权',49900,'active')",[p]);
  run("INSERT INTO entitlements(user_id,pack_id,source,status,starts_at,expires_at) VALUES(?,?,'manual','active','2025-01-01','2030-01-01')",[a.id,p]);
  const id=add("INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES('ISOLATED-INDEPENDENT',?,'paid',49900)",[a.id]);run("INSERT INTO order_items(order_id,product_id,title,price_cents) VALUES(?,?,'独立授权',49900)",[id,pr]);grantOrderEntitlements(row('SELECT * FROM orders WHERE id=?',[id]));
  assert.equal(row('SELECT expires_at FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,p]).expires_at,null);
  assert.equal((await refund(id,49900,'revoke-order')).result.status,201);
  const restored=row('SELECT * FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,p]);assert.equal(restored.source,'manual');assert.equal(restored.status,'active');assert.equal(restored.expires_at,'2030-01-01');
 });
 await t.test('other valid purchases and later manual authorization survive refund',async()=>{
  const first=createOrder(),second=createOrder();assert.equal((await refund(second,49900,'revoke-order')).result.status,201);
  assert.equal(row('SELECT purchase_order_id FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,pack]).purchase_order_id,first);
  run("UPDATE entitlements SET source='manual',purchase_order_id=NULL WHERE user_id=? AND pack_id=?",[a.id,pack]);
  assert.equal((await refund(first,49900,'revoke-order')).result.status,201);
  assert.equal(row('SELECT source FROM entitlements WHERE user_id=? AND pack_id=?',[a.id,pack]).source,'manual');
 });
 await t.test('orders and support paginate, find old orders and exclude other accounts',async()=>{
  for(let n=0;n<25;n++)createOrder(a,false);const other=createOrder(b,false);
  const page=(await req('/me/orders?limit=10')).data,next=(await req('/me/orders?limit=10&offset=10')).data;
  assert.equal(page.items.length,10);assert.equal(next.items.length,10);assert.ok(!next.items.some(o=>page.items.some(p=>p.id===o.id)));assert.ok(!page.items.some(o=>o.id===other));
  const no=row('SELECT order_no FROM orders WHERE id=?',[other]).order_no;assert.equal((await req('/me/orders?q='+no)).data.items.length,0);
  assert.match((await req('/me/orders')).cache,/no-store/);assert.equal((await req('/me/orders',null)).status,401);
  assert.equal((await req('/support/orders?offset=20')).data.items.length>0,true);
 });
 await t.test('search exact private notes, safe metadata only and capacity export owner isolation',async()=>{
  const own={tasks:[],notes:[{id:'own-note',title:'检索私人',body:'私有正文检索',updatedAt:new Date().toISOString()}],favorites:[],checkIns:[]},foreign={...own,notes:[{...own.notes[0],id:'foreign-note',title:'他人私有正文检索'}]};
  run('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)',[a.id,JSON.stringify(own)]);run('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)',[b.id,JSON.stringify(foreign)]);
  const found=(await req('/search?q=私有正文检索')).data;assert.deepEqual(found.items.map(n=>n.path),['/notes?note=own-note']);assert.equal(JSON.stringify(found).includes('foreign-note'),false);assert.equal(JSON.stringify(found).includes('body'),false);
  assert.equal((await req('/search?q=私有正文检索',null)).data.items.length,0);
  assert.equal((await req('/search?q=检索课程',null)).data.items[0].path,'/course-offer?course=isolated-commercial');
  const capacity=(await req('/me/capacity')).data;assert.equal(capacity.workspaceBytes,Buffer.byteLength(JSON.stringify(own)));assert.equal(capacity.usage.notes.used,1);
  const exported=(await req('/me/export')).data;assert.equal(exported.workspace.notes[0].id,'own-note');assert.equal(JSON.stringify(exported).includes('foreign-note'),false);assert.equal((await req('/me/export',null)).status,401);
 });
 await t.test('delivery readiness is owner-only and excludes unpublished parents from its actual total',async()=>{
  assert.equal((await req('/admin/readiness',a)).status,403);
  const chapter=add("INSERT INTO project_steps(pack_id,title,status) VALUES(?,'交付检查测试','published')",[pack]);
  const config=JSON.stringify({slides:[],mappings:[],tasks:[],operations:[]});
  const lesson=add("INSERT INTO learning_lessons(title,config,status) VALUES('交付检查测试',?,'published')",[config]);
  const id=add("INSERT INTO lesson_placements(lesson_id,chapter_id,status) VALUES(?,?,'published')",[lesson,chapter]);
  let report=(await req('/admin/readiness',owner)).data;assert.equal(report.total,1);assert.equal(report.items[0].id,id);
  run("UPDATE project_steps SET status='draft' WHERE id=?",[chapter]);
  report=(await req('/admin/readiness',owner)).data;assert.equal(report.total,0);assert.equal(report.items.length,0);
  run("UPDATE project_steps SET status='published' WHERE id=?",[chapter]);
 });
 await t.test('actual notifications remain owner scoped with guarded read marking',async()=>{
  const id=add("INSERT INTO support_requests(user_id,category,title,request_key,payload_hash) VALUES(?,'account','私人客服测试',?,'hash')",[a.id,randomUUID()]);
  const mid=add("INSERT INTO support_messages(request_id,author_id,author_type,message,request_key,payload_hash) VALUES(?,?,'admin','不能输出的私人回复正文',?,'hash')",[id,owner.id,randomUUID()]);
  const got=(await req('/notifications')).data;assert.equal(got.unread,1);assert.equal(got.items[0].path,'/support?request='+id);assert.equal(JSON.stringify(got).includes('私人回复正文'),false);
  assert.equal((await req('/notifications',b)).data.items.length,0);assert.equal((await req('/notifications/read',b,'POST',{key:'support:'+mid})).status,404);
  assert.equal((await req('/notifications/read',a,'POST',{key:'support:'+mid})).status,200);assert.equal((await req('/notifications')).data.unread,0);
 });
});
