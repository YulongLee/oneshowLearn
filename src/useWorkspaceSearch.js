import {useEffect,useState} from 'react';
import {api,getToken} from './api.js';
export function useWorkspaceSearch(query,enabled,identity){
 const [result,setResult]=useState({items:[],loading:false,error:''});
 useEffect(()=>{
  const q=query.trim();setResult({items:[],loading:enabled&&Boolean(q),error:''});
  if(!enabled||!q)return;
  const controller=new AbortController(),token=getToken();let active=true;
  const timer=setTimeout(()=>api('/search?q='+encodeURIComponent(q),{signal:controller.signal}).then(data=>{if(active&&getToken()===token)setResult({items:data.items||[],loading:false,error:''});}).catch(e=>{if(active&&getToken()===token)setResult({items:[],loading:false,error:e.message});}),250);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[query,enabled,identity]);
 return result;
}
