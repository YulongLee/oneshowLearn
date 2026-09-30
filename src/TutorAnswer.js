import {createElement as h,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function answerHref(value){
  if(typeof value!=='string'||/[\u0000-\u0020\\]/.test(value))return null;
  if(/^\/learn\/[\w/-]+(?:\?[^#]*)?(?:#.*)?$/.test(value))return value;
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||/^\[|^[\d.]+$/.test(u.hostname))return null;return u.href;}catch{return null;}
}
export const answerLabel=message=>message.answerKind==='system-model'?'平台配置 · 当前模型':message.answerKind==='system-time'?'系统时间 · 北京时间':message.unavailable?'回答待核实':message.mode==='web'?'联网回答 · 网页参考':message.mode==='general'?'通用建议 · 非课程结论':message.grounded?'资料问答 · 附参考来源':'资料不足';

export function remarkTutorLineBreaks(){
  return tree=>{const walk=node=>{if(['code','inlineCode','html'].includes(node.type)||!node.children)return;node.children=node.children.flatMap(child=>{if(child.type!=='text'){walk(child);return [child];}return child.value.split('\n').flatMap((value,i)=>[...(i?[{type:'break'}]:[]),{type:'text',value}]);});};walk(tree);};
}

// Transform text only: code, existing links and raw HTML are never rewritten.
export function remarkTutorCitations({sources=[]}={}){
  const known=new Set(sources.filter(s=>answerHref(s.href)).map(s=>s.id));
  return tree=>{
    const walk=node=>{
      if(['code','inlineCode','link','linkReference','html'].includes(node.type)||!node.children)return;
      node.children=node.children.flatMap(child=>{
        if(child.type!=='text'){walk(child);return [child];}
        const parts=[];let offset=0;
        for(const m of child.value.matchAll(/\[([WS]\d+)\]/g)){
          if(!known.has(m[1]))continue;
          if(m.index>offset)parts.push({type:'text',value:child.value.slice(offset,m.index)});
          parts.push({type:'link',url:`#tutor-cite-${m[1]}`,children:[{type:'text',value:m[1]}]});offset=m.index+m[0].length;
        }
        if(!parts.length)return [child];
        if(offset<child.value.length)parts.push({type:'text',value:child.value.slice(offset)});
        return parts;
      });
    };walk(tree);
  };
}
function CodeBlock({children}){
  const ref=useRef(null),[copied,setCopied]=useState(false),[failed,setFailed]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(ref.current?.textContent||'');setCopied(true);setFailed(false);}catch{setFailed(true);}};
  return h('div',{className:'tc-code-block'},h('div',{className:'tc-code-toolbar'},h('span',null,'代码'),h('button',{type:'button',onClick:copy,'aria-label':'复制代码'},copied?'已复制':'复制代码')),h('pre',{ref},children),failed&&h('small',{role:'status'},'复制失败，请手动选择代码。'));
}
export function TutorAnswer({body,sources=[]}){
  const byId=new Map(sources.map(s=>[s.id,s]));
  return h('div',{className:'tc-answer-markdown'},h(ReactMarkdown,{
    remarkPlugins:[remarkGfm,remarkTutorLineBreaks,[remarkTutorCitations,{sources}]],skipHtml:true,
    urlTransform:url=>/^#tutor-cite-[WS]\d+$/.test(url)?url:answerHref(url)||'',
    components:{
      a:({href,children})=>{
        const id=href?.match(/^#tutor-cite-([WS]\d+)$/)?.[1],source=id&&byId.get(id),safe=answerHref(source?.href||href);
        if(!safe)return h('span',null,children);
        return h('a',{href:safe,target:'_blank',rel:'noopener noreferrer',...(source?{className:'tc-citation','aria-label':`来源 ${id}：${source.label}，在新标签页打开`}:{})},source?id:children);
      },
      img:({alt})=>h('span',{className:'tc-image-description'},alt?`[图片：${alt}]`:'[图片未加载]'),
      pre:({children})=>h(CodeBlock,null,children),
      table:({children})=>h('div',{className:'tc-answer-table',role:'region','aria-label':'回答中的表格',tabIndex:0},h('table',null,children)),
    }
  },String(body||'')));
}
export function TutorSources({sources=[],mode,searchedAt}){
  const [all,setAll]=useState(false);
  if(!sources.length)return null;
  const visible=all?sources:sources.slice(0,3);
  return h('details',{className:'tc-reference-panel'},
    h('summary',null,h('span',null,`参考来源 · ${sources.length} ${mode==='web'?'个网页':'处资料'}`),h('span',{className:'tc-reference-expand'},'展开 / 收起')),
    h('div',{className:'tc-reference-content'},
      searchedAt&&h('p',{className:'tc-reference-date'},`检索于 ${new Date(searchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）· 请核对原文`),
      h('ol',null,visible.map(s=>{
        const href=answerHref(s.href);let domain='课程资料';if(href?.startsWith('http'))domain=new URL(href).hostname;
        return h('li',{key:s.id},href?h('a',{href,target:'_blank',rel:'noopener noreferrer','aria-label':`查看来源 ${s.id}：${s.label}`},h('span',{className:'tc-reference-id'},s.id),h('span',null,h('strong',null,s.label),h('small',null,domain)),h('span',{'aria-hidden':true},'↗')):h('span',null,`${s.id} · 来源链接不可用`),mode!=='web'&&s.excerpt&&h('p',{className:'tc-reference-excerpt'},s.excerpt));
      })),
      sources.length>3&&h('button',{type:'button',className:'tc-reference-more','aria-expanded':all,onClick:()=>setAll(!all)},all?'收起更多来源':`查看其余 ${sources.length-3} 个来源`)
    ));
}
