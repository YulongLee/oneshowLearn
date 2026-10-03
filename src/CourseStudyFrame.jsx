import { Children, useEffect, useId, useRef, useState } from 'react';
import { ListBullets, Robot, Eye, EyeSlash } from '@phosphor-icons/react';
import { COURSE_PANELS_KEY, coursePanelPreferences, toggleCoursePanel } from './course-study-preferences.js';
import './course-study-reference.css';

const KEY = 'oneshowlearn.courseRailWidth.v1';
const bounded = value => Math.max(300, Math.min(480, Number(value) || 360));

// A single mounted reading surface keeps playback, pending saves and note drafts alive.
export function CourseStudyFrame({ children }) {
  const parts = Children.toArray(children);
  const panelId = useId();
  const [panels, setPanels] = useState(() => {
    try { return coursePanelPreferences(JSON.parse(localStorage.getItem(COURSE_PANELS_KEY))); }
    catch { return coursePanelPreferences(); }
  });
  const hasRail = panels.directory || panels.assistant;
  const togglePanel = key => {
    const next = toggleCoursePanel(panels, key);
    // Persist on the action itself, including immediate reloads/navigation.
    try { localStorage.setItem(COURSE_PANELS_KEY, JSON.stringify(next)); } catch {}
    setPanels(next);
  };
  const [width, setWidth] = useState(() => {
    try { return bounded(localStorage.getItem(KEY)); } catch { return 360; }
  });
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (!dragging) try { localStorage.setItem(KEY, String(width)); } catch {} }, [width, dragging]);
  const end = (e, cancel = false) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    if (cancel) setWidth(drag.current.width);
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <><div className="cs-view-controls" role="group" aria-label="学习面板显示设置"><span>学习视图</span>
    {[[ 'directory', '课程目录', ListBullets ], [ 'assistant', '学习助手', Robot ]].map(([key,label,Icon]) => <button type="button" key={key} aria-pressed={panels[key]} aria-controls={`${panelId}-${key}`} aria-label={`${panels[key] ? '隐藏' : '显示'}${label}`} onClick={()=>togglePanel(key)}><Icon size={17}/><span>{label}</span>{panels[key] ? <Eye size={15}/> : <EyeSlash size={15}/>}</button>)}
  </div><div className="cs-layout" data-rail-hidden={!hasRail || undefined} style={{ '--course-rail-width': `${width}px` }} data-resizing={dragging || undefined}>
    {parts[1]}
    <aside className="cs-rail" aria-label="课程目录与学习助手" hidden={!hasRail}>
      <div className="cs-directory-slot" id={`${panelId}-directory`} hidden={!panels.directory}>{parts[0]}</div>
      <div className="cs-assistant-slot" id={`${panelId}-assistant`} hidden={!panels.assistant}>{parts[2]}</div>
    </aside>
    <div className="cs-splitter" hidden={!hasRail} role="separator" tabIndex={0} aria-label="调整课程侧栏宽度" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={480} aria-valuenow={width}
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); drag.current = { id:e.pointerId, x:e.clientX, width }; e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }}
      onPointerMove={e => { const d=drag.current; if (d?.id===e.pointerId) setWidth(bounded(d.width+d.x-e.clientX)); }}
      onPointerUp={e => end(e)} onPointerCancel={e => end(e,true)} onLostPointerCapture={e => end(e,true)}
      onDoubleClick={() => setWidth(360)}
      onKeyDown={e => {
        if (e.key==='Escape' && drag.current) { end({ pointerId:drag.current.id,currentTarget:e.currentTarget },true); return; }
        const values={ ArrowLeft:width+16, ArrowRight:width-16, Home:300, End:480, Enter:360 };
        if (Object.hasOwn(values,e.key)) { e.preventDefault(); setWidth(bounded(values[e.key])); }
      }}><span/></div>
  </div></>;
}
