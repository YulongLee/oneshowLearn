import {useEffect,useState} from 'react';
import {api} from './api.js';
export function useAiAllowance(userId,pendingId,sending){
 const [state,setState]=useState(null),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true,request=0;
  if(!userId){setState(null);return;}
  const refresh=()=>{const current=++request;return api('/learning/ai/allowance').then(data=>active&&current===request&&setState({userId,data})).catch(()=>active&&current===request&&setState({userId,error:true}));};
  refresh();
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  document.addEventListener('visibilitychange',visible);
  return()=>{active=false;document.removeEventListener('visibilitychange',visible);};
 },[userId,pendingId,sending,retry]);
 return {state:state?.userId===userId?state:null,retry:()=>setRetry(v=>v+1)};
}
