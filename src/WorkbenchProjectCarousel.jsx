import {cloneElement,useEffect,useRef,useState} from 'react';
import {advanceProjectFlow} from './workbench-carousel-model.js';

export function WorkbenchProjectCarousel({items,renderItem}) {
  const root=useRef(null),track=useRef(null),geometry=useRef({step:0,cycle:0}),phase=useRef(0);
  const [visible,setVisible]=useState(3),[paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const [hidden,setHidden]=useState(()=>document.hidden),[reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches),[inView,setInView]=useState(false);
  const keys=items.map(item=>item.id).join(','),loop=items.length>visible&&!reduced;
  const running=loop&&!paused&&!hovered&&!focused&&!hidden&&inView;

  useEffect(()=>{
    const el=root.current,list=track.current;if(!el||!list)return;
    const measure=()=>{
      const card=list.firstElementChild;if(!card)return;
      const gap=Number.parseFloat(getComputedStyle(list).columnGap)||14,step=card.getBoundingClientRect().width+gap;
      const logical=geometry.current.step?el.scrollLeft/geometry.current.step:0;
      geometry.current={step,cycle:items.length*step};
      setVisible(Math.max(1,Math.round((el.clientWidth+gap)/step)));
      el.scrollLeft=logical*step;
      phase.current=logical*step;
      const active=document.activeElement?.closest('.wd-project-slide:not([data-copy])');
      if(active&&list.contains(active)){
        const index=Number(active.dataset.projectIndex),left=index*step;
        if(left<el.scrollLeft||left+step-gap>el.scrollLeft+el.clientWidth){el.scrollLeft=left;phase.current=left;}
      }
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(el);
    if(list.firstElementChild)observer.observe(list.firstElementChild);
    return()=>observer.disconnect();
  },[keys,loop]);

  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden);
    const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting&&entry.intersectionRatio>=.2),{threshold:[0,.2]});
    if(root.current)observer.observe(root.current);
    media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
    return()=>{observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
  },[]);

  useEffect(()=>{
    if(!running)return;
    phase.current=root.current.scrollLeft;
    let frame,last;
    const tick=time=>{
      const el=root.current;
      if(el&&last!==undefined){phase.current=advanceProjectFlow(phase.current,time-last,geometry.current.cycle);el.scrollLeft=phase.current;}
      last=time;frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[running,keys]);

  const focus=event=>{
    setFocused(true);
    // Seam copies are pointer-operable, but only originals are keyboard targets.
    const copy=event.target.closest('.wd-project-slide[data-copy]');
    if(copy){
      const index=Number(copy.dataset.projectIndex),original=track.current.children[index]?.querySelector('button');
      root.current.scrollLeft=Math.max(0,root.current.scrollLeft-geometry.current.cycle);
      original?.focus({preventScroll:true});
    }
  };
  const slide=(item,index,copy=false)=><div key={`${copy?'copy':'project'}-${item.id}`} className="wd-project-slide" data-project-index={index} data-copy={copy?'true':undefined} aria-hidden={copy?true:undefined}
    onPointerDownCapture={event=>{if(copy&&event.pointerType==='mouse')event.preventDefault();}}>
    {copy?cloneElement(renderItem(item),{tabIndex:-1}):renderItem(item)}
  </div>;
  return <div ref={root} className="wd-project-carousel" role="region" aria-label="实战项目推荐" data-count={items.length} data-visible={visible} data-flow={loop} data-rotating={running}
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onPointerDown={event=>{if(event.pointerType==='touch')setPaused(true);}}
    onFocusCapture={focus} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
    {loop&&<button className="wd-flow-control" aria-label={paused?'恢复项目流动':'暂停项目流动'} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?'恢复项目流动':'暂停项目流动'}</button>}
    <div ref={track} className="wd-project-grid">{items.map((item,index)=>slide(item,index))}{loop&&items.map((item,index)=>slide(item,index,true))}</div>
  </div>;
}
