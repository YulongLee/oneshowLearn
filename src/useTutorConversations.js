import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {takeTutorQuestion} from './useAiCapabilities.js';

const root='/learning/ai/conversations';
const read=key=>{try{return sessionStorage.getItem(key)||'';}catch{return '';}};
const write=(key,value)=>{try{value?sessionStorage.setItem(key,value):sessionStorage.removeItem(key);}catch{/* Draft caching is best-effort, never conversation persistence. */}};
const pendingRequest=key=>{try{return JSON.parse(read(key))||null;}catch{return null;}};
const uncertainty='上次发送结果尚未确认。请重试原问题；不会重复保存已收到的问题。';
export function useTutorConversations(userId){
  const prefix=`oneshowlearn:tutor:${userId}:`;
  const initial=useRef(read(prefix+'active'));
  const [id,setId]=useState(initial.current==='new'?'':initial.current);
  const idRef=useRef(id), mounted=useRef(false), operation=useRef(false), epoch=useRef(0);
  const [data,setData]=useState(null),[items,setItems]=useState([]),[nextOffset,setNextOffset]=useState(null);
  const [draft,setDraftState]=useState(()=>takeTutorQuestion()||read(prefix+'draft:'+(id||'new')));
  const draftRef=useRef(draft);draftRef.current=draft;
  const [loading,setLoading]=useState(Boolean(userId)),[sending,setSending]=useState(false),[error,setError]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false);
  const setDraft=value=>{draftRef.current=value;setDraftState(value);write(prefix+'draft:'+(idRef.current||'new'),value);};
  const selectId=value=>{idRef.current=value;setId(value);write(prefix+'active',value||'new');};
  const accept=(value,target)=>{
    if(!mounted.current||idRef.current!==target)return;
    setData(current=>current?.conversation.id===target&&current.conversation.version>value.conversation.version?current:value);
    const uncertain=read(prefix+'request:'+target);
    if(uncertain){try{if(value.turns.some(t=>t.id===JSON.parse(uncertain).id))write(prefix+'request:'+target,'');}catch{write(prefix+'request:'+target,'');}}
    setItems(current=>[value.conversation,...current.filter(x=>x.id!==target)]);
  };
  const refresh=async()=>{
    const target=idRef.current;if(!target)return;
    const value=await api(root+'/'+target);accept(value,target);return value;
  };
  const refreshList=async(offset=0)=>{
    const value=await api(root+(offset?'?offset='+offset:''));if(!mounted.current)return;
    setItems(current=>offset?[...current,...value.items.filter(x=>!current.some(c=>c.id===x.id))]:value.items);setNextOffset(value.nextOffset);
    return value;
  };
  useEffect(()=>{
    mounted.current=true;
    if(!userId){setLoading(false);return()=>{mounted.current=false;};}
    const incoming=draftRef.current;
    (async()=>{try{
      const list=await refreshList();if(!mounted.current)return;
      let target=initial.current==='new'?'':initial.current||list.items[0]?.id||'';
      selectId(target);
      if(target){try{await refresh();}catch(e){if(e.status!==404)throw e;selectId('');setData(null);}}
      if(mounted.current){setDraft(incoming||read(prefix+'draft:'+(idRef.current||'new')));setError(read(prefix+'request:'+idRef.current)?uncertainty:'');}
    }catch(e){if(mounted.current)setError('历史对话加载失败：'+e.message);}
    finally{if(mounted.current)setLoading(false);}})();
    return()=>{mounted.current=false;epoch.current++;};
  },[userId]);
  const pending=data?.turns.find(t=>t.status==='pending');
  useEffect(()=>{
    if(!id||!userId)return;
    let active=true,inFlight=false;
    const sync=async()=>{if(inFlight||operation.current)return;inFlight=true;try{const value=await api(root+'/'+id);if(active){accept(value,id);setError(read(prefix+'request:'+id)?uncertainty:'');}}catch(e){if(active)setError('暂时无法同步对话：'+e.message+'。已保存的记录不会删除。');}finally{inFlight=false;}};
    const timer=setInterval(sync,pending?1500:15000);window.addEventListener('focus',sync);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',sync);};
  },[id,pending?.id,userId]);
  const open=async(target)=>{
    if(operation.current||loading)return;const ticket=++epoch.current;
    setLoading(true);setError('');
    try{const value=await api(root+'/'+target);if(!mounted.current||ticket!==epoch.current)return;
      selectId(target);accept(value,target);setDraft(read(prefix+'draft:'+target));setError(read(prefix+'request:'+target)?uncertainty:'');setHistoryOpen(false);
    }catch(e){if(mounted.current)setError('无法打开对话：'+e.message);}finally{if(mounted.current&&ticket===epoch.current)setLoading(false);}
  };
  const startNew=()=>{
    if(operation.current||loading)return;
    epoch.current++;selectId('');setData(null);setError('');setHistoryOpen(false);setDraft(read(prefix+'draft:new'));
  };
  const send=async({question,mode,courseId,includeProduct,retryTurn})=>{
    if(operation.current||loading||pending||!userId)return false;
    operation.current=true;setSending(true);setError('');
    let target=idRef.current;
    try{
      let current=data;
      if(!target){target=crypto.randomUUID();selectId(target);write(prefix+'draft:'+target,draftRef.current);write(prefix+'draft:new','');}
      // Idempotent creation also covers a previous uncertain create response.
      if(!current||current.conversation.id!==target)current=await api(root,{method:'POST',body:JSON.stringify({id:target})});
      let request={id:retryTurn?.id||crypto.randomUUID(),question,mode,courseId:courseId?Number(courseId):null,includeProduct,retry:Boolean(retryTurn)};
      const uncertain=read(prefix+'request:'+target);
      if(uncertain){const previous=JSON.parse(uncertain);
        if(previous.question!==question||previous.mode!==mode||previous.courseId!==request.courseId||previous.includeProduct!==includeProduct)throw Error('上次发送结果尚未确认，请先刷新对话，或重发原问题。');
        request=previous;
      }
      write(prefix+'request:'+target,JSON.stringify(request));
      const value=await api(root+'/'+target+'/turns',{method:'POST',headers:{'If-Match':String(current.conversation.version)},body:JSON.stringify(request)});
      accept(value,target);write(prefix+'request:'+target,'');return true;
    }catch(e){
      // On explicit rejection no write was accepted; uncertain network failures keep the request ID.
      if(e.status&&e.status<500)write(prefix+'request:'+target,'');
      if(mounted.current)setError(e.message+' 输入草稿已保留。');
      return false;
    }finally{operation.current=false;if(mounted.current)setSending(false);}
  };
  const stop=async()=>{if(!pending||operation.current)return;operation.current=true;
    try{const value=await api(root+'/'+id+'/turns/'+pending.id+'/stop',{method:'POST'});accept(value,id);}catch(e){setError('停止请求未确认：'+e.message);}finally{operation.current=false;}
  };
  const reload=async()=>{try{if(idRef.current)await refresh();await refreshList();setError(read(prefix+'request:'+idRef.current)?uncertainty:'');}catch(e){setError(e.message);}};
  const unconfirmed=pendingRequest(prefix+'request:'+id);
  return {id,data,items,nextOffset,draft,setDraft,loading,sending,pending,error,historyOpen,setHistoryOpen,open,startNew,send,stop,reload,unconfirmed,
    retryUnconfirmed:async()=>{if(!unconfirmed)return;const sent=await send({...unconfirmed,retryTurn:unconfirmed.retry?unconfirmed:null});if(sent&&mounted.current&&draftRef.current.trim()===unconfirmed.question)setDraft('');},
    loadMore:()=>refreshList(nextOffset).catch(e=>setError(e.message))};
}
