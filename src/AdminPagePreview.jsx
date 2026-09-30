import {useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PublicHomepage} from './PublicHomepage.jsx';

// Keep the real public components isolated from management navigation/form CSS.
// The frame runs no scripts; its DOM is rendered by this authenticated parent.
export function AdminPagePreview({configuration}){
  const frame=useRef(null),[target,setTarget]=useState(null);
  return <><p className="cms-hint">页面样式预览；按钮不执行页面跳转，预览内容不会公开。</p><iframe ref={frame} title="官网首页草稿预览" sandbox="allow-same-origin" className="platform-preview-frame" srcDoc={'<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="preview-root"></div></body></html>'} onLoad={()=>{const doc=frame.current.contentDocument;for(const style of document.querySelectorAll('style,link[rel="stylesheet"]')){const copy=style.cloneNode(true);if(style.tagName==='LINK')copy.href=style.href;doc.head.append(copy);}doc.body.style.margin='0';setTarget(doc.getElementById('preview-root'));}}/>{target&&createPortal(<PublicHomepage configuration={configuration} navigate={()=>{}}/>,target)}</>;
}
