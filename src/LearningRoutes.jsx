import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Circle,Code,Lightbulb,MapTrifold,Money,Rocket,ChartLineUp} from '@phosphor-icons/react';
import {api} from './api.js';
import {routeOverview,coursePhasePath} from './learning-route-model.js';
import './learning-routes.css';

const phaseIcons=[Lightbulb,Code,Rocket,Money,ChartLineUp];
const outputs=['产品 PRD','可运行的 MVP','上线的产品','商业化方案','增长与迭代计划'];

export function LearningRoutes({curriculum=[],loading=false,error='',onRetry,navigate}) {
  const [expandedPhase,setExpandedPhase]=useState(null);
  const [catalog,setCatalog]=useState([]),[catalogStatus,setCatalogStatus]=useState('idle');
  const catalogRevision=useRef(0);
  const data=routeOverview(curriculum);
  useEffect(()=>()=>{catalogRevision.current++;},[]);
  const loadCatalog=async()=>{
    const request=++catalogRevision.current;setCatalogStatus('loading');
    try {const result=await api('/catalog/paths');if(request===catalogRevision.current){setCatalog(result.items);setCatalogStatus('ready');}}
    catch {if(request===catalogRevision.current)setCatalogStatus('error');}
  };
  const goPhase=id=>navigate(coursePhasePath(id));
  return <div className="lr-space lr-roadmap"><div className="lr-primary">
    <section className="lr-panel lr-overview"><header className="lr-overview-head"><div><h2>从哪里开始，向哪里前进</h2><p>按照阶段循序渐进，也可以回到任意阶段复习。</p></div><div className="lr-overall"><strong>整体学习进度</strong><div><progress aria-label="学习路线整体进度" max="100" value={data.progress.percent}/><b>{loading||error?'—':data.progress.percent+'%'}</b></div><small>{loading?'正在同步课程进度…':error?'进度暂时不可用':data.progress.total?'已完成 '+data.progress.completed+' / '+data.progress.total+' 项内容 · '+data.completedPhases+' / 5 个阶段':'内容待发布，尚无学习记录'}</small></div></header>
    {error&&<div className="lr-error" role="alert">学习路线暂时无法加载。<button onClick={onRetry}>重新加载</button></div>}
    <div className="lr-stage-grid" aria-label="五阶段学习路线">{data.phases.map((phase,index)=>{
      const Icon=phaseIcons[index],complete=phase.progress.total>0&&phase.progress.percent===100;
      const expanded=phase.id===(expandedPhase===null?data.current:expandedPhase);
      const isCurrent=phase.id===data.current,locked=phase.items.length>0&&phase.items.every(item=>item.locked);
      return <article key={phase.id} className={'lr-stage lr-'+phase.tone+(isCurrent?' current':'')}>
        <header><span className="lr-stage-icon">{complete?<Check size={23}/>:<Icon size={23}/>}</span><div><small>0{phase.id}</small><h3>{phase.title}</h3></div></header><p className="lr-stage-sub">{phase.subtitle}</p>
        <button className="lr-stage-toggle" aria-expanded={expanded} aria-controls={'phase-content-'+phase.id} onClick={()=>setExpandedPhase(expanded?0:phase.id)}>{expanded?'收起阶段目标':'展开阶段目标'}<span>{loading||error?'—':phase.items.length?phase.progress.percent+'%':'内容待发布'}</span></button>
        <div id={'phase-content-'+phase.id} className={'lr-stage-body '+(expanded?'is-expanded':'')}><ul>{phase.goals.map(goal=><li key={goal} className="lr-goal-item"><Circle size={14}/><span>{goal}</span></li>)}</ul><footer>阶段产出：{outputs[index]}</footer>
        <div className="lr-stage-progress">{loading?<span>正在读取…</span>:error?<span>暂不可用</span>:!phase.items.length?<span>内容待发布</span>:locked?<span>需课程学习权限</span>:<><progress aria-label={phase.title+'进度'} max="100" value={phase.progress.percent}/><b>{phase.progress.percent}%</b></>}</div>
        <button className={'lr-stage-action '+(isCurrent&&phase.items.length?'primary':'')} disabled={loading||!!error} onClick={()=>goPhase(phase.id)}>{complete?'回顾本阶段':phase.items.some(item=>!item.locked)?'进入阶段学习':'查看阶段内容'}<ArrowRight size={14}/></button></div>
      </article>;
    })}</div><p className="lr-content-hint">选择一个阶段，即可回到对应章节。路线与课程共用同一份学习进度。</p></section>
    <details className="lr-panel lr-directions" onToggle={event=>{if(event.currentTarget.open&&catalogStatus==='idle')loadCatalog();}}><summary><MapTrifold size={22}/><span><strong>探索其他学习方向</strong><small>除了 AI OPC 主线，也可以按需要选择专项课程。</small></span><span className="lr-directions-hint">展开目录</span></summary><div className="lr-map-catalog">{catalogStatus==='loading'?<p role="status">正在读取已发布学习方向…</p>:catalogStatus==='error'?<p role="alert">暂时无法读取。<button onClick={loadCatalog}>重试</button></p>:catalog.map(path=><button key={path.id} onClick={()=>navigate('/paths/'+path.slug)}><MapTrifold size={20}/><span>{path.title}<small>{path.pack_count||0} 个项目包</small></span><ArrowRight size={16}/></button>)}{catalogStatus==='ready'&&!catalog.length&&<p>学习方向发布后将在此展示。</p>}</div></details>
  </div></div>;
}
