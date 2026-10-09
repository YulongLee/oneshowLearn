import {Router} from 'express';
import {z} from 'zod';
import {row,rows,run,db} from './db.mjs';
import {requireOwner} from './auth.mjs';
import {rateLimit} from './account-security.mjs';

export function commercialSettings(){return row('SELECT * FROM commercial_settings WHERE id=1');}
// Deliberately discard query strings, resource IDs, search text and arbitrary paths.
export function metricRoute(value){
  if(typeof value!=='string')return null;
  const route=value.split(/[?#]/)[0];
  if(route==='/')return 'home';
  if(/^\/learn\/[^/]+\/lessons\/\d+$/.test(route))return 'lesson';
  if(/^\/projects(?:\/[^/]+(?:\/workspace)?)?$/.test(route))return 'projects';
  if(/^\/opc\/course\/[^/]+$/.test(route))return 'catalog';
  return ({'/':'home','/course-offer':'offer','/app':'workbench','/login':'login','/register':'register','/resources':'resources','/tutor':'tutor','/paths':'catalog','/opc':'catalog','/community':'community','/notes':'notes','/favorites':'favorites','/achievements':'outcomes','/account':'account'})[route]||null;
}
const event=z.object({id:z.string().uuid(),session:z.string().uuid(),kind:z.enum(['view','performance','error']),route:z.string().max(200),metric:z.enum(['LCP','INP','CLS','navigation','runtime','promise','asset','api']).optional(),value:z.number().finite().min(0).max(600000).optional()}).strict();
let lastPrune=0;
export function pruneTelemetry(){if(Date.now()-lastPrune<=900000)return;run("DELETE FROM telemetry_events WHERE created_at<datetime('now','-90 days')");run('DELETE FROM telemetry_events WHERE id < COALESCE((SELECT id FROM telemetry_events ORDER BY id DESC LIMIT 1 OFFSET 199999),0)');lastPrune=Date.now();}
export function commercialAnalyticsRouter(){
  const router=Router();
  router.get('/telemetry/config',(_req,res)=>res.set('Cache-Control','no-store').json({enabled:Boolean(commercialSettings().telemetry_enabled),retentionDays:90}));
  router.post('/telemetry/events',(req,res)=>{
    if(!commercialSettings().telemetry_enabled)return res.status(204).end();
    // First-party only. No credentials, IP address, user ID, text or full URL retained.
    if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'仅接受站内统计'});
    try{rateLimit('telemetry',req.ip,120,60);}catch{return res.status(429).end();}
    const parsed=z.object({items:z.array(event).min(1).max(20)}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'统计格式无效'});
    const items=parsed.data.items.map(e=>({...e,route:metricRoute(e.route)}));
    if(items.some(e=>!e.route||e.kind==='performance'&&(!['LCP','INP','CLS','navigation'].includes(e.metric)||e.value===undefined||(e.metric==='CLS'&&e.value>100))||e.kind==='error'&&(!['runtime','promise','asset','api'].includes(e.metric)||e.value!==undefined)||e.kind==='view'&&(e.metric!==undefined||e.value!==undefined)))return res.status(400).json({error:'统计范围无效'});
    db.exec('BEGIN IMMEDIATE');try{
      for(const e of items){
        run('INSERT OR IGNORE INTO telemetry_events(event_id,session_id,kind,route,metric,value) VALUES(?,?,?,?,?,?)',[e.id,e.session,e.kind,e.route,e.metric||'',e.kind==='performance'?e.value:null]);
        if(e.kind==='performance')run("UPDATE telemetry_events SET value=MAX(value,?),created_at=CURRENT_TIMESTAMP WHERE session_id=? AND route=? AND metric=? AND kind='performance'",[e.value,e.session,e.route,e.metric]);
      }
      pruneTelemetry();
      db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');return res.status(503).end();}
    res.status(204).end();
  });
  router.get('/admin/commercial/settings',requireOwner,(_req,res)=>res.set('Cache-Control','private, no-store').json(commercialSettings()));
  router.put('/admin/commercial/settings',requireOwner,(req,res)=>{
    const p=z.object({telemetry_enabled:z.boolean(),parser_enabled:z.boolean()}).strict().safeParse(req.body);
    if(!p.success)return res.status(400).json({error:'设置格式无效'});
    const result=run('UPDATE commercial_settings SET telemetry_enabled=?,parser_enabled=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND version=?',[+p.data.telemetry_enabled,+p.data.parser_enabled,Number(req.headers['if-match'])]);
    if(!result.changes)return res.status(409).json({error:'设置已变化，请刷新后重试'});
    run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'commercial-settings',1,'统计与解析设置','saved','save']);
    res.json(commercialSettings());
  });
  router.get('/admin/analytics',requireOwner,(req,res)=>{
    const days=Number(req.query.days||7);if(![7,30,90].includes(days))return res.status(400).json({error:'请选择 7、30 或 90 天'});
    const start=new Date(Date.now()-days*86400000).toISOString(),end=new Date().toISOString();
    // Ordered server-recorded cohort, queried together rather than issuing one query per account.
    const cohort=row(`WITH cohort AS (SELECT id,created_at FROM users WHERE role='learner' AND julianday(created_at) BETWEEN julianday(?) AND julianday(?)),
     paid AS (SELECT u.id,MIN(o.paid_at) at FROM cohort u JOIN orders o ON o.user_id=u.id WHERE o.status IN ('paid','refunded')
      AND julianday(o.created_at)>=julianday(u.created_at) AND julianday(o.paid_at) BETWEEN julianday(o.created_at) AND julianday(?) GROUP BY u.id)
     SELECT (SELECT COUNT(*) FROM cohort) registered,
      (SELECT COUNT(*) FROM cohort u WHERE EXISTS(SELECT 1 FROM orders o WHERE o.user_id=u.id AND julianday(o.created_at) BETWEEN julianday(u.created_at) AND julianday(?))) checkout,
      (SELECT COUNT(*) FROM paid) paid,
      (SELECT COUNT(*) FROM paid p WHERE EXISTS(SELECT 1 FROM learning_progress l WHERE l.user_id=p.id AND julianday(l.updated_at) BETWEEN julianday(p.at) AND julianday(?))) learned`,[start,end,end,end,end]);
    const traffic=rows(`SELECT route,COUNT(*) views,COUNT(DISTINCT session_id) sessions FROM telemetry_events WHERE kind='view' AND julianday(created_at)>=julianday(?) GROUP BY route ORDER BY views DESC`,[start]);
    const perf=rows(`SELECT route,metric,value FROM telemetry_events WHERE kind='performance' AND julianday(created_at)>=julianday(?) ORDER BY id DESC LIMIT 50000`,[start]);
    const groups=new Map();for(const p of perf){const k=p.route+':'+p.metric;if(!groups.has(k))groups.set(k,{route:p.route,metric:p.metric,values:[]});groups.get(k).values.push(p.value);}
    const performance=[...groups.values()].map(g=>{g.values.sort((a,b)=>a-b);return {route:g.route,metric:g.metric,samples:g.values.length,p75:g.values[Math.max(0,Math.ceil(g.values.length*.75)-1)]};});
    const errors=rows(`SELECT route,metric,COUNT(*) count FROM telemetry_events WHERE kind='error' AND julianday(created_at)>=julianday(?) GROUP BY route,metric ORDER BY count DESC`,[start]);
    const financial=row(`SELECT COUNT(*) orders,COALESCE(SUM(amount_cents),0) grossCents FROM orders WHERE status IN ('paid','refunded') AND julianday(paid_at)>=julianday(?) AND julianday(paid_at)<=julianday(?)`,[start,end]);
    const refunds=row(`SELECT COALESCE(SUM(amount_cents),0) cents FROM manual_refund_records WHERE julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?)`,[start,end]);
    res.set('Cache-Control','private, no-store').json({days,start,end,enabled:Boolean(commercialSettings().telemetry_enabled),cohort:{...cohort,paidRate:cohort.registered?cohort.paid/cohort.registered:null,learnedRate:cohort.paid?cohort.learned/cohort.paid:null},traffic,performance,errors,financial:{...financial,recordedRefundCents:refunds.cents},performanceSampleLimit:50000});
  });return router;
}
