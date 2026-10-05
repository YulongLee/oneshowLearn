import {api,getToken} from './api.js';

// Only public offer/catalogue metadata may be reused briefly. Auth-dependent
// learning entry is coalesced while in flight, never retained as progress cache.
const ages=new Map([['/commerce/offer',5000],['/catalog/workspace',5000],['/learning/entry',0]]);
export function createSharedReads({read,identity,now=Date.now}){
  let account;const entries=new Map();
  return (path,{force=false}={})=>{
    if(!ages.has(path))throw Error('This endpoint cannot be shared');
    const owner=identity();if(owner!==account){account=owner;entries.clear();}
    const age=ages.get(path),previous=entries.get(path);
    if(previous?.pending)return previous.pending.then(structuredClone);
    if(!force&&age&&previous?.value&&now()-previous.at<age)return Promise.resolve(structuredClone(previous.value));
    const entry={};entries.set(path,entry);
    let request;try{request=read(path);}catch(error){entries.delete(path);return Promise.reject(error);}
    entry.pending=Promise.resolve(request).then(value=>{
      if(identity()!==owner)throw Error('账号已切换，请重新读取');
      if(account===owner&&entries.get(path)===entry){entry.pending=null;if(age){entry.value=structuredClone(value);entry.at=now();}else entries.delete(path);}
      return value;
    }).catch(error=>{if(entries.get(path)===entry)entries.delete(path);throw error;});
    return entry.pending.then(structuredClone);
  };
}
export const sharedRead=createSharedReads({read:api,identity:getToken});
