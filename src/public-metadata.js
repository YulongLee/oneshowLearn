import {describePublicRoute,documentMetadata,PUBLIC_ORIGIN,trustedPublicOrigin} from '../server/public-seo-model.mjs';
let publicOrigin=PUBLIC_ORIGIN;
function apply(metadata){
  document.title=metadata.title||'OneShowLearn';
  for(const selector of ['link[rel="canonical"]','meta[property^="og:"]','meta[name^="twitter:"]','#public-schema'])document.head.querySelectorAll(selector).forEach(node=>node.remove());
  for(const [name,content] of Object.entries({description:metadata.description||'OneShowLearn AI 产品实战学习平台。',robots:metadata.robots})){
    let el=document.head.querySelector(`meta[name="${name}"]`);if(!el){el=document.createElement('meta');el.name=name;document.head.append(el);}el.content=content;
  }
  if(metadata.canonical){const el=document.createElement('link');el.rel='canonical';el.href=metadata.canonical;document.head.append(el);}
  if(metadata.schema){const el=document.createElement('script');el.id='public-schema';el.type='application/ld+json';el.textContent=JSON.stringify(metadata.schema);document.head.append(el);}
  if(metadata.canonical){
    const fields={'og:type':'website','og:locale':'zh_CN','og:site_name':'OneShowLearn','og:title':metadata.title,'og:description':metadata.description,'og:url':metadata.canonical,'twitter:card':'summary','twitter:title':metadata.title,'twitter:description':metadata.description};
    const image=document.querySelector('meta[name="public-share-image"]')?.content;
    if(image?.startsWith(publicOrigin+'/assets/')){fields['og:image']=image;fields['twitter:image']=image;}
    for(const [key,content] of Object.entries(fields)){const el=document.createElement('meta');el.setAttribute(key.startsWith('og:')?'property':'name',key);el.content=content;document.head.append(el);}
  }
}
export function updatePublicMetadata(data){
  if(typeof document==='undefined')return;
  const route=describePublicRoute(window.location.pathname+window.location.search,publicOrigin);
  if(route.kind!==data.kind||route.kind==='course'&&route.slug&&route.slug!==data.slug)return;
  apply(documentMetadata(route,data));
}
// Retain server metadata on the initial document; only a real route change resets it.
export function installPublicMetadata(){
  try{publicOrigin=trustedPublicOrigin(document.querySelector('meta[name="public-origin"]')?.content||PUBLIC_ORIGIN);}catch{publicOrigin=PUBLIC_ORIGIN;}
  let current=window.location.pathname+window.location.search;
  const update=()=>{
    const next=window.location.pathname+window.location.search;
    if(current===next)return;current=next;
    const route=describePublicRoute(next,publicOrigin);
    const metadata=documentMetadata(route);
    apply(metadata);
    // Course identity/price is restored by the loaded course, never by a previous page or guessed slug.
  };
  window.addEventListener('popstate',update);window.addEventListener('oneshowlearn:route-change',update);
  return()=>{window.removeEventListener('popstate',update);window.removeEventListener('oneshowlearn:route-change',update);};
}
export function readPublicBootstrap(){
  const node=document.getElementById('public-bootstrap');if(!node)return null;
  try{const value=JSON.parse(node.textContent);return ['home','course'].includes(value.kind)?value:null;}catch{return null;}finally{node.remove();}
}
