import { useEffect, useState, useRef } from "react";
import {ArrowLeft,ArrowsInSimple,ArrowsOutSimple,BookOpen,Clock,FileText,MagnifyingGlass,ArrowClockwise} from "@phosphor-icons/react";
import { api } from "./api.js";
import { RichNoteRead, RichLessonNote } from "./RichLessonNote.jsx";
import {Modal} from './PersonalShared.jsx';
export function LearningNotesLibrary({ model, navigate, query, setQuery, guard }) {
  const [pending,setPending]=useState(null);
  const saving=useRef(false);
  const [mobileReader,setMobileReader]=useState(false),[focus,setFocus]=useState(false),[loading,setLoading]=useState(false);
  const [items, setItems] = useState([]),
    [current, setCurrent] = useState(null),
    [nextOffset, setNextOffset] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(""),
    [trash, setTrash] = useState(false),
    [busy, setBusy] = useState(false);
  const load = (offset = 0) => {
    setLoading(true);
    return api(`/learning/notes?offset=${typeof offset === "number" ? offset : 0}`)
      .then((d) => {
        setItems((items) =>
          typeof offset === "number" && offset > 0
            ? [
                ...items,
                ...d.items.filter((n) => !items.some((i) => i.id === n.id)),
              ]
            : d.items,
        );
        setNextOffset(d.nextOffset);
        setError('');
      })
      .catch((e) => setError(e.message)).finally(()=>setLoading(false));
  };
  useEffect(() => {
    if (model.user) load();
  }, [model.user?.id]);
  const dirty = Boolean(draft && draft.body !== current?.body);
  const confirmLeave=proceed=>{if(saving.current)return false;if(!dirty)return true;setPending(()=>proceed);return false;};
  useEffect(() => {
    guard.current=confirmLeave;
    const prevent=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener("beforeunload", prevent);
    return () => {
      guard.current=null;
      window.removeEventListener("beforeunload", prevent);
    };
  }, [dirty]);
  const save = async (note, deleted = Boolean(note.deleted_at)) => {
    if(saving.current)return;
    saving.current=true;
    setBusy(true);
    try {
      const result = await api(`/learning/notes/${note.id}`, {
        method: "PUT",
        headers: { "If-Match": String(note.version) },
        body: JSON.stringify({
          placement_id: note.placement_id,
          title: note.title,
          body: note.body,
          video_time: note.video_time,
          slide_id: note.slide_id,
          deleted,
        }),
      });
      await load();
      setCurrent({
        ...result.item,
        source_url: note.source_url,
        lesson_title: note.lesson_title,
      });
      setDraft(null);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      saving.current=false;
      setBusy(false);
    }
  };
  const open = (note) => {
    const apply=()=>{setCurrent(note);setDraft(null);setMobileReader(true);};
    if(confirmLeave(apply))apply();
  };
  if (!model.user)
    return <div className="ls-empty">登录后查看自己的课时笔记。</div>;
  const shown = items.filter(
    (n) =>
      Boolean(n.deleted_at) === trash &&
      `${n.title} ${n.lesson_title}`
        .toLowerCase()
        .includes((query || "").toLowerCase()),
  );
  return (
    <>
      <div className="ns-collection-bar"><div><strong>课时记录</strong><span>已加载 {shown.length} 篇{nextOffset!==null?' · 可加载更多':''}</span></div><div className="ns-actions"><button className="ns-button" onClick={()=>setTrash(v=>!v)}>{trash?'返回课时笔记':'回收站'}</button><button className="ns-button" disabled={loading||busy} onClick={()=>load()}><ArrowClockwise size={17}/>{loading?'读取中':'刷新'}</button></div></div>
      {error&&<p className="ns-error" role="alert">{error}</p>}
      <div className={`ns-workspace ${mobileReader?'is-reading':''} ${focus?'is-focused':''}`}>
        <section className="ns-index" aria-label="课程与项目笔记列表">
          <label className="ns-search"><MagnifyingGlass size={18}/><input aria-label="搜索课时笔记" placeholder="搜索笔记标题、课程" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <div className="ns-list-label"><span>{trash?'课时笔记回收站':'课程与项目笔记'}</span><BookOpen size={16}/></div>
          <div className="ns-note-list">
            {shown.map(note=><button className="ns-note" aria-pressed={current?.id===note.id} key={note.id} onClick={()=>open(note)}><span className="ns-note-title"><FileText size={17}/><strong>{note.title}</strong></span><p>{note.lesson_title}</p><span className="ns-note-meta"><span>{note.video_time==null?'课时笔记':`视频 ${Math.floor(note.video_time/60)}:${String(Math.floor(note.video_time%60)).padStart(2,'0')}`}</span></span></button>)}
            {!shown.length&&<div className="ns-list-empty"><BookOpen size={28}/><strong>{loading?'正在读取笔记…':trash?'回收站是空的':'没有匹配的课时笔记'}</strong><p>课程和项目中保存的笔记，会汇集到这里。</p></div>}
            {nextOffset!==null&&<button className="ns-button" disabled={loading} onClick={()=>load(nextOffset)}>加载更多课时笔记</button>}
          </div>
          <footer className="ns-index-footer">保留课时来源与视频时间标记</footer>
        </section>
        <section className="ns-editor" aria-label="课时笔记内容">
          <header className="ns-editor-toolbar"><div className="ns-actions"><button className="ns-mobile-back ns-icon" aria-label="返回课时笔记列表" onClick={()=>setMobileReader(false)}><ArrowLeft size={19}/></button><span className="ns-save-status">{dirty?'尚未保存':'课程 / 项目笔记'}</span></div><div className="ns-actions">{current&&!current.deleted_at&&(draft?<button className="ns-button ns-primary" disabled={busy} onClick={()=>save(draft)}>{busy?'保存中':'保存修改'}</button>:<button className="ns-button" onClick={()=>setDraft({...current})}>编辑笔记</button>)}<button className="ns-icon ns-focus" aria-label={focus?'退出专注阅读':'专注阅读'} aria-pressed={focus} onClick={()=>setFocus(v=>!v)}>{focus?<ArrowsInSimple size={19}/>:<ArrowsOutSimple size={19}/>}</button></div></header>
          {current?<article className="ns-document">
            <div className="ns-document-label"><BookOpen size={16}/>课时笔记</div><h2>{current.title}</h2>
            <div className="ns-document-meta"><span>{current.lesson_title}</span><span><Clock size={14}/>{current.video_time==null?'无时间标记':`${Math.floor(current.video_time/60)} 分 ${Math.floor(current.video_time%60)} 秒`}</span></div>
            <div className="ns-learning-content" inert={busy}>{draft?<><RichLessonNote value={draft.body} onChange={body=>setDraft({...draft,body})}/><button className="ns-button" onClick={()=>open(current)}>取消编辑</button></>:<RichNoteRead body={current.body}/>}</div>
            <footer className="ns-document-footer"><div className="ns-actions">{current.deleted_at?<button className="ns-button" disabled={busy} onClick={()=>save(current,false)}>恢复笔记</button>:<button className="ns-button ns-quiet" disabled={busy||dirty} onClick={()=>save(current,true)}>移入回收站</button>}</div>{current.source_url&&<button className="ns-button" onClick={()=>navigate(current.source_url)}>返回对应课时 →</button>}</footer>
          </article>:<div className="ns-blank"><div className="ns-blank-icon"><BookOpen size={36} weight="duotone"/></div><h2>把学习的收获留在这里</h2><p>选择一条课时笔记，<br/>连同视频时间与课件，一起回顾当时的思考。</p><button className="ns-button" onClick={()=>navigate('/opc')}>前往学习课程 →</button></div>}
        </section>
      </div>
      {pending&&<Modal title="保留未保存的修改？" close={()=>setPending(null)}><div className="ps-modal-body"><p>课时笔记尚未保存，继续编辑可保留当前修改。</p><div className="ps-form-actions"><button className="ps-outline" onClick={()=>setPending(null)}>继续编辑</button><button className="ps-primary" onClick={()=>{const proceed=pending;setPending(null);proceed();}}>放弃修改</button></div></div></Modal>}
    </>
  );
}
