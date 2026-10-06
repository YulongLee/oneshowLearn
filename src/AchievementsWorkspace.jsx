import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,Clock,Code,Cube,DotsThree,FileText,Image as ImageIcon,LockSimple,MagnifyingGlass,Plus,Rocket,Trash,X} from '@phosphor-icons/react';
import {api} from './api.js';
import {STAGES,liveAchievements,shortDate,tagsFromText} from './personal-model.js';
import {Gate,Modal as SharedModal,SafeLink} from './PersonalShared.jsx';
import {OUTCOME_TYPES,OUTCOME_STARTERS,outcomeSummary,outcomeSource,filterOutcomes,outcomeCoverUrl,validateOutcome,saveOutcome,archiveOutcome} from './achievement-library-model.js';
import './achievement-library.css';

const icons={product:Cube,work:ImageIcon,document:FileText,code:Code};
const typeLabel=type=>OUTCOME_TYPES.find(([id])=>id===type)?.[1]||'成果记录';
const date=value=>value&&Number.isFinite(Date.parse(value))?shortDate(value):'时间未记录';
const blank=stage=>({id:crypto.randomUUID(),title:'',description:'',type:'product',stage:stage||'building',url:'',githubUrl:'',screenshotUrl:'',tags:[]});
function Modal(props){const titleId=useId();return <SharedModal {...props} titleId={titleId}/>;}
function OutcomeCover({item,open,detail=false}){
 const src=outcomeCoverUrl(item.screenshotUrl),[broken,setBroken]=useState(false),Icon=icons[item.type]||Cube;
 useEffect(()=>setBroken(false),[src]);
 const content=src&&!broken?<img src={src} alt={item.title+'的作品截图'} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>:<div className="ag-placeholder" aria-hidden="true"><span><Icon size={52} weight="duotone"/><i/><i/><i/></span><small>{item.screenshotUrl?'截图暂不可显示':'尚未添加作品截图'}</small></div>;
 return detail?<div className={'ag-cover ag-cover-'+item.type}>{content}</div>:<button className={'ag-cover ag-cover-'+item.type} aria-label={'查看成果：'+item.title} onClick={open}>{content}</button>;
}
export function AchievementsWorkspace({model,navigate,notify,query='',setQuery,guard}){
 const [category,setCategory]=useState('all'),[stage,setStage]=useState('all'),[sort,setSort]=useState('updated');
 const [projects,setProjects]=useState([]),[projectStatus,setProjectStatus]=useState('loading'),[retry,setRetry]=useState(0);
 const [draft,setDraft]=useState(null),[detailId,setDetailId]=useState(null),[archiveOpen,setArchiveOpen]=useState(false),[operation,setOperation]=useState(null),[leave,setLeave]=useState(null),[error,setError]=useState(''),[localBusy,setLocalBusy]=useState(false);
 const saving=useRef(false),draftRef=useRef(null),modelRef=useRef(model),guardRef=useRef(null),navigationDecision=useRef(null);
 draftRef.current=draft;modelRef.current=model;
 const records=model.state.achievements||[],achievements=liveAchievements(model.state),archived=records.filter(i=>i.deletedAt),summary=outcomeSummary(achievements);
 const shown=filterOutcomes(achievements,{category,stage,query,sort,projects}),filtered=category!=='all'||stage!=='all'||Boolean(query.trim());
 const blocked=model.busy||model.loading||Boolean(model.error)||localBusy,limitReached=records.length>=100;
 const detail=records.find(i=>i.id===detailId&&!i.deletedAt);
 useEffect(()=>{let active=true;setProjects([]);if(!model.user){setProjectStatus('ready');return;}setProjectStatus('loading');api('/learning/me/projects').then(d=>{if(active){setProjects(d.items||[]);setProjectStatus('ready');}}).catch(()=>{if(active)setProjectStatus('error');});return()=>{active=false;};},[model.user?.id,retry]);
 const isDirty=()=>{const d=draftRef.current;return Boolean(d&&(JSON.stringify(d.value)!==JSON.stringify(d.initial)||d.tagsText!==d.initialTags));};
 const confirmLeave=proceed=>{if(saving.current||modelRef.current.busy)return false;if(!isDirty())return true;setLeave(()=>proceed);return false;};
 guardRef.current=confirmLeave;
 useEffect(()=>{
  const current=proceed=>guardRef.current(proceed);if(guard)guard.current=current;
  const before=e=>{if(isDirty()){e.preventDefault();e.returnValue='';}};
  const routeBefore=e=>{if(!isDirty()&&!saving.current)return;if(saving.current){e.preventDefault();return;}e.detail.waitUntil(()=>new Promise(resolve=>{navigationDecision.current=resolve;setLeave(()=>()=>resolve(true));}),()=>isDirty());};
  window.addEventListener('beforeunload',before);
  window.addEventListener('oneshowlearn:before-navigate',routeBefore);
  return()=>{if(guard?.current===current)guard.current=null;window.removeEventListener('beforeunload',before);window.removeEventListener('oneshowlearn:before-navigate',routeBefore);navigationDecision.current?.(false);};
 },[]);
 const keepEditing=()=>{setLeave(null);navigationDecision.current?.(false);navigationDecision.current=null;};
 const closeEditor=()=>{if(confirmLeave(()=>{setDraft(null);setError('');})){setDraft(null);setError('');}};
 const edit=(item,initialStage)=>{
  if(!model.user)return navigate('/login?returnTo=%2Fachievements');if(blocked)return;
  if(!item&&limitReached){notify('成果记录最多保存 100 项，归档记录也会保留。');return;}
  const value=item?{...item}:blank(initialStage),tagsText=(value.tags||[]).join(', ');
  setDraft({value,initial:value,base:item||null,tagsText,initialTags:tagsText});setDetailId(null);setError('');
 };
 const change=(key,value)=>setDraft(d=>({...d,value:{...d.value,[key]:value}}));
 const save=async e=>{
  e.preventDefault();if(!draft||blocked||saving.current)return;
  const tags=tagsFromText(draft.tagsText),issue=validateOutcome(draft.value,tags);if(issue){setError(issue);return;}
  const current=records.find(i=>i.id===draft.value.id);
  if(draft.base&&JSON.stringify(current)!==JSON.stringify(draft.base)){setError('这项成果已在其他窗口更新或归档。当前输入仍保留，请查看最新记录后再编辑，不能直接覆盖。');return;}
  if(!draft.base&&limitReached){setError('成果记录已达到 100 项上限，当前输入仍保留。');return;}
  const now=new Date().toISOString(),item={...draft.value,title:draft.value.title.trim(),tags,createdAt:draft.base?.createdAt||now,updatedAt:now};
  for(const key of ['url','githubUrl','screenshotUrl'])if(item[key]!==undefined)item[key]=item[key].trim();
  if(item.sourceProjectId===undefined)delete item.sourceProjectId;
  saving.current=true;setLocalBusy(true);setError('');
  try{if(await model.saveState(saveOutcome(model.state,item))){setDraft(null);setDetailId(item.id);notify('成果已保存，仅当前账号可见');}else setError('保存未成功，当前输入已保留。请核对最新记录或稍后重试。');}
  catch{setError('暂时无法保存，当前输入已保留，请稍后重试。');}
  finally{saving.current=false;setLocalBusy(false);}
 };
 const applyOperation=async()=>{
  if(!operation||blocked||saving.current)return;
  const current=records.find(i=>i.id===operation.item.id);
  if(JSON.stringify(current)!==JSON.stringify(operation.item)){setError('这项成果已在其他窗口更新，请取消操作后核对最新记录。');return;}
  saving.current=true;setLocalBusy(true);setError('');
  try{if(await model.saveState(archiveOutcome(model.state,current.id,operation.restore?null:new Date().toISOString()))){setOperation(null);if(!operation.restore)setDetailId(null);notify(operation.restore?'成果已恢复':'成果已归档，可以恢复');}else setError('未能保存本次操作，原成果仍保留，请核对最新记录后重试。');}
  catch{setError('操作暂未完成，原成果仍保留，请稍后重试。');}
  finally{saving.current=false;setLocalBusy(false);}
 };
 const reset=()=>{setCategory('all');setStage('all');setQuery('');};
 const sourceView=item=>{
  const s=outcomeSource(item,projects,projectStatus);
  return s.project?<button className="ag-source" aria-label={'查看关联项目：'+s.project.title} onClick={()=>navigate('/projects/'+encodeURIComponent(s.project.slug))}><Cube size={16}/>{s.label}<ArrowRight size={14}/></button>:<p className="ag-source"><Cube size={16}/>{s.label}</p>;
 };
 return <div className="ag-page">
  <header className="ag-heading"><div><nav aria-label="当前位置"><button onClick={()=>navigate('/app')}>工作台</button><span>›</span><span>我的成果</span></nav><h1>我的成果</h1><p>把想法、原型和上线过程，整理成自己的作品。</p></div><div className="ag-heading-actions"><span><LockSimple size={15}/>仅自己可见</span>{model.user&&<button className="ag-button" disabled={blocked} onClick={()=>{setArchiveOpen(true);setError('');}}>已归档{archived.length>0?' ('+archived.length+')':''}</button>}<button className="ag-primary" disabled={blocked||model.user&&limitReached} onClick={()=>edit()}><Plus size={18}/>新建成果</button></div></header>
  {model.error?<div className="ag-notice" role="alert">成果数据暂时无法读取，请重试后再操作。<button onClick={()=>model.refresh()}>重新加载</button></div>:<Gate model={model} navigate={navigate}>
   {model.loading?<p className="ag-notice" role="status">正在读取你的成果…</p>:<>
    {achievements.length>0?<>
     <section className="ag-summary" aria-label="成果概览"><div className="ag-summary-copy"><Cube size={34}/><div><h2>从课程实践，到你的 AI 产品</h2><p>把学习中的每一次尝试，整理成看得见的作品。</p></div></div><dl>{[['成果记录',summary.total],['开发中',summary.building],['已上线',summary.launched]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
     <div className="ag-toolbar"><nav aria-label="成果类型">{OUTCOME_TYPES.map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{label}</button>)}</nav><div className="ag-tools"><label className="ag-search"><MagnifyingGlass size={19}/><input aria-label="在成果中搜索" placeholder="搜索成果、项目或标签…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清空成果搜索" onClick={()=>setQuery('')}><X size={16}/></button>}</label><select aria-label="成果阶段" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">全部阶段</option>{Object.entries(STAGES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select aria-label="成果排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">最新更新</option><option value="title">按名称排序</option></select></div></div>
     {projectStatus==='error'&&achievements.some(i=>i.sourceProjectId)&&<div className="ag-notice" role="alert">关联项目暂时无法读取，成果记录仍然保留。<button onClick={()=>setRetry(v=>v+1)}>重新加载项目</button></div>}
     {filtered&&<div className="ag-filter-result" role="status">找到 {shown.length} 项成果<button onClick={reset}>清除筛选</button></div>}
     {shown.length?<div className="ag-grid">{shown.map(item=><article className="ag-card" key={item.id}>
      <OutcomeCover item={item} open={()=>setDetailId(item.id)}/>
      <div className="ag-card-body"><div className="ag-card-heading"><button className="ag-title" onClick={()=>setDetailId(item.id)}><h2>{item.title}</h2></button><span className={'ag-stage ag-stage-'+item.stage} title="你记录的项目阶段">{STAGES[item.stage]||'个人记录'}</span><details className="ag-menu" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary').focus();}}}><summary aria-label={'更多操作：'+item.title}><DotsThree size={22}/></summary><div><button disabled={blocked} onClick={e=>{e.currentTarget.closest('details').open=false;edit(item);}}>编辑成果</button><button disabled={blocked} onClick={e=>{e.currentTarget.closest('details').open=false;setOperation({item,restore:false});setError('');}}>归档成果</button></div></details></div>
       <p className="ag-description">{item.description||'记录这次实践的目标、过程和结果。'}</p>{sourceView(item)}<div className="ag-tags"><span className="ag-type">{typeLabel(item.type)}</span>{(item.tags||[]).slice(0,3).map(t=><span key={t}>{t}</span>)}</div>
       <footer><span><Clock size={13}/>{date(item.updatedAt)} 更新</span><div><button className="ag-text" aria-label={'打开成果详情：'+item.title} onClick={()=>setDetailId(item.id)}>查看成果<ArrowRight size={15}/></button>{(item.type==='code'?item.githubUrl||item.url:item.url)&&<SafeLink url={item.type==='code'?item.githubUrl||item.url:item.url}>{item.type==='code'?'代码':'作品'}</SafeLink>}</div></footer>
      </div>
     </article>)}</div>:<section className="ag-empty"><MagnifyingGlass size={38}/><h2>没有找到匹配的成果</h2><p>试试其他类型、阶段或更短的关键词。</p><button className="ag-button" onClick={reset}>查看全部成果<ArrowRight size={16}/></button></section>}
     <p className="ag-footnote"><LockSimple size={14}/>成果仅自己可见；项目阶段由你记录和更新。</p>
    </>:<section className="ag-empty ag-initial"><div className="ag-empty-icon"><Cube size={38}/></div><h2>你的第一个成果，从这里开始</h2><p>不一定要等上线，一个想法或原型也值得留下。</p><div className="ag-starters">{OUTCOME_STARTERS.map((t,index)=>{const Icon=[FileText,Code,Rocket][index];return <button key={t.id} disabled={blocked||limitReached} onClick={()=>edit(null,t.stage)}><Icon size={27}/><span><strong>{t.title}</strong><small>{t.description}</small></span><ArrowRight size={16}/></button>;})}</div><small>只打开空白记录，不会自动生成、发布或认证成果。</small></section>}
    {limitReached&&<p className="ag-notice">已达到 100 项记录上限，归档记录也计入上限；已有成果仍可编辑或恢复。</p>}
   </>}
  </Gate>}
  {draft&&<Modal title={draft.base?'编辑成果':'新建成果'} close={closeEditor}><form className="ps-form ag-form" onSubmit={save}><fieldset className="ag-fields" disabled={localBusy}>
   <label>成果名称<input autoFocus required maxLength={120} value={draft.value.title} onChange={e=>change('title',e.target.value)}/></label>
   <div><label>成果类型<select aria-label="成果记录类型" value={draft.value.type} onChange={e=>change('type',e.target.value)}>{OUTCOME_TYPES.slice(1).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>当前阶段<select aria-label="当前阶段" value={draft.value.stage} onChange={e=>change('stage',e.target.value)}>{Object.entries(STAGES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
   <label>成果描述<textarea aria-label="成果描述" rows={4} maxLength={5000} placeholder="这次解决了什么问题？已经完成什么，下一步准备做什么？" value={draft.value.description||''} onChange={e=>change('description',e.target.value)}/></label>
   <label>关联实战项目（可选）<select aria-label="关联实战项目（可选）" disabled={projectStatus!=='ready'} value={draft.value.sourceProjectId||''} onChange={e=>change('sourceProjectId',e.target.value?Number(e.target.value):undefined)}><option value="">个人成果记录</option>{draft.value.sourceProjectId&&!projects.some(p=>p.id===draft.value.sourceProjectId)&&<option value={draft.value.sourceProjectId}>原关联项目暂不可用（保留关联）</option>}{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><small>只可关联当前账号已开始的项目，不会创建新的项目学习记录。{projectStatus==='error'?'关联项目加载失败，原关联会保留。':''}</small></label>{projectStatus==='error'&&<button type="button" className="ag-button" onClick={()=>setRetry(v=>v+1)}>重新加载关联项目</button>}
   <label>作品链接（可选）<input type="url" placeholder="https://" maxLength={2000} value={draft.value.url||''} onChange={e=>change('url',e.target.value)}/></label>
   <label>代码仓库链接（可选）<input type="url" placeholder="https://" maxLength={2000} value={draft.value.githubUrl||''} onChange={e=>change('githubUrl',e.target.value)}/></label>
   <label>作品截图地址（可选）<input type="url" placeholder="https://…/screenshot.png" maxLength={2000} value={draft.value.screenshotUrl||''} onChange={e=>change('screenshotUrl',e.target.value)}/><small>使用已有图片的 HTTPS 地址展示；不上传图片，不改变原图片的访问权限。</small></label>
   <label>标签（逗号分隔，最多 8 个）<input maxLength={200} value={draft.tagsText} onChange={e=>setDraft(d=>({...d,tagsText:e.target.value}))}/></label>
   <p className="ag-editor-note"><LockSimple size={15}/>保存为私人记录，阶段由你填写，不会发布到社区或发放证书。</p>
   {error&&<p className="ps-alert" role="alert">{error}{draft.base&&<button type="button" onClick={()=>{const action=()=>{setDetailId(draft.value.id);setDraft(null);setError('');};if(confirmLeave(action))action();}}>查看最新记录</button>}</p>}
   <div className="ag-form-actions"><button type="button" className="ag-button" disabled={localBusy} onClick={closeEditor}>取消编辑</button><button className="ag-primary" disabled={blocked}>{localBusy?'正在保存…':'保存成果'}<ArrowRight size={16}/></button></div>
  </fieldset></form></Modal>}
  {detailId&&!draft&&<Modal title={detail?.title||'成果暂不可用'} close={()=>setDetailId(null)}><div className="ag-detail">{detail?<><div className="ag-detail-meta"><span>{typeLabel(detail.type)}</span><span className={'ag-stage ag-stage-'+detail.stage}>{STAGES[detail.stage]||'个人记录'}</span><span><LockSimple size={14}/>仅自己可见</span></div><OutcomeCover item={detail} detail/><p className="ag-detail-body">{detail.description||'暂无说明，可以编辑补充这次实践的目标、过程和结果。'}</p>{sourceView(detail)}<div className="ag-detail-links">{detail.url&&<SafeLink url={detail.url}>打开作品链接</SafeLink>}{detail.githubUrl&&<SafeLink url={detail.githubUrl}>打开代码仓库</SafeLink>}{detail.screenshotUrl&&<SafeLink url={detail.screenshotUrl}>查看原截图</SafeLink>}</div>{detail.tags?.length>0&&<div className="ag-tags">{detail.tags.map(t=><span key={t}>{t}</span>)}</div>}<dl className="ag-detail-dates"><div><dt>创建记录</dt><dd>{date(detail.createdAt)}</dd></div><div><dt>最近更新</dt><dd>{date(detail.updatedAt)}</dd></div></dl><p className="ag-editor-note">以上为成果记录的创建与更新时间；项目阶段由你填写。</p><div className="ag-form-actions"><button className="ag-button" disabled={blocked} onClick={()=>{setOperation({item:detail,restore:false});setError('');}}><Trash size={16}/>归档成果</button><button className="ag-primary" disabled={blocked} onClick={()=>edit(detail)}>编辑成果</button></div></>:<p>这项成果可能已归档或在其他窗口更新，请关闭后查看最新列表。</p>}</div></Modal>}
  {archiveOpen&&<Modal title="已归档成果" close={()=>{if(!saving.current)setArchiveOpen(false);}}><div className="ag-archive"><p>归档不会删除成果，恢复后将回到作品库。</p>{archived.length?archived.map(item=><div key={item.id}><span><strong>{item.title}</strong><small>{typeLabel(item.type)} · {STAGES[item.stage]||'个人记录'}</small></span><button className="ag-button" disabled={blocked} onClick={()=>{setOperation({item,restore:true});setError('');}}>恢复成果</button></div>):<p>暂无已归档的成果。</p>}</div></Modal>}
  {operation&&<Modal title={operation.restore?'恢复这项成果？':'归档这项成果？'} close={()=>{if(!saving.current){setOperation(null);setError('');}}}><div className="ag-confirm"><p>「{operation.item.title}」{operation.restore?'将恢复到作品库，原链接与描述会保留。':'将从作品库移入归档，原记录、链接与项目关联仍保留，之后可以恢复。'}</p>{error&&<p className="ps-alert" role="alert">{error}</p>}<div className="ag-form-actions"><button className="ag-button" disabled={localBusy} onClick={()=>{setOperation(null);setError('');}}>取消操作</button><button className="ag-primary" disabled={blocked} onClick={applyOperation}>{localBusy?'正在保存…':operation.restore?'确认恢复':'确认归档'}</button></div></div></Modal>}
  {leave&&<Modal title="有尚未保存的成果修改" close={keepEditing}><div className="ag-confirm"><p>离开编辑将放弃当前修改，账号中已保存的成果不会受影响。</p><div className="ag-form-actions"><button className="ag-button" onClick={keepEditing}>继续编辑</button><button className="ag-primary" onClick={()=>{const proceed=leave;draftRef.current=null;navigationDecision.current=null;setLeave(null);setDraft(null);setError('');proceed();}}>放弃修改并继续</button></div></div></Modal>}
 </div>;
}
