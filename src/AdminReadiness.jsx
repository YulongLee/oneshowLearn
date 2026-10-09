import {useEffect,useState} from 'react';
import {api,money} from './api.js';
import './functional-hardening.css';
export function AdminReadiness({navigate}){
 const [data,setData]=useState(null),[offset,setOffset]=useState(0),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError('');api('/admin/readiness?offset='+offset).then(d=>{if(active)setData(d);}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[offset,retry]);
 const capabilities=data?.capabilities;
 const action=(label,path)=>navigate&&<button type="button" onClick={()=>navigate(path)}>{label} →</button>;
 return <>
  <div className="admin-page-head"><div><h1>正式交付检查</h1><p>只读检查真实配置与课时素材，不会发布、调用模型或支付接口。</p></div></div>
  {error&&<p className="admin-error" role="alert">{error}<button onClick={()=>setRetry(v=>v+1)}>重试</button></p>}
  {!data?!error&&<p>正在读取检查结果…</p>:<>
   <section className="admin-panel"><h2>运营准备</h2><div className="readiness-capabilities">
    <article><h3>服务与售后</h3><p>服务说明 {data.service.published?'已发布':'待发布'} · 主体 {data.service.operatorReady?'已填写':'待提供'} · 联系方式 {data.service.contactReady?'已填写':'待提供'}</p>{action('完善服务说明','/admin/service')}</article>
    <article><h3>会员群与官方内容</h3><p>会员群 {data.groupReady?'已配置有效入口':'待准备入口'} · 官方文章 {data.officialArticles} 篇</p>{action('管理学习社区','/admin/community')}</article>
    {capabilities&&<><article><h3>MinerU 文档解析</h3><p>{capabilities.parser.configured?'接口已配置':'接口待配置'} · {capabilities.parser.enabled?'解析已启用':'解析未启用'} · {capabilities.parser.jobs} 条任务记录</p>{action('管理文档解析','/admin/parsing')}</article>
    <article><h3>经营与性能统计</h3><p>隐私限定统计{capabilities.telemetry.enabled?'已启用':'未启用'} · {capabilities.telemetry.events} 条实际记录</p>{action('查看经营分析','/admin/analytics')}</article>
    <article><h3>课程结业证书</h3><p>{capabilities.certificates.issued} 份已发证书</p>{capabilities.certificates.courses.map(c=><p key={c.id}>{c.title}：{c.total} 节 · {c.demo} 节演示 · {c.empty} 节待补素材 · {c.enabled&&c.current&&!c.demo&&!c.empty&&c.total?'发证已启用':c.enabled?'需确认教学目录':'发证未启用'}</p>)}{action('确认发证目录','/admin/certificates')}</article></>}
   </div><p className="cms-hint">真实主体、联系方式、承诺和入群资料由运营方确认；本页不会代填或自动开启服务。</p></section>
   <section className="admin-panel"><h2>经营记录</h2><div className="admin-metrics">{[['注册学员',data.metrics.registeredAccounts],['已验证邮箱',data.metrics.verifiedEmailAccounts],['有效已付账号',data.metrics.paidBuyers],['有学习记录账号',data.metrics.learningAccounts]].map(([k,v])=><article key={k}><span>{k}</span><strong>{v}</strong></article>)}</div><p>当前已付订单金额 {money(data.metrics.paidOrderAmountCents)}；人工核实登记退款 {money(data.metrics.recordedRefundCents)}。两者并非同一统计口径，不据此推断净结算。</p></section>
   <section className="admin-panel"><h2>课时素材检查</h2><div className="readiness-lessons">{data.items.map(p=><article key={p.id}><h3>#{p.id} {p.title}</h3><dl>{[['教学状态',p.demo?'演示素材':'正式课时'],['视频',p.hasVideo?'已配置':'待补充'],['课件',p.hasCourseware?'已配置':'待补充'],['字幕',p.hasSubtitle?'已配置':'未配置'],['文字知识资料',p.hasRetrievableText?'存在发布文字':'待补充文字']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></article>)}</div>
    {!data.items.length&&<p>当前范围没有已发布课时。</p>}
    <nav className="support-actions" aria-label="交付检查分页"><button disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-20))}>上一页</button><span>{data.total} 项 · 第 {Math.floor(offset/20)+1} 页</span><button disabled={offset+20>=data.total} onClick={()=>setOffset(v=>v+20)}>下一页</button></nav>{data.limitations.map(text=><p className="cms-hint" key={text}>{text}</p>)}
   </section>
  </>}
 </>;
}
