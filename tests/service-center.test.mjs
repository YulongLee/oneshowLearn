import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';

test('service publications and private manual support never mutate payment records',async t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'osl-service-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'isolated.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-service-tests',AI_ENABLED:'false',EMAIL_API_KEY:''});
  const {db,row,rows,run}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {createApp}=await import('../server/index.mjs');
  const {SERVICE_DEFAULTS}=await import('../server/service-definition.mjs');
  const make=role=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[randomUUID()+'@example.invalid','unused',role,role]).lastInsertRowid);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
  const owner=make('admin'),editor=make('editor'),a=make('learner'),b=make('learner');
  const paid=Number(run("INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES(?,?,'paid',49900)",['SERVICE-PAID',a.id]).lastInsertRowid);
  const pending=Number(run("INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES(?,?,'pending',49900)",['SERVICE-PENDING',b.id]).lastInsertRowid);
  const protectedBefore=JSON.stringify({orders:rows('SELECT * FROM orders'),users:rows('SELECT * FROM users'),entitlements:rows('SELECT * FROM entitlements')});
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const req=async(route,user=null,method='GET',body,version)=>{const r=await fetch(base+route,{method,headers:{...(user?{Authorization:`Bearer ${user.token}`}:{ }),...(body?{'Content-Type':'application/json'}:{}),...(version!==undefined?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json()};};
  const request={orderId:paid,category:'refund',title:'申请核实课程退款',message:'这是隔离环境的人工售后申请，不会发起真实支付退款。',requestKey:randomUUID()};
  let id,version;
  await t.test('public baseline is honest and private admin endpoints require owner',async()=>{
    const publicData=await req('/service/public');assert.equal(publicData.status,200);assert.equal(publicData.data.settings.contactEmail,'');assert.equal(publicData.data.published,false);
    for(const route of ['/admin/service','/admin/support','/support/requests','/support/orders'])assert.equal((await req(route)).status,401);
    for(const user of [editor,a,b]){assert.equal((await req('/admin/service',user)).status,403);assert.equal((await req('/admin/support',user)).status,403);}
    assert.match((await req('/support/orders',a)).cache,/no-store/);
  });
  await t.test('versioned draft does not publish; explicit publication preserves other configuration',async()=>{
    const draft={...SERVICE_DEFAULTS,operatorName:'隔离测试主体',contactEmail:'support@example.invalid'};
    assert.equal((await req('/admin/service',owner,'PUT',draft)).status,428);
    assert.equal((await req('/admin/service',owner,'PUT',{...draft,contactEmail:'not-email'},0)).status,400);
    assert.equal((await req('/admin/service',owner,'PUT',{...draft,role:'admin'},0)).status,400);
    const saved=await req('/admin/service',owner,'PUT',draft,0);assert.equal(saved.status,200);
    assert.equal((await req('/service/public')).data.settings.operatorName,'');
    assert.equal((await req('/admin/service',owner,'PUT',draft,0)).status,409);
    assert.equal((await req('/admin/service/publish',owner,'POST',{},0)).status,409);
    const published=await req('/admin/service/publish',owner,'POST',{},saved.data.version);assert.equal(published.status,200);
    assert.equal((await req('/service/public')).data.settings.operatorName,draft.operatorName);
    const d=(await req('/admin/service',owner)).data;assert.equal(d.history.length,1);
    assert.equal((await req('/admin/service/history/'+d.history[0].id,owner)).data.draft.contactEmail,draft.contactEmail);
    assert.equal((await req('/admin/service/history/'+d.history[0].id,editor)).status,403);
  });
  await t.test('orders stay owner scoped, refund requests require a paid owned order',async()=>{
    assert.deepEqual((await req('/support/orders',a)).data.items.map(o=>o.id),[paid]);
    assert.equal((await req('/support/requests',b,'POST',request)).status,404);
    assert.equal((await req('/support/requests',b,'POST',{...request,orderId:pending})).status,400);
    assert.equal((await req('/support/requests',a,'POST',{...request,orderId:null})).status,400);
    assert.equal((await req('/support/requests',a,'POST',{...request,userId:b.id})).status,400);
    const created=await req('/support/requests',a,'POST',request);assert.equal(created.status,201);id=created.data.item.id;version=created.data.item.version;
    assert.equal(created.data.item.status,'open');assert.equal(created.data.item.messages.length,1);
    assert.equal(created.data.item.order.status,'paid');assert.equal(created.data.item.user_id,undefined);
  });
  await t.test('duplicate submission is durable; changed payload cannot reuse request key',async()=>{
    assert.equal((await req('/support/requests',a,'POST',request)).data.item.id,id);
    assert.equal((await req('/support/requests',a,'POST',{...request,title:'更改了申请标题'})).status,409);
    assert.equal(row('SELECT COUNT(*) n FROM support_requests').n,1);
  });
  await t.test('another learner cannot read or reply and editors cannot process financial support',async()=>{
    assert.equal((await req('/support/requests',b)).data.items.length,0);
    assert.equal((await req('/support/requests/'+id,b)).status,404);
    assert.equal((await req('/support/requests/'+id+'/replies',b,'POST',{message:'他人回复',requestKey:randomUUID()},version)).status,404);
    assert.equal((await req('/admin/support/'+id+'/replies',editor,'POST',{message:'编辑回复',requestKey:randomUUID()},version)).status,403);
  });
  await t.test('manual replies use version guards and payload-aware idempotency, no automatic refund',async()=>{
    const reply={message:'已记录申请，待人工核实。本消息不代表退款到账。',status:'in_progress',requestKey:randomUUID()};
    assert.equal((await req('/admin/support/'+id+'/replies',owner,'POST',reply)).status,428);
    const r=await req('/admin/support/'+id+'/replies',owner,'POST',reply,version);assert.equal(r.status,200);assert.equal(r.data.item.status,'in_progress');
    assert.equal((await req('/admin/support/'+id+'/replies',owner,'POST',reply,version)).status,200);
    assert.equal((await req('/admin/support/'+id+'/replies',owner,'POST',{...reply,status:'resolved'},version)).status,409);
    assert.equal((await req('/admin/support/'+id+'/replies',owner,'POST',{...reply,requestKey:randomUUID()},version)).status,409);
    const final=await req('/admin/support/'+id+'/replies',owner,'POST',{message:'处理说明已回复，款项状态仍需独立确认。',status:'resolved',requestKey:randomUUID()},r.data.item.version);assert.equal(final.status,200);
    version=final.data.item.version;
    assert.equal(row('SELECT status FROM orders WHERE id=?',[paid]).status,'paid');
    assert.equal((await req('/admin/support?status=resolved',owner)).data.items.length,1);
  });
  await t.test('learner followup reopens request but cannot forge admin state',async()=>{
    assert.equal((await req('/support/requests/'+id+'/replies',a,'POST',{message:'伪造状态',status:'resolved',requestKey:randomUUID()},version)).status,400);
    const r=await req('/support/requests/'+id+'/replies',a,'POST',{message:'补充说明：还希望进一步核实课程权益。',requestKey:randomUUID()},version);assert.equal(r.status,200);assert.equal(r.data.item.status,'open');
    assert.equal(r.data.item.messages.at(-1).authorType,'user');
  });
  await t.test('all original identities, prices, order rows and entitlements remain byte-for-byte equal',()=>{
    assert.equal(JSON.stringify({orders:rows('SELECT * FROM orders'),users:rows('SELECT * FROM users'),entitlements:rows('SELECT * FROM entitlements')}),protectedBefore);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  });
});

test('UI exposes truthful service boundaries, safe documents and mobile payment guidance',()=>{
  const ui=readFileSync(new URL('../src/ServiceCenter.jsx',import.meta.url),'utf8'),checkout=readFileSync(new URL('../src/CourseCheckout.jsx',import.meta.url),'utf8');
  assert.match(ui,/skipHtml/);assert.match(ui,/img:\(\)=>null/);assert.match(ui,/If-Match/);assert.match(ui,/oneshowlearn:before-navigate/);
  assert.match(ui,/退款申请由管理员人工核实/);assert.match(ui,/未填写的联系信息不会被编造展示/);assert.match(ui,/\/legal\/privacy/);
  assert.match(checkout,/同一部手机/);assert.match(checkout,/另一设备/);assert.match(checkout,/官方页面显示为准/);assert.match(checkout,/ServiceLinks compact/);
});
