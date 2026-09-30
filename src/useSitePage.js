import {useEffect,useState} from 'react';
import {api} from './api.js';
import {SITE_DEFAULTS} from './site-defaults.js';
export function useSitePage(key,configuration){
  const [state,setState]=useState({data:{...SITE_DEFAULTS[key],courses:[],projects:[]},error:'',loading:true});
  useEffect(()=>{if(configuration){setState({data:configuration,error:'',loading:false});return;}let active=true;api(`/site/pages/${key}`).then(data=>{if(active)setState({data,error:'',loading:false});}).catch(()=>{if(active)setState(s=>({...s,error:'内容暂时无法加载，请刷新重试。',loading:false}));});return()=>{active=false;};},[key,configuration]);
  return configuration?{data:configuration,error:'',loading:false}:state;
}
