import {useEffect,useRef,useState} from 'react';
import {STUDY_COLUMNS_KEY,studyPreferences,studyColumns,resizedStudyColumn} from './study-columns-model.js';
import './study-columns.css';

function read(){try{return studyPreferences(JSON.parse(localStorage.getItem(STUDY_COLUMNS_KEY)));}catch{return studyPreferences();}}
// Only presentation preferences are stored. Children never remount during resizing.
export function StudyColumns({children,className}) {
  const grid=useRef(null),drag=useRef(null),latest=useRef(null);
  const [preferences,setPreferences]=useState(read),[width,setWidth]=useState(0),[active,setActive]=useState('');
  const layout=studyColumns(width,preferences);latest.current={layout,preferences};
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));
    observer.observe(grid.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(!active)try{localStorage.setItem(STUDY_COLUMNS_KEY,JSON.stringify(preferences));}catch{}},[preferences,active]);
  useEffect(()=>{const sync=e=>{if(e.key===STUDY_COLUMNS_KEY&&!drag.current)setPreferences(read());};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  const finish=(event,cancel=false)=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    drag.current=null;if(cancel)setPreferences(current.original);setActive('');
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handle=side=>({
    role:'separator',tabIndex:0,'aria-label':side==='directory'?'调整课程目录宽度':'调整笔记区宽度','aria-orientation':'vertical',
    'aria-valuemin':side==='directory'?200:280,'aria-valuemax':layout[side+'Max'],'aria-valuenow':layout[side],
    'aria-valuetext':`${layout[side]} 像素`,'aria-description':'拖动调整；左右方向键微调，Home/End 最小/最大，Enter 或双击恢复默认，Escape 取消拖动。',
    onPointerDown:e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();drag.current={id:e.pointerId,x:e.clientX,size:layout[side],original:preferences};e.currentTarget.setPointerCapture(e.pointerId);setActive(side);},
    onPointerMove:e=>{const d=drag.current;if(d?.id!==e.pointerId)return;const value=d.size+(e.clientX-d.x)*(side==='directory'?1:-1);setPreferences(p=>({...p,[side]:resizedStudyColumn(latest.current.layout,side,value)}));},
    onPointerUp:e=>finish(e),onPointerCancel:e=>finish(e,true),onLostPointerCapture:e=>finish(e,true),
    onDoubleClick:()=>setPreferences(p=>({...p,[side]:null})),
    onKeyDown:e=>{
      if(e.key==='Escape'&&drag.current){finish({pointerId:drag.current.id,currentTarget:e.currentTarget},true);return;}
      if(e.key==='Enter'){e.preventDefault();setPreferences(p=>({...p,[side]:null}));return;}
      const step=(e.shiftKey?40:16)*(side==='directory'?1:-1),values={ArrowLeft:layout[side]-step,ArrowRight:layout[side]+step,Home:side==='directory'?200:280,End:layout[side+'Max']};
      if(Object.hasOwn(values,e.key)){e.preventDefault();setPreferences(p=>({...p,[side]:resizedStudyColumn(layout,side,values[e.key])}));}
    },
  });
  return <><div className="study-columns-tools"><span>{layout.mode==='stacked'?'窄屏已自动排列学习面板':'拖动视频两侧分隔条，调整目录与笔记宽度'}</span><button type="button" onClick={()=>setPreferences(studyPreferences())}>恢复默认布局</button></div>
    <div ref={grid} className={className} data-study-mode={layout.mode} data-study-resizing={active||undefined} style={{'--study-directory':`${layout.directory}px`,'--study-notes':`${layout.notes}px`,'--study-gap':`${layout.gap}px`}}>
      {children}
      <div className="study-splitter study-splitter-directory" {...handle('directory')}><span/></div>
      <div className="study-splitter study-splitter-notes" {...handle('notes')}><span/></div>
    </div></>;
}
