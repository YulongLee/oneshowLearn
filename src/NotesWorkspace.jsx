import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ArrowClockwise,ArrowsInSimple,ArrowsOutSimple,BookOpen,Check,Clock,Code,Cube,FileText,Hash,ListBullets,LockSimple,MagnifyingGlass,NotePencil,Plus,Quotes,Sparkle,Star,TextB,TextH,Trash,UploadSimple} from '@phosphor-icons/react';
import {api} from './api.js';
import {DownloadText,Gate,Markdown,Modal,TagCloud} from './PersonalShared.jsx';
import {shortDate,tagCounts,tagsFromText} from './personal-model.js';
import {RichLessonNote,RichNoteRead} from './RichLessonNote.jsx';
import {NOTE_TEMPLATES,unifiedNotes,filterNoteLibrary,noteText,noteSource,draftStorageKey,validStoredDraft} from './notes-library-model.js';
import './notes-studio.css';
import './notes-library.css';
import {FavoriteButton} from './FavoriteButton.jsx';
import {hasFavorite} from './favorite-reference.js';

const kinds=[['all','全部笔记'],['course','课程笔记'],['project','项目笔记'],['personal','个人笔记']];
const labels={personal:'个人笔记',course:'课程笔记',project:'项目笔记',learning:'课时笔记'};
const icons={personal:FileText,course:BookOpen,project:Cube,learning:BookOpen};
const videoTime=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
export function NotesWorkspace({model,navigate,notify,query='',setQuery,guard}){
 const [learning,setLearning]=useState([]),[entry,setEntry]=useState({}),[loading,setLoading]=useState(false),[libraryError,setLibraryError]=useState(''),[total,setTotal]=useState(null);
 const [selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[kind,setKind]=useState('all'),[tab,setTab]=useState('all'),[scope,setScope]=useState(''),[tag,setTag]=useState(''),[sort,setSort]=useState('modified'),[limit,setLimit]=useState(50);
 const [error,setError]=useState(''),[pending,setPending]=useState(null),[focus,setFocus]=useState(false),[preview,setPreview]=useState(false),[mobileReader,setMobileReader]=useState(false),[busy,setBusy]=useState(false),[recoverable,setRecoverable]=useState(null),[draftStatus,setDraftStatus]=useState('');
 const revision=useRef(0),saving=useRef(false),bodyRef=useRef(null),importRef=useRef(null),draftRef=useRef(null),modelRef=useRef(model),loadRef=useRef(null);
 modelRef.current=model;draftRef.current=draft;
 const all=useMemo(()=>unifiedNotes(model.state.notes||[],learning,entry).map(n=>n.kind==='personal'?n:{...n,starred:hasFavorite(model.state,{kind:'learning-note',id:n.id})}),[model.state.notes,model.state.contentFavorites,learning,entry]),live=all.filter(n=>!n.deletedAt),current=all.find(n=>n.key===selected)||null;
 const visible=filterNoteLibrary(all,{kind,tab,query,tag,scope,sort}),tags=tagCounts(live.filter(n=>n.kind==='personal'));
 const scopes=[...new Map(live.filter(n=>n.kind!=='personal').map(n=>[n.scope,n.sourceTitle])).entries()];
 const editing=Boolean(draft),blocked=busy||model.busy||model.loading;
 const [linkedId]=useState(()=>new URLSearchParams(window.location.search).get('note'));
 const [linkedLearningId]=useState(()=>new URLSearchParams(window.location.search).get('learningNote'));
 const [linkError,setLinkError]=useState('');const linkedOpened=useRef(false);
 // Bookmark links select only this account's live personal record, read-only.
 // Do not restore/overwrite a recoverable draft or synthesize a missing note.
 useEffect(()=>{
  if(!linkedId||linkedOpened.current||model.loading||!model.user)return;
  linkedOpened.current=true;const note=live.find(n=>n.kind==='personal'&&n.id===linkedId);
  if(note){setSelected(note.key);setMobileReader(true);setKind('personal');}
  else setLinkError('这篇个人笔记暂不可用，可能已移入回收站或不属于当前账号。');
 },[model.loading,model.user?.id,model.state.notes]);
 useEffect(()=>{
  if(!linkedLearningId||linkedOpened.current||model.loading||!model.user||loading||total===null||libraryError)return;
  linkedOpened.current=true;const note=live.find(n=>n.kind!=='personal'&&n.id===linkedLearningId);
  if(note){setSelected(note.key);setMobileReader(true);}
  else setLinkError('这篇课时笔记暂不可用，可能已移入回收站或不属于当前账号。');
 },[model.loading,model.user?.id,loading,total,libraryError,learning]);
 useEffect(()=>setLimit(50),[kind,tab,scope,tag,sort,query]);
 const load=async()=>{
  if(!model.user)return;const rev=++revision.current;setLoading(true);setLibraryError('');let records=[];
  try{
   let offset=0;const visited=new Set();
   while(offset!==null){
    if(!Number.isInteger(offset)||offset<0||offset>1000||visited.has(offset))throw Error('笔记分页未能完整读取，请重试。');
    visited.add(offset);const d=await api(`/learning/notes?offset=${offset}`);if(rev!==revision.current)return;
    records=[...records,...d.items.filter(n=>!records.some(i=>i.id===n.id))];setLearning(records);setTotal(d.total);offset=d.nextOffset;
   }
   let metadata={};try{metadata=await api('/learning/entry');}catch{}
   // Course entry contains no project stages. Read only the published project
   // metadata needed by these notes; never start/enroll a project to label it.
   const projects=[...new Set(records.map(n=>noteSource(n.source_url)).filter(n=>n?.kind==='project').map(n=>n.slug))];
   for(let index=0;index<projects.length;index+=4){
    if(rev!==revision.current)return;
    const result=await Promise.all(projects.slice(index,index+4).map(async slug=>{try{return await api('/learning/projects/'+encodeURIComponent(slug));}catch{return null;}}));
    metadata.lessons=[...(metadata.lessons||[]),...result.filter(Boolean).flatMap(p=>(p.stages||[]).flatMap(s=>s.lessons||[]))];
   }
   if(rev===revision.current)setEntry(metadata);
  }catch(e){if(rev===revision.current)setLibraryError(e.message||'课时笔记暂时无法读取，请重试。');}
  finally{if(rev===revision.current)setLoading(false);}
 };
 loadRef.current=load;
 useEffect(()=>{
  load();try{const saved=validStoredDraft(JSON.parse(sessionStorage.getItem(draftStorageKey(model.user?.id))||'null'),model.user?.id);if(saved)setRecoverable(saved);}catch{}
  return()=>{revision.current++;};
 },[model.user?.id]);
 const confirmLeave=proceed=>{if(saving.current||modelRef.current.busy)return false;if(!draftRef.current)return true;setPending(()=>proceed);return false;};
 useEffect(()=>{guard.current=confirmLeave;const prevent=e=>{if(draftRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>{guard.current=null;window.removeEventListener('beforeunload',prevent);};},[]);
 useEffect(()=>{
  if(!draft||!model.user)return;
  try{sessionStorage.setItem(draftStorageKey(model.user.id),JSON.stringify({userId:model.user.id,draft,selected,updatedAt:new Date().toISOString()}));setDraftStatus('当前标签页草稿已保留 · 尚未保存到账号');}
  catch{setDraftStatus('草稿暂无法保留 · 请手动保存到账号');}
 },[draft,selected,model.user?.id]);
 const clearDraft=()=>{try{sessionStorage.removeItem(draftStorageKey(model.user.id));}catch{}setRecoverable(null);setDraft(null);setDraftStatus('');};
 const applyOpen=(note,write=false)=>{
  setSelected(note?.key||null);setError('');setPreview(false);setMobileReader(true);
  if(write)setDraft(note.kind==='personal'?{kind:'personal',id:note.id,title:note.title,body:note.body||'',tagsText:(note.tags||[]).join(', '),base:note.raw}:{...note.raw,kind:'learning'});else if(draftRef.current)clearDraft();
 };
 const confirmDraft=proceed=>{if(recoverable&&!draftRef.current){setPending(()=>proceed);return false;}return confirmLeave(proceed);};
 const open=(note,write=false)=>{const apply=()=>applyOpen(note,write);if((write?confirmDraft:confirmLeave)(apply))apply();};
 const newNote=template=>{
  if(!model.user)return navigate('/login');
  const apply=()=>{setSelected(null);setDraft({kind:'personal',id:crypto.randomUUID(),title:'',body:template?.body||'',tagsText:template?.tagsText||''});setError('');setPreview(false);setMobileReader(true);setTab('all');setTag('');setScope('');setKind('personal');};if(confirmDraft(apply))apply();
 };
 const restoreDraft=()=>{if(!recoverable)return;const apply=()=>{setDraft(recoverable.draft);setSelected(recoverable.selected);setPreview(false);setError('已恢复当前标签页草稿，请核对账号中的最新内容后保存。');setMobileReader(true);setRecoverable(null);};if(confirmLeave(apply))apply();};
 useEffect(()=>{if(!linkedId&&!linkedLearningId&&!selected&&!draft&&visible.length)setSelected(visible[0].key);},[model.state.notes,learning]);
 const updateLearning=async(note,deleted)=>{
  const result=await api(`/learning/notes/${note.id}`,{method:'PUT',headers:{'If-Match':String(note.version)},body:JSON.stringify({placement_id:note.placement_id,title:note.title.trim(),body:note.body,video_time:note.video_time,slide_id:note.slide_id,deleted})});
  setLearning(items=>items.map(n=>n.id===note.id?{...n,...result.item}:n));return result;
 };
 const save=async()=>{
  if(!draft||saving.current||blocked)return;if(!draft.title.trim()){setError('请填写笔记标题。');return;}
  if(draft.kind==='personal'&&tagsFromText(draft.tagsText).some(t=>t.length>24)){setError('每个标签请控制在 24 个字以内。');return;}
  saving.current=true;setBusy(true);setError('');const rev=revision.current;
  try{
   if(draft.kind==='learning'){await updateLearning(draft,false);if(rev!==revision.current)return;setSelected('learning:'+draft.id);}
   else{
    const now=new Date().toISOString(),old=(model.state.notes||[]).find(n=>n.id===draft.id);
    if(draft.base&&JSON.stringify(old)!==JSON.stringify(draft.base)){setError('这篇个人笔记已更新。当前草稿已保留，请导出草稿或取消编辑后核对最新内容。');return;}
    const note={...(old||draft.base||{}),id:draft.id,title:draft.title.trim(),body:draft.body,tags:tagsFromText(draft.tagsText),createdAt:old?.createdAt||draft.base?.createdAt||now,updatedAt:now};
    if(!await model.saveState({...model.state,notes:[note,...(model.state.notes||[]).filter(n=>n.id!==note.id)]})){setError('保存未成功，当前修改已保留。请核对最新记录后重试。');return;}if(rev!==revision.current)return;setSelected('personal:'+note.id);
   }
   clearDraft();setPreview(false);notify('笔记已保存到你的账号');
  }catch(e){if(rev===revision.current){setError(e.status===409?'这篇课时笔记已在其他窗口更新。当前草稿已保留，请导出草稿或取消编辑后查看最新内容，勿直接覆盖。':e.message);if(e.status===409)loadRef.current();}}
  finally{saving.current=false;setBusy(false);}
 };
 const patch=async change=>{
  if(!current||blocked||saving.current)return;saving.current=true;setBusy(true);setError('');
  try{
   if(current.kind==='personal'){if(!await model.saveState({...model.state,notes:(model.state.notes||[]).map(n=>n.id===current.id?{...n,...change,updatedAt:new Date().toISOString()}:n)}))return;}
   else await updateLearning(current.raw,Boolean(change.deletedAt));
   notify(change.deletedAt?'笔记已移入回收站，可以恢复':change.deletedAt===null?'笔记已恢复':'笔记已更新');
  }catch(e){setError(e.status===409?'笔记已在其他窗口更新，请刷新笔记后重试。':e.message);if(e.status===409)loadRef.current();}
  finally{saving.current=false;setBusy(false);}
 };
 const insert=(prefix,suffix='')=>{const area=bodyRef.current,start=area?.selectionStart||0,end=area?.selectionEnd||start;setDraft(d=>({...d,body:(d.body.slice(0,start)+prefix+d.body.slice(start,end)+suffix+d.body.slice(end)).slice(0,20000)}));area?.focus();};
 const importText=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!/\.(txt|md)$/i.test(file.name)){notify('请选择 Markdown 或 TXT 文本文件');return;}if(file.size>80000){notify('请导入小于 80 KB 的文本文件');return;}
  try{const body=await file.text();if(body.length>20000){notify('单篇个人笔记最多 20,000 字');return;}const apply=()=>{setSelected(null);setDraft({kind:'personal',id:crypto.randomUUID(),title:file.name.replace(/\.(txt|md)$/i,'').slice(0,120),body,tagsText:''});setPreview(false);setError('');setMobileReader(true);setKind('personal');};if(confirmDraft(apply))apply();}catch{notify('未能读取文件，请重新选择。');}
 };
 const reset=()=>{setQuery('');setTag('');setScope('');setKind('all');setTab('all');};const Icon=icons[current?.kind]||NotePencil;
 return <div className="notes-studio nl-page">
  <header className="ns-heading"><div><h1>学习笔记</h1><p>把课程知识，变成自己的实践方法。</p></div><div className="nl-heading-actions"><span className="ns-private"><LockSimple size={15}/>仅自己可见</span><div className="ns-actions"><button className="ns-button" disabled={blocked||!model.user} onClick={()=>importRef.current?.click()}><UploadSimple size={17}/>导入文本</button><button className="ns-button ns-primary" disabled={blocked} onClick={()=>newNote()}><Plus size={18}/>新建笔记</button><input ref={importRef} type="file" hidden accept=".md,.txt,text/plain,text/markdown" onChange={importText}/></div></div></header>
  <Gate model={model} navigate={navigate}>
   {linkError&&<div className="nl-library-error" role="alert">{linkError}</div>}
   <section className="nl-starters" aria-label="笔记模板"><h2>快速记录 · 从模板开始</h2><p>选择一个空白模板，记录自己的学习与思考。保存后成为个人笔记。</p><div>{NOTE_TEMPLATES.map((t,i)=>{const TemplateIcon=[BookOpen,Sparkle,Cube][i];return <button key={t.id} disabled={blocked} onClick={()=>newNote(t)}><TemplateIcon size={27} weight="duotone"/><span><strong>{t.title}</strong><small>{t.description}</small></span><ArrowRight size={16}/></button>;})}</div></section>
   {recoverable&&!draft&&<section className="nl-recovery" role="status"><div><strong>当前标签页有一份未保存的草稿</strong><p>仅当前账号可恢复，尚未保存到账号。</p></div><button className="ns-button" onClick={restoreDraft}>恢复草稿</button><button className="ns-button ns-quiet" onClick={clearDraft}>放弃草稿</button></section>}
   {draft&&!mobileReader&&<button className="ns-button nl-resume-draft" onClick={()=>setMobileReader(true)}>继续编辑当前草稿<ArrowRight size={15}/></button>}
   <nav className="ns-sources nl-kinds" aria-label="笔记来源">{kinds.map(([id,label])=><button key={id} aria-pressed={kind===id} onClick={()=>{setKind(id);setScope('');setTag('');setMobileReader(false);setFocus(false);}}>{label}</button>)}</nav>
   <div className={`ns-workspace ${focus?'is-focused':''} ${mobileReader?'is-reading':''}`}>
    <section className="ns-index" aria-label="全部笔记列表">
     <label className="ns-search"><MagnifyingGlass size={18}/><input aria-label="搜索笔记" placeholder="搜索标题、正文或标签" value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <div className="nl-tools"><select aria-label="笔记排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="modified">最近修改</option><option value="title">按标题</option></select><button aria-pressed={tab==='starred'} onClick={()=>{setTab(tab==='starred'?'all':'starred');setTag('');}} title="查看已收藏的个人、课程和项目笔记"><Star size={17}/>已收藏</button><button aria-pressed={tab==='trash'} onClick={()=>{setTab(tab==='trash'?'all':'trash');setTag('');}}><Trash size={17}/>回收站</button></div>
     {scopes.length>0&&<label className="nl-scope"><BookOpen size={16}/><select aria-label="筛选所属课程或项目" value={scope} onChange={e=>setScope(e.target.value)}><option value="">全部课程与项目</option>{scopes.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>}
     {tags.length>0&&<details className="ns-tags"><summary><Hash size={16}/>个人笔记标签{tag&&<span>{tag}</span>}</summary><TagCloud tags={tags} selected={tag} onClick={t=>setTag(tag===t?'':t)}/></details>}
     <div className="ns-list-label"><span>{tab==='trash'?'回收站':tab==='starred'?'已收藏笔记':'笔记列表'} · {visible.length} 篇</span><button className="ns-icon" aria-label="刷新课时笔记" disabled={loading||blocked} onClick={load}><ArrowClockwise size={17}/></button></div>
     {(query||tag||scope)&&<button className="ns-clear" onClick={reset}>清除筛选 ×</button>}
     {loading&&<p className="nl-load-status" role="status">正在读取课时笔记{total!==null?` ${learning.length} / ${total}`:'…'}</p>}
     {libraryError&&<div className="nl-library-error" role="alert"><p>课时笔记未完整读取：{libraryError}</p><button className="ns-button" onClick={load}>重试读取</button></div>}
     <div className="ns-note-list">{visible.slice(0,limit).map(note=>{const NoteIcon=icons[note.kind];return <button className="ns-note" aria-pressed={selected===note.key} key={note.key} onClick={()=>open(note)}><span className="ns-note-title"><NoteIcon size={21}/><strong>{note.title}</strong>{note.starred&&<Star className="ns-star" size={16} weight="fill"/>}</span><span className="nl-note-source">{labels[note.kind]}{note.lessonTitle?` · ${note.lessonTitle}`:''}</span><p>{note.text.slice(0,95)||'还没有正文，点击编辑继续记录。'}</p><span className="ns-note-meta"><time>{shortDate(note.updatedAt)}</time>{note.tags?.[0]&&<i>#{note.tags[0]}</i>}</span></button>;})}
      {visible.length>limit&&<button className="ns-button nl-more" onClick={()=>setLimit(n=>n+50)}>显示更多笔记（还有 {visible.length-limit} 篇）</button>}
      {!visible.length&&!loading&&!libraryError&&<div className="ns-list-empty"><FileText size={28}/><strong>{query||tag||scope?'没有匹配的笔记':tab==='trash'?'回收站是空的':tab==='starred'?'还没有收藏笔记':live.length?'当前分类暂无笔记':'还没有笔记'}</strong><p>{query||tag||scope?'试试其他关键词或清除筛选。':tab==='trash'?'移除的记录仍可在这里恢复。':tab==='starred'?'在笔记工具栏点击收藏，方便日后回顾。':'你的个人记录和课时笔记会汇集到这里。'}</p>{(query||tag||scope)&&<button className="ns-button" onClick={reset}>清除筛选</button>}</div>}
     </div><footer className="ns-index-footer"><LockSimple size={14}/>保存后可跨设备查看</footer>
    </section>
    <section className="ns-editor" aria-label="笔记内容" onKeyDown={e=>{if(editing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}}}>
     <header className="ns-editor-toolbar"><div className="ns-actions"><button className="ns-mobile-back ns-icon" aria-label="返回笔记列表" onClick={()=>setMobileReader(false)}><ArrowLeft size={19}/></button><span className={`ns-save-status ${draft?'is-dirty':''}`} role="status">{draft?<><span/>{busy?'保存中…':draftStatus||'尚未保存到账号'}</>:<><Check size={16}/>{current?'已保存到账号':'私人记录'}</>}</span></div><div className="ns-actions">
      {!draft&&current?.kind==='personal'&&!current.deletedAt&&<button className="ns-icon" aria-label={current.starred?'取消收藏笔记':'收藏笔记'} disabled={blocked} onClick={()=>patch({starred:!current.starred})}><Star size={19} weight={current.starred?'fill':'regular'}/></button>}
      {!draft&&current&&current.kind!=='personal'&&!current.deletedAt&&<FavoriteButton model={model} navigate={navigate} reference={{kind:'learning-note',id:current.id}} title={current.title} compact/>}
      {draft?<>{draft.kind==='personal'&&<button className="ns-button" aria-pressed={preview} disabled={blocked} onClick={()=>setPreview(v=>!v)}>{preview?'继续编辑':'预览排版'}</button>}<button className="nt-save" disabled={blocked} onClick={save}><Check size={17}/>保存笔记</button></>:current&&!current.deletedAt&&<button className="ns-button" disabled={blocked} onClick={()=>open(current,true)}><NotePencil size={17}/>编辑笔记</button>}
      <button className="ns-icon ns-focus" aria-label={focus?'退出专注阅读':'专注阅读'} aria-pressed={focus} onClick={()=>setFocus(v=>!v)}>{focus?<ArrowsInSimple size={19}/>:<ArrowsOutSimple size={19}/>}</button>
     </div></header>
     {current?.kind!=='personal'&&current&&<div className="nl-source-context"><Icon size={20}/><div><strong>{labels[current.kind]} · {current.sourceTitle}</strong><span>{[current.chapterTitle,current.lessonTitle].filter(Boolean).join(' / ')||'原课时来源暂不可用'}</span></div>{current.videoTime!=null&&<small><Clock size={13}/>视频 {videoTime(current.videoTime)}</small>}{current.sourceUrl&&<button onClick={()=>navigate(current.sourceUrl)}>返回对应课时<ArrowRight size={14}/></button>}</div>}
     {error&&<div className="ns-error" role="alert">{error}{draft&&<div><DownloadText title={draft.title||'未保存草稿'} body={draft.kind==='personal'?draft.body:noteText(draft.body)} label="导出当前草稿"/></div>}</div>}
     {draft?<div className="ns-writing"><input className="ns-title-input" aria-label="笔记标题" placeholder="给这篇笔记起个标题" maxLength={120} disabled={blocked} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
      {draft.kind==='personal'?<><label className="ns-tag-input"><Hash size={16}/><input aria-label="笔记标签" placeholder="添加标签，用逗号分隔" disabled={blocked} value={draft.tagsText||''} onChange={e=>setDraft({...draft,tagsText:e.target.value})} maxLength={200}/></label><div className="ns-formatting">{[[TextH,'标题','## '],[TextB,'加粗','**','**'],[ListBullets,'任务清单','- [ ] '],[Code,'代码块','\n```\n','\n```'],[Quotes,'引用','> ']].map(([FormatIcon,label,prefix,suffix])=><button className="ns-icon" disabled={preview||blocked} title={label} aria-label={label} key={label} onClick={()=>insert(prefix,suffix)}><FormatIcon size={19}/></button>)}<span>Markdown</span></div>{preview?<div className="ns-preview"><Markdown body={draft.body||'这里将显示你的笔记正文。'}/></div>:<textarea ref={bodyRef} aria-label="笔记正文" maxLength={20000} disabled={blocked} placeholder={'今天学到了什么？\n\n记录关键结论、实践过程，或一个值得继续探索的问题。'} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/>}</>:<div className="ns-learning-content" inert={blocked}><RichLessonNote value={draft.body} onChange={body=>setDraft(d=>({...d,body}))}/></div>}
      <footer className="ns-writing-footer"><span>手动保存到账号 · {noteText(draft.body).length.toLocaleString()} 字</span><button className="ns-button" disabled={blocked} onClick={()=>open(current)}>取消编辑</button></footer>
     </div>:current?<article className="ns-document"><div className="ns-document-label"><Icon size={17}/>{labels[current.kind]}</div><h2>{current.title}</h2><div className="ns-document-meta"><span><Clock size={14}/>更新于 {shortDate(current.updatedAt)}</span><span>{current.text.length.toLocaleString()} 字</span></div><div className="ns-inline-tags">{(current.tags||[]).map(t=><button key={t} onClick={()=>{setTab('all');setTag(t);setFocus(false);setMobileReader(false);}}># {t}</button>)}</div>
      {current.deletedAt&&<div className="ns-notice">这篇笔记已移入回收站。<button className="ns-button" disabled={blocked} onClick={()=>patch({deletedAt:null})}>恢复笔记</button></div>}
      {current.kind==='personal'?<Markdown body={current.body||'这篇笔记还没有正文，点击编辑继续记录。'} onCheck={!current.deletedAt&&!blocked?line=>{const lines=current.body.split('\n');lines[line]=lines[line].replace(/\[([ xX])\]/,(_,v)=>v===' '?'[x]':'[ ]');patch({body:lines.join('\n')});}:undefined}/>:<div className="ns-learning-content"><RichNoteRead body={current.body}/></div>}
      <footer className="ns-document-footer"><DownloadText title={current.title} body={current.kind==='personal'?current.body:current.text} label={current.kind==='personal'?'导出 Markdown':'导出文字'}/>{!current.deletedAt&&<button className="ns-button ns-quiet" disabled={blocked} onClick={()=>patch({deletedAt:new Date().toISOString()})}><Trash size={16}/>移入回收站</button>}</footer>
     </article>:loading||libraryError?<div className="ns-blank"><BookOpen size={32}/><h2>{loading?'正在读取你的课时笔记':'课时笔记暂未完整读取'}</h2><p>{loading?'读取完成后，可在左侧选择记录。':'已有个人记录仍可使用，请重试读取课时笔记。'}</p>{!loading&&<button className="ns-button" onClick={load}>重试读取</button>}</div>:<div className="ns-blank"><div className="ns-blank-icon"><NotePencil size={36} weight="duotone"/></div><h2>从第一条学习收获开始</h2><p>选择上方模板，或写一篇自由笔记。<br/>在课程中保存的笔记，也会汇集到这里。</p><button className="ns-button ns-primary" onClick={()=>newNote()}><Plus size={18}/>写第一篇笔记</button><button className="ns-button" onClick={()=>navigate('/opc')}>去课程中记录<ArrowRight size={15}/></button></div>}
    </section>
   </div>
   {pending&&<Modal title="保留未保存的修改？" close={()=>setPending(null)}><div className="ps-modal-body"><p>当前修改尚未保存到账号。继续编辑可保留输入；放弃修改会清除本次草稿。</p><div className="ps-form-actions"><button className="ps-outline" onClick={()=>setPending(null)}>继续编辑</button><button className="ps-primary" onClick={()=>{const proceed=pending;setPending(null);clearDraft();proceed();}}>放弃修改</button></div></div></Modal>}
  </Gate>
 </div>;
}
