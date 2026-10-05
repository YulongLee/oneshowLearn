import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpenText,CheckCircle,FileText,LockKey} from '@phosphor-icons/react';
import {api} from './api.js';
import {CONTENT_TYPES,safeResourceUrl} from './opc-model.js';
import {Markdown} from './PersonalShared.jsx';
import {nextReadingItem,readingProgress} from './course-reader-model.js';
import './course-reader.css';
import {LessonWorkspace,lessonLink} from './LessonWorkspace.jsx';
import {FavoriteButton} from './FavoriteButton.jsx';

// One CMS-backed reader for every course, including the legacy /learn/cursor URL.
export function CourseReader(props){
  const {slug,model,navigate,placementId}=props;
  const [catalog,setCatalog]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[legacy,setLegacy]=useState(false);
  useEffect(()=>{let active=true;setCatalog(null);setError('');setLegacy(false);api(`/learning/courses/${encodeURIComponent(slug)}`).then(d=>{if(active)setCatalog(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[slug,model.user?.id,retry]);
  if(error)return <div className="ls-empty" role="alert"><p>{error}</p><button className="ls-btn" onClick={()=>setRetry(v=>v+1)}>重新加载课程</button></div>;
  if(!catalog)return <div className="ls-empty" role="status">正在加载课程…</div>;
  if(!catalog.lessons.length||legacy)return <><button className="ls-btn" hidden={!catalog.lessons.length} onClick={()=>setLegacy(false)}>返回视频 / 课件学习空间</button><LegacyCourseReader {...props}/></>;
  const current=placementId?catalog.lessons.find(l=>l.id===placementId):catalog.lessons.find(l=>!l.locked&&!l.progress.completed_at)||catalog.lessons[0];
  if(!current)return <div className="ls-empty"><p>当前课时不属于本课程或尚未发布。</p><button className="ls-btn" onClick={()=>navigate(`/learn/${encodeURIComponent(slug)}`)}>返回课程</button></div>;
  return <>{catalog.legacyCount>0&&<div className="ls-actions"><button className="ls-btn" onClick={()=>setLegacy(true)}>查看原章节资料</button></div>}<LessonWorkspace id={current.id} lessons={catalog.lessons} model={model} navigate={navigate} onProgress={(id,progress)=>setCatalog(v=>({...v,lessons:v.lessons.map(l=>l.id===id?{...l,progress}:l)}))}/></>;
}

function LegacyCourseReader({slug,model,navigate,notify}) {
  const [data,setData]=useState(null),[item,setItem]=useState(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [retry,setRetry]=useState(0),[directory,setDirectory]=useState(false);
  const request=useRef(0),mounted=useRef(false),modelRef=useRef(model);
  modelRef.current=model;
  const updateProgress=(id,status)=>setData(value=>value?{...value,chapters:value.chapters.map(chapter=>({...chapter,items:chapter.items.map(entry=>entry.id===id?{...entry,progress:status}:entry)}))}:value);
  const openItem=async(metadata,courseSlug=slug)=>{
    const revision=++request.current;
    setError('');setItem(null);setDirectory(false);
    if(metadata.locked){setError('这项内容需要课程权限。你可以先阅读免费预览，或查看当前账号的课程权益。');return;}
    setBusy(true);
    try {
      const result=await api(`/projects/${encodeURIComponent(courseSlug)}/content/${metadata.id}`);
      if(!mounted.current||revision!==request.current)return;
      setItem({...result.item,progress:metadata.progress});
      if(modelRef.current.user&&metadata.progress!=='completed'){
        await api(`/me/progress/${metadata.id}`,{method:'PUT',body:JSON.stringify({status:'started'})});
        if(!mounted.current||revision!==request.current)return;
        updateProgress(metadata.id,'started');
        await modelRef.current.refresh({preserve:true});
      }
    }catch(e){if(mounted.current&&revision===request.current)setError(e.message);}
    finally{if(mounted.current&&revision===request.current)setBusy(false);}
  };
  useEffect(()=>{
    mounted.current=true;
    const revision=++request.current;
    setData(null);setItem(null);setError('');setLoading(true);setBusy(false);
    api(`/projects/${encodeURIComponent(slug)}`).then(result=>{
      if(!mounted.current||revision!==request.current)return;
      setData(result);setLoading(false);
      const next=nextReadingItem(result.chapters);
      if(next)openItem(next,slug);
    }).catch(e=>{if(mounted.current&&revision===request.current){setError(e.message);setLoading(false);}});
    return()=>{mounted.current=false;request.current++;};
  },[slug,model.user?.id,retry]);
  const complete=async()=>{
    if(!model.user)return navigate('/login');
    if(!item||busy)return;
    const revision=request.current,id=item.id;
    setBusy(true);setError('');
    try{
      await api(`/me/progress/${id}`,{method:'PUT',body:JSON.stringify({status:'completed'})});
      if(!mounted.current||revision!==request.current)return;
      setItem(value=>({...value,progress:'completed'}));updateProgress(id,'completed');
      notify('学习进度已保存');await model.refresh({preserve:true});
    }catch(e){if(mounted.current&&revision===request.current)setError(e.message);}
    finally{if(mounted.current&&revision===request.current)setBusy(false);}
  };
  const progress=readingProgress(data?.chapters);
  const resource=safeResourceUrl(item?.resource_url);
  const next=data?.chapters.flatMap(c=>c.items).find(entry=>!entry.locked&&entry.id!==item?.id&&entry.progress!=='completed');
  return <section className="cr-page" aria-busy={loading}>
    <nav className="cr-breadcrumb" aria-label="学习位置"><button onClick={()=>navigate('/courses')}><ArrowLeft size={16}/>我的课程</button><span>/</span><span>课程学习</span></nav>
    <header className="cr-heading"><div><span className="cr-kicker">学习空间 · {data?.path_title||'实战课程'}</span><h1>{data?.title||'课程学习'}</h1><p>{data?.subtitle||'阅读、实践，把每一步积累为自己的能力。'}</p></div>{data&&<FavoriteButton model={model} navigate={navigate} reference={{kind:'course',id:data.id}} title={data.title}/>}<button className="pj-outline" onClick={()=>navigate(`/packs/${encodeURIComponent(slug)}`)}>课程详情<ArrowRight size={16}/></button></header>
    {loading?<div className="cr-empty" role="status">正在读取课程与学习记录…</div>:!data?<div className="cr-empty" role="alert"><h2>暂时无法打开课程</h2><p>{error}</p><button className="pj-primary" onClick={()=>setRetry(value=>value+1)}>重新加载</button></div>:<>
      <div className="cr-progress"><BookOpenText size={22}/><div><strong>已完成 {progress.completed} / {progress.total} 项内容</strong><small>{model.user?'进度保存在当前账号':'登录后可以保存学习记录'}</small></div><progress max="100" value={progress.percent} aria-label="课程学习进度"/><b>{progress.percent}%</b></div>
      {!data.entitled&&<div className="cr-access"><LockKey size={18}/><p>当前为免费预览，完整内容需要对应课程权益。</p><button className="pj-outline" onClick={()=>navigate(model.user?'/membership':'/login')}>{model.user?'查看课程权益':'登录账号'}</button></div>}
      <div className="cr-layout"><aside className="cr-directory"><header><h2>课程目录</h2><button aria-expanded={directory} aria-controls="course-directory" className="cr-directory-toggle" onClick={()=>setDirectory(value=>!value)}>{directory?'收起目录':'展开目录'}</button></header><nav id="course-directory" className={directory?'is-expanded':''} aria-label="课程章节目录">{data.chapters.map((chapter,index)=><section key={chapter.id}><h3>{index+1}. {chapter.title}</h3>{chapter.items.map(entry=><button key={entry.id} aria-current={item?.id===entry.id?'step':undefined} disabled={busy} onClick={()=>openItem(entry)}>{entry.locked?<LockKey size={17}/>:entry.progress==='completed'?<CheckCircle size={17} weight="fill"/>:<FileText size={17}/>}<span>{entry.title}<small>{CONTENT_TYPES[entry.type]||'资料'}{entry.is_preview?' · 免费预览':''}</small></span></button>)}{!chapter.items.length&&<p>本章内容待发布</p>}</section>)}{!data.chapters.length&&<p>课程章节待发布</p>}</nav></aside>
      <article className="cr-reading" aria-live="polite">{error&&<div className="cr-error" role="alert"><p>{error}</p><button onClick={()=>setRetry(value=>value+1)}>重新加载课程</button></div>}{busy&&!item?<p role="status">正在打开资料…</p>:item?<><span className="cr-kicker">{CONTENT_TYPES[item.type]||'实战资料'}</span><div className="favorite-actions-row"><h2>{item.title}</h2><FavoriteButton model={model} navigate={navigate} reference={{kind:'resource',id:item.id}} title={item.title}/></div><div className="cr-body">{item.body?(item.type==='code'?<pre><code>{item.body}</code></pre>:<Markdown body={item.body}/>):<p>请使用下方配套资源进行学习。</p>}</div>{resource&&<section className="cr-resource">{item.type==='video'&&/\.(mp4|webm|mov)(?:[?#]|$)/i.test(resource)&&<video controls preload="metadata" src={resource}/> }<a className="pj-outline" href={resource} target="_blank" rel="noopener noreferrer">打开配套资源<ArrowRight size={16}/></a></section>}<footer><button className="pj-primary" disabled={busy||item.progress==='completed'} onClick={complete}>{item.progress==='completed'?'已完成学习':model.user?'标记为已完成':'登录后保存进度'}</button>{next&&<button className="pj-outline" disabled={busy} onClick={()=>openItem(next)}>下一项内容<ArrowRight size={16}/></button>}<small>学习完成后再标记，记录你的真实进度。</small></footer></>:!error&&<div className="cr-empty"><BookOpenText size={36}/><h2>{progress.total?'选择一项资料开始':'课程内容正在准备中'}</h2><p>{progress.total?'在目录中选择已解锁内容或免费预览。':'内容发布后，你可以在这里阅读和实践。'}</p></div>}</article></div>
    </>}
  </section>;
}
