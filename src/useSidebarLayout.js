import {useEffect,useRef,useState} from 'react';
import {readSidebarPreferences,saveSidebarPreferences,sidebarWidth,SIDEBAR_DEFAULT,SIDEBAR_MAX} from './sidebar-preferences.js';

export function useSidebarLayout(){
  const [preferences,setPreferences]=useState(readSidebarPreferences);
  const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:1000px)').matches);
  const [resizing,setResizing]=useState(false);
  const drag=useRef(null);
  useEffect(()=>{const media=window.matchMedia('(max-width:1000px)');const change=()=>{setMobile(media.matches);drag.current=null;setResizing(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  useEffect(()=>{if(!resizing)saveSidebarPreferences(preferences);},[preferences,resizing]);
  const setMode=mode=>setPreferences(p=>({...p,mode}));
  const resize=width=>setPreferences(p=>({...p,width:sidebarWidth(width)}));
  const finish=(event,cancel=false)=>{
    if(!drag.current||drag.current.id!==event.pointerId)return;
    const original=drag.current.width;drag.current=null;
    if(cancel)resize(original);
    setResizing(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const separator={
    role:'separator',tabIndex:0,'aria-label':'调整侧栏宽度','aria-orientation':'vertical','aria-valuemin':SIDEBAR_DEFAULT,'aria-valuemax':SIDEBAR_MAX,'aria-valuenow':preferences.width,'aria-valuetext':`${preferences.width} 像素`,
    'aria-description':'拖动调整宽度；方向键微调，双击恢复默认',
    onPointerDown:event=>{if(event.button!==0||mobile)return;event.preventDefault();event.currentTarget.focus();drag.current={id:event.pointerId,x:event.clientX,width:preferences.width};event.currentTarget.setPointerCapture(event.pointerId);setResizing(true);},
    onPointerMove:event=>{if(drag.current?.id===event.pointerId)resize(drag.current.width+event.clientX-drag.current.x);},
    onPointerUp:event=>finish(event),onPointerCancel:event=>finish(event,true),onLostPointerCapture:event=>finish(event,true),
    onDoubleClick:()=>resize(SIDEBAR_DEFAULT),
    onKeyDown:event=>{const values={ArrowLeft:preferences.width-16,ArrowRight:preferences.width+16,Home:SIDEBAR_DEFAULT,End:SIDEBAR_MAX,Enter:SIDEBAR_DEFAULT};if(Object.hasOwn(values,event.key)){event.preventDefault();resize(values[event.key]);}},
  };
  return {...preferences,mobile,resizing,setMode,resize,separator};
}
