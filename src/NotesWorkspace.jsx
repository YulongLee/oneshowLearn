import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowsInSimple,ArrowsOutSimple,BookOpen,Check,Clock,Code,FileText,Hash,ListBullets,LockSimple,MagnifyingGlass,NotePencil,Plus,Quotes,Star,TextB,TextH,Trash,UploadSimple} from '@phosphor-icons/react';
import {DownloadText,Gate,Markdown,Modal,TagCloud} from './PersonalShared.jsx';
import {liveNotes,shortDate,tagCounts,tagsFromText} from './personal-model.js';
import {filterPersonalNotes,noteExcerpt} from './notes-studio-model.js';
import {LearningNotesLibrary} from './LearningNotesLibrary.jsx';
import './notes-studio.css';

export function NotesWorkspace(props){
  const [source,setSource]=useState('personal');
  const switchTo=value=>{const change=()=>setSource(value);if(window.dispatchEvent(new Event('oneshowlearn:before-navigate',{cancelable:true}))&&(!props.guard.current||props.guard.current(change)))change();};
  return <div className="notes-studio">
    <header className="ns-heading"><div><div className="ns-eyebrow"><NotePencil size={18}/>我的知识空间</div><h1>学习笔记</h1><p>收集思考，沉淀实践。让每一次学习都有迹可循。</p></div><span className="ns-private"><LockSimple size={15}/>仅自己可见</span></header>
    <nav className="ns-sources" aria-label="笔记来源"><button aria-pressed={source==='personal'} onClick={()=>switchTo('personal')}><NotePencil size={19}/>个人笔记</button><button aria-pressed={source==='learning'} onClick={()=>switchTo('learning')}><BookOpen size={19}/>课程 / 项目笔记</button></nav>
    {source==='personal'?<PersonalNotesWorkspace {...props}/>:<LearningNotesLibrary {...props}/>}
  </div>;
}
function PersonalNotesWorkspace({model,navigate,notify,query,setQuery,guard}){
  const [selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[tab,setTab]=useState('all'),[tag,setTag]=useState(''),[sort,setSort]=useState('modified'),[error,setError]=useState('');
  const [pending,setPending]=useState(null),[focus,setFocus]=useState(false),[preview,setPreview]=useState(false),[mobileReader,setMobileReader]=useState(false);
  const bodyRef=useRef(null),importRef=useRef(null),saving=useRef(false);
  const notes=liveNotes(model.state),all=model.state.notes||[],trash=all.filter(n=>n.deletedAt),tags=tagCounts(notes);
  const current=all.find(n=>n.id===selected)||null,editing=Boolean(draft);
  const dirty=Boolean(draft&&(draft.title!==(current?.title||'')||draft.body!==(current?.body||'')||draft.tagsText!==(current?.tags||[]).join(', ')));
  const confirmLeave=proceed=>{if(saving.current)return false;if(!dirty)return true;setPending(()=>proceed);return false;};
  useEffect(()=>{guard.current=confirmLeave;const prevent=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>{guard.current=null;window.removeEventListener('beforeunload',prevent);};},[dirty]);
  useEffect(()=>{if(!selected&&!draft&&notes.length)setSelected(notes[0].id);},[model.state.notes]);
  const open=(note,write=false)=>{const apply=()=>{setSelected(note?.id||null);setDraft(write?{title:note?.title||'',body:note?.body||'',tagsText:(note?.tags||[]).join(', ')}:null);setPreview(false);setError('');setMobileReader(true);};if(confirmLeave(apply))apply();};
  const newNote=()=>{if(!model.user)return navigate('/login');open(null,true);};
  const save=async()=>{
    if(saving.current||model.busy)return;
    if(!draft?.title.trim()){setError('请填写笔记标题。');return;}
    if(tagsFromText(draft.tagsText).some(t=>t.length>24)){setError('每个标签请控制在 24 个字以内。');return;}
    const now=new Date().toISOString(),id=selected||crypto.randomUUID();
    const note={...current,id,title:draft.title.trim(),body:draft.body,tags:tagsFromText(draft.tagsText),...(current?{}:{createdAt:now}),updatedAt:now};
    saving.current=true;
    try{if(await model.saveState({...model.state,notes:[note,...all.filter(n=>n.id!==id)]})){setSelected(id);setDraft(null);setPreview(false);setError('');setTab('all');setTag('');notify('笔记已保存到你的账号');}else setError('保存未成功，修改已保留，请重试。');}finally{saving.current=false;}
  };
  const patch=async(change)=>{if(!current||model.busy)return;if(await model.saveState({...model.state,notes:all.map(n=>n.id===current.id?{...n,...change,updatedAt:new Date().toISOString()}:n)}))notify(change.deletedAt?'笔记已移入回收站，可以恢复':change.deletedAt===null?'笔记已恢复':'笔记已更新');};
  const insert=(prefix,suffix='')=>{const area=bodyRef.current,start=area?.selectionStart||0,end=area?.selectionEnd||start;setDraft(d=>({...d,body:(d.body.slice(0,start)+prefix+d.body.slice(start,end)+suffix+d.body.slice(end)).slice(0,20000)}));area?.focus();};
  const importText=async(e)=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!/\.(txt|md)$/i.test(file.name)){notify('请选择 Markdown 或 TXT 文本文件');return;}if(file.size>80000){notify('请导入小于 80 KB 的文本文件');return;}try{const body=await file.text();if(body.length>20000){notify('单篇笔记最多 20,000 字');return;}const apply=()=>{setSelected(null);setDraft({title:file.name.replace(/\.(txt|md)$/i,'').slice(0,120),body,tagsText:''});setPreview(false);setError('');setMobileReader(true);};if(confirmLeave(apply))apply();}catch{notify('未能读取文件，请重新选择。');}};
  const visible=filterPersonalNotes(all,{tab,tag,query,sort});
  return <Gate model={model} navigate={navigate}>
    <div className="ns-collection-bar"><div><strong>我的笔记</strong><span>{notes.length} 篇记录<span className="ns-count-divider">·</span>{tags.length} 个标签</span></div><div className="ns-actions"><button className="ns-button" onClick={()=>importRef.current?.click()}><UploadSimple size={17}/>导入文本</button><button className="ns-button ns-primary" onClick={newNote}><Plus size={18}/>新建笔记</button><input ref={importRef} type="file" hidden accept=".md,.txt,text/plain,text/markdown" onChange={importText}/></div></div>
    <div className={`ns-workspace ${focus?'is-focused':''} ${mobileReader?'is-reading':''}`}>
      <section className="ns-index" aria-label="个人笔记列表">
        <label className="ns-search"><MagnifyingGlass size={18}/><input aria-label="搜索笔记" placeholder="搜索标题、正文或标签" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="ns-filters" aria-label="笔记分类">{[['all','全部',FileText,notes.length],['starred','已收藏',Star,notes.filter(n=>n.starred).length],['trash','回收站',Trash,trash.length]].map(([id,label,Icon,count])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setTag('');}}><Icon size={15}/>{label}<small>{count}</small></button>)}</div>
        <details className="ns-tags"><summary><Hash size={16}/>标签筛选{tag&&<span>{tag}</span>}</summary><TagCloud tags={tags} selected={tag} onClick={t=>setTag(tag===t?'':t)}/></details>
        <div className="ns-list-label"><span>{query||tag?'筛选结果':'笔记列表'} · {visible.length}</span><select aria-label="笔记排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="modified">最近修改</option><option value="title">按标题</option></select></div>
        {tag&&<button className="ns-clear" onClick={()=>setTag('')}>清除「{tag}」筛选 ×</button>}
        <div className="ns-note-list">{visible.map(note=><button className="ns-note" aria-pressed={selected===note.id} key={note.id} onClick={()=>open(note)}><span className="ns-note-title"><FileText size={17}/><strong>{note.title}</strong>{note.starred&&<Star className="ns-star" size={15} weight="fill"/>}</span><p>{noteExcerpt(note.body)||'还没有正文，写下第一个想法。'}</p><span className="ns-note-meta"><time>{shortDate(note.updatedAt)}</time>{note.tags?.[0]&&<i>{note.tags[0]}</i>}</span></button>)}{!visible.length&&<div className="ns-list-empty"><FileText size={28}/><strong>{tab==='trash'?'回收站是空的':tab==='starred'?'还没有收藏笔记':'没有找到笔记'}</strong><p>{query||tag?'试试其他关键词或清除筛选。':tab==='trash'?'移除的笔记会保留在这里，随时可以恢复。':tab==='starred'?'点击笔记上的星标，把重要内容留在手边。':'新建一篇笔记，记录你的学习收获。'}</p>{(query||tag)&&<button className="ns-button" onClick={()=>{setQuery('');setTag('');}}>清除筛选</button>}</div>}</div>
        <footer className="ns-index-footer"><LockSimple size={14}/>私人记录，保存后可跨设备查看</footer>
      </section>
      <section className="ns-editor" aria-label="笔记内容" onKeyDown={e=>{if(editing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}}}>
        <header className="ns-editor-toolbar"><div className="ns-actions"><button className="ns-mobile-back ns-icon" aria-label="返回笔记列表" onClick={()=>setMobileReader(false)}><ArrowLeft size={19}/></button><span className={`ns-save-status ${dirty?'is-dirty':''}`}>{dirty?<><span/>尚未保存</>:<><Check size={15}/>{current?'已保存到账号':'私人笔记'}</>}</span></div><div className="ns-actions">
          {!editing&&current&&!current.deletedAt&&<button className="ns-icon" aria-label={current.starred?'取消收藏笔记':'收藏笔记'} disabled={model.busy} onClick={()=>patch({starred:!current.starred})}><Star size={19} weight={current.starred?'fill':'regular'}/></button>}
          {editing?<><button className="ns-button" aria-pressed={preview} onClick={()=>setPreview(v=>!v)}>{preview?'继续编辑':'预览排版'}</button><button className="nt-save" disabled={model.busy} onClick={save}><Check size={17}/>{model.busy?'保存中':'保存笔记'}</button></>:current&&!current.deletedAt&&<button className="ns-button" onClick={()=>open(current,true)}><NotePencil size={17}/>编辑笔记</button>}
          <button className="ns-icon ns-focus" aria-label={focus?'退出专注阅读':'专注阅读'} aria-pressed={focus} onClick={()=>setFocus(v=>!v)}>{focus?<ArrowsInSimple size={19}/>:<ArrowsOutSimple size={19}/>}</button>
        </div></header>
        {editing&&draft?<div className="ns-writing">
          <input className="ns-title-input" aria-label="笔记标题" placeholder="无标题笔记" maxLength={120} disabled={model.busy} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
          <label className="ns-tag-input"><Hash size={16}/><input aria-label="笔记标签" placeholder="添加标签，用逗号分隔" disabled={model.busy} value={draft.tagsText} onChange={e=>setDraft({...draft,tagsText:e.target.value})} maxLength={200}/></label>
          <div className="ns-formatting">{[[TextH,'标题','## '],[TextB,'加粗','**','**'],[ListBullets,'任务清单','- [ ] '],[Code,'代码块','\n```\n','\n```'],[Quotes,'引用','> ']].map(([Icon,label,prefix,suffix])=><button className="ns-icon" disabled={preview||model.busy} title={label} aria-label={label} key={label} onClick={()=>insert(prefix,suffix)}><Icon size={19}/></button>)}<span>Markdown</span></div>
          {preview?<div className="ns-preview"><Markdown body={draft.body||'这里将显示你的笔记正文。'}/></div>:<textarea ref={bodyRef} aria-label="笔记正文" maxLength={20000} disabled={model.busy} placeholder={'今天学到了什么？\n\n记录关键结论、实践过程，或一个值得继续探索的问题。'} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/>}
          {error&&<p className="ns-error" role="alert">{error}</p>}
          <footer className="ns-writing-footer"><span>{draft.body.length.toLocaleString()} / 20,000 字 · 手动保存</span><button className="ns-button" disabled={model.busy} onClick={()=>open(current)}>取消编辑</button></footer>
        </div>:current?<article className="ns-document"><div className="ns-document-label"><NotePencil size={16}/>个人笔记</div><h2>{current.title}</h2><div className="ns-document-meta"><span><Clock size={14}/>更新于 {shortDate(current.updatedAt)}</span><span>{current.body?.length||0} 字</span></div><div className="ns-inline-tags">{(current.tags||[]).map(t=><button key={t} onClick={()=>{setTab('all');setTag(t);setFocus(false);setMobileReader(false);}}># {t}</button>)}</div>
          {current.deletedAt&&<div className="ns-notice">这篇笔记已移入回收站。<button className="ns-button" disabled={model.busy} onClick={()=>patch({deletedAt:null})}>恢复笔记</button></div>}
          <Markdown body={current.body||'这篇笔记还没有正文，点击编辑继续记录。'} onCheck={!current.deletedAt&&!model.busy?line=>{const lines=current.body.split('\n');lines[line]=lines[line].replace(/\[([ xX])\]/,(_,v)=>v===' '?'[x]':'[ ]');patch({body:lines.join('\n')});}:undefined}/>
          <footer className="ns-document-footer"><DownloadText title={current.title} body={current.body}/>{!current.deletedAt&&<button className="ns-button ns-quiet" disabled={model.busy} onClick={()=>patch({deletedAt:new Date().toISOString()})}><Trash size={16}/>移入回收站</button>}</footer>
        </article>:<div className="ns-blank"><div className="ns-blank-icon"><NotePencil size={36} weight="duotone"/></div><h2>留一点空间，给新的想法</h2><p>一条关键结论、一段好用的 Prompt，<br/>或一次实践的复盘，都可以从这里开始。</p><button className="ns-button ns-primary" onClick={newNote}><Plus size={18}/>写第一篇笔记</button><small>也可以选择左侧笔记，继续上一次的思考。</small></div>}
      </section>
    </div>
    {pending&&<Modal title="保留未保存的修改？" close={()=>setPending(null)}><div className="ps-modal-body"><p>这篇笔记还有未保存的内容，继续编辑可保留当前修改。</p><div className="ps-form-actions"><button className="ps-outline" onClick={()=>setPending(null)}>继续编辑</button><button className="ps-primary" onClick={()=>{const proceed=pending;setPending(null);proceed();}}>放弃修改</button></div></div></Modal>}
  </Gate>;
}
