import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

const require=createRequire(import.meta.url);
const reviewed={
 'body-parser':'2.4.0',multer:'2.5.0',nodemailer:'10.1.4',undici:'7.30.1',zod:'4.6.6',qs:'6.16.1',
};

// A crash regression must fail the child normally, not be swallowed by an
// uncaughtException handler. Every listener binds only to ephemeral loopback;
// none of these fixtures imports production configuration, a DB or a provider.
function isolated(label,source){
 const result=spawnSync(process.execPath,['--max-old-space-size=128','--input-type=module','-e',source],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000,maxBuffer:128*1024,
  env:{PATH:process.env.PATH,NODE_ENV:'test',TZ:'UTC'},
 });
 assert.equal(result.error,undefined,label+': '+String(result.error||''));
 assert.equal(result.signal,null,label+': '+String(result.signal||''));
 assert.equal(result.status,0,label+': '+result.stderr);
 assert.match(result.stdout,/^PASS isolated security fixture\n$/);
}

test('reviewed security packages are actually installed at the exact committed lock versions',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
 for(const [name,version] of Object.entries(reviewed)){
  const record=lock.packages['node_modules/'+name];
  assert.equal(record?.version,version,name+' lock');
  assert.match(record.resolved,/^https:\/\/registry\.npmjs\.org\//,name+' official source');
  assert.match(record.integrity,/^sha512-/,name+' integrity');
  assert.equal(require(name+'/package.json').version,version,name+' actual installation');
 }
 const expressRequire=createRequire(require.resolve('express'));
 const urllibRequire=createRequire(require.resolve('urllib'));
 assert.equal(expressRequire('body-parser/package.json').version,reviewed['body-parser'],'Express uses the patched parser');
 assert.equal(urllibRequire('undici/package.json').version,reviewed.undici,'payment transport uses the patched client');
 assert.equal(require('alipay-sdk/package.json').version,'4.14.0');
 assert.equal(require('urllib/package.json').version,'4.9.1');
 assert.equal(manifest.overrides['alipay-sdk'].urllib,'4.9.1');
 assert.deepEqual(manifest.engines,{node:'>=22.14.0 <23'});
});

test('compressed JSON compatibility and late trailing bytes cannot crash request parsing',()=>isolated('compressed request parsing',String.raw`
 import assert from 'node:assert/strict';
 import express from 'express';
 import http from 'node:http';
 import {gzipSync,deflateSync} from 'node:zlib';
 const app=express(),parse=express.json({limit:'2mb'});let trailerClient;
 const tail=Buffer.alloc(1024,0x58);
 app.use((req,res,next)=>parse(req,res,error=>{
  if(error)return next(error);
  if(req.headers['x-isolated-trailer']==='yes'){
   // Only now send the remaining HTTP bytes: the decoder has finished, but
   // the request has not. Downstream must still be able to await its end.
   req.once('end',next);trailerClient.end(tail);return;
  }
  next();
 }));
 app.post('/parse',(req,res)=>res.json({value:req.body.value}));
 app.get('/health',(_req,res)=>res.json({ok:true}));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.type||'parse-error'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const port=server.address().port;
 const request=(body,encoding)=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,path:'/parse',method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':encoding,'Content-Length':body.length}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));res.on('error',reject);
  });req.on('error',reject);req.end(body);
 });
 try{
  const body=gzipSync(Buffer.from(JSON.stringify({value:'isolated compressed JSON'})));
  const good=await request(body,'gzip');assert.equal(good.status,200);assert.equal(JSON.parse(good.body).value,'isolated compressed JSON');
  const bad=await request(Buffer.from('not a valid compressed frame'),'gzip');assert.equal(bad.status,400);
  const gzipTail=await request(Buffer.concat([body,Buffer.from([0]),Buffer.alloc(100*1024,0x58)]),'gzip');
  assert.equal(gzipTail.status,200);assert.deepEqual(JSON.parse(gzipTail.body),{value:'isolated compressed JSON'});
  const first=Buffer.concat([deflateSync(Buffer.from(JSON.stringify({value:'late tail fixture'}))),Buffer.from([0])]);
  const late=await new Promise((resolve,reject)=>{
   trailerClient=http.request({host:'127.0.0.1',port,path:'/parse',method:'POST',agent:false,headers:{'Content-Type':'application/json','Content-Encoding':'deflate','Content-Length':first.length+tail.length,'X-Isolated-Trailer':'yes'}},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));res.on('error',reject);
   });trailerClient.on('error',reject);trailerClient.setTimeout(5000,()=>trailerClient.destroy(new Error('late-tail request did not finish')));trailerClient.write(first);
  });
  assert.equal(late.status,200);assert.deepEqual(JSON.parse(late.body),{value:'late tail fixture'});
  const health=await fetch('http://127.0.0.1:'+port+'/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true});
 }finally{await new Promise(r=>server.close(r));}
 console.log('PASS isolated security fixture');
`));

test('Multer survives a rejected file while another asynchronous filter is pending and accepts the next upload',()=>isolated('multipart teardown',String.raw`
 import assert from 'node:assert/strict';
 import express from 'express';
 import multer from 'multer';
 import {PassThrough} from 'node:stream';
 // A complete form need not make a late parser error. Exercise the upstream
 // regression's truncated-form shape with a real parked stream and no error
 // listener installed by this test (GHSA-q7qp-rjg7-q26m).
 await new Promise((resolve,reject)=>{
  const input=new PassThrough();let resume,parser,calls=0;
  const boundary='IsolatedPendingFilter';
  const raw=['--'+boundary,'Content-Disposition: form-data; name="waiting"; filename="waiting.txt"','Content-Type: text/plain','','a','--'+boundary,'Content-Disposition: form-data; name="reject"; filename="reject.txt"','Content-Type: text/plain','','b'].join('\r\n');
  const expected=new Error('isolated filter rejection');
  const middleware=multer({fileHwm:1,storage:multer.memoryStorage(),streamHandler(req,busboy){parser=busboy;req.pipe(busboy);},fileFilter(req,file,callback){
   if(file.fieldname==='waiting')resume=callback;
   else req.once('end',()=>setImmediate(()=>callback(expected)));
  }}).any();
  input.headers={'content-type':'multipart/form-data; boundary='+boundary,'content-length':Buffer.byteLength(raw)};
  middleware(input,null,error=>{
   try{assert.equal(error,expected);assert.equal(++calls,1);assert.equal(typeof resume,'function');}
   catch(failure){reject(failure);return;}
   setImmediate(()=>{
    parser.once('close',()=>{try{assert.equal(calls,1);assert.deepEqual(input.files,[]);resolve();}catch(failure){reject(failure);}});
    resume(null,true);
   });
  });input.end(raw);
 });
 const app=express(),held=[];
 const upload=multer({storage:multer.memoryStorage(),limits:{files:2,fileSize:1024},fileFilter(_req,file,done){
  if(file.originalname==='valid.txt')return done(null,true);
  held.push(done);
  if(held.length===2)queueMicrotask(()=>{held[0](new Error('isolated rejected upload'));setImmediate(()=>held[1](null,true));});
 }}).any();
 app.post('/upload',(req,res)=>upload(req,res,error=>{
  if(error)return res.status(400).json({error:'rejected'});
  res.json({files:req.files.map(f=>({name:f.originalname,text:f.buffer.toString()}))});
 }));app.get('/health',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const rejected=new FormData();rejected.append('file',new Blob(['rejected fixture']),'reject.txt');rejected.append('file',new Blob(['pending fixture']),'pending.txt');
  const bad=await fetch(base+'/upload',{method:'POST',body:rejected});assert.equal(bad.status,400);await bad.text();assert.equal(held.length,2);
  assert.deepEqual(await(await fetch(base+'/health')).json(),{ok:true});
  const valid=new FormData();valid.append('file',new Blob(['retained upload behavior']),'valid.txt');
  const good=await fetch(base+'/upload',{method:'POST',body:valid});assert.equal(good.status,200);assert.deepEqual(await good.json(),{files:[{name:'valid.txt',text:'retained upload behavior'}]});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 console.log('PASS isolated security fixture');
`));

test('Undici enforces mixed-case integrity and safely rejects a prematurely closed excessive encoding chain',()=>isolated('HTTP response safety',String.raw`
 import assert from 'node:assert/strict';
 import http from 'node:http';
 import {createHash} from 'node:crypto';
 import {fetch as request} from 'undici';
 const content='isolated integrity content';
 const server=http.createServer((req,res)=>{
  if(req.url==='/encoded'){res.writeHead(200,{'Content-Encoding':'gzip, gzip, gzip, gzip, gzip, gzip','Content-Length':'20'});res.flushHeaders();res.socket.end();return;}
  res.writeHead(200,{'Content-Type':'text/plain'});res.end(content);
 });server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const hash=createHash('sha256').update(content).digest('base64');
  assert.equal(await(await request(base,{integrity:'SHA256-'+hash})).text(),content);
  await assert.rejects(async()=>{await(await request(base,{integrity:'Sha256-'+createHash('sha256').update('different content').digest('base64')})).text();});
  await assert.rejects(async()=>{await(await request(base+'/encoded')).text();});
  assert.equal(await(await request(base)).text(),content);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 console.log('PASS isolated security fixture');
`));

test('oversized constrained Zod collections reject before accumulating per-entry errors',()=>isolated('collection validation',String.raw`
 import assert from 'node:assert/strict';
 import {z} from 'zod';
 const checks=[
  [z.array(z.number()).max(3),Array(5000).fill('not a number')],
  [z.set(z.number()).max(3),new Set(Array.from({length:5000},(_,i)=>'invalid-'+i))],
  [z.map(z.number(),z.number()).max(3),new Map(Array.from({length:5000},(_,i)=>['invalid-'+i,'not a number']))],
 ];
 for(const [schema,input] of checks){const result=schema.safeParse(input);assert.equal(result.success,false);assert.ok(result.error.issues.length<=3,'bounded oversized collection issues');}
 assert.deepEqual(z.array(z.number()).max(3).parse([1,2,3]),[1,2,3]);
 console.log('PASS isolated security fixture');
`));

test('patched Nodemailer preserves the actual mailbox in nested comments, groups and quoted local parts without SMTP',()=>isolated('local mail composition',String.raw`
 import assert from 'node:assert/strict';
 import nodemailer from 'nodemailer';
 import addressparser from 'nodemailer/lib/addressparser';
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
 try{
  for(const to of ['learner@example.invalid','"Learning; notes (private)" <learner@example.invalid>',{name:'Learning; notes (private)',address:'learner@example.invalid'}]){
   const info=await transport.sendMail({from:{name:'OneShowLearn',address:'sender@example.invalid'},to,subject:'课程验证',text:'隔离验证，不发送邮件。'});
   assert.ok(Buffer.isBuffer(info.message));assert.deepEqual(info.envelope.to,['learner@example.invalid']);assert.ok(info.messageId);
  }
  // Reduced fixtures from the upstream disclosures, with reserved test domains:
  // GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h.
  const cases=[
   ['Victim (x(y) <evil@evil.invalid>) <v@victim.invalid>','v@victim.invalid'],
   ['G: (a; <evil@evil.invalid>) <v@victim.invalid>;','v@victim.invalid'],
   ['G: "a;" "<evil@evil.invalid>" <v@victim.invalid>;','v@victim.invalid'],
   ['<"a@evil.invalid>"@good.invalid>','"a@evil.invalid>"@good.invalid'],
  ];
  for(const [to,expected] of cases){
   assert.deepEqual(addressparser(to,{flatten:true}).map(entry=>entry.address),[expected],'parser preserves the RFC mailbox before MIME normalization');
   const info=await transport.sendMail({from:'sender@example.invalid',to,subject:'isolated address regression',text:'Not sent.'});
   // v10.1.4 src/mime-node/index.ts:1846-1850 deliberately replaces angle
   // brackets/control bytes with spaces, even inside a quoted local part.
   // Do not confuse its documented MIME normalization with parser truncation:
   // the parser must preserve the full mailbox and the envelope/header must
   // both retain its actual domain, with no injected extra recipient.
   const normalized=expected.replace(/[\x00-\x1F\x7F<>]+/g,' ').trim();
   assert.deepEqual(info.envelope.to,[normalized]);assert.ok(Buffer.isBuffer(info.message));
   assert.equal(info.envelope.to[0].slice(info.envelope.to[0].lastIndexOf('@')+1),expected.slice(expected.lastIndexOf('@')+1));
   const header=info.message.toString().split(/\r?\n/).find(line=>line.startsWith('To: '));assert.ok(header);
   assert.deepEqual(addressparser(header.slice(4),{flatten:true}).map(entry=>entry.address),[normalized],'header and SMTP envelope agree on the one recipient');
  }
 }finally{transport.close();}
 console.log('PASS isolated security fixture');
`));
