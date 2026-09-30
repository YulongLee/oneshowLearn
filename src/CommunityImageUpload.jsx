import {useEffect,useState} from 'react';
import {api} from './api.js';

export function CommunityImagePreview({value,alt}){
  const [src,setSrc]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;setFailed(false);setSrc('');const match=value?.match(/^\/api\/materials\/(\d+)$/);if(match)api(`/admin/cms/assets/${match[1]}/link`).then(r=>{if(active)setSrc(r.url);}).catch(()=>{if(active)setFailed(true);});else setSrc(value||'');return()=>{active=false;};},[value]);
  if(!value)return null;
  return failed?<p role="status" className="cms-hint">图片暂时无法预览，请检查图片地址或重新上传。</p>:src?<img className="community-image-preview" src={src} alt={alt} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<p role="status">正在加载图片预览…</p>;
}
export function CommunityImageUpload({label,value,onChange,onBusy,onError,hint}){
  const [name,setName]=useState('');
  const upload=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){onError('请选择 5MB 以内的 PNG、JPEG 或 WebP 图片。');return;}
    onBusy(true);onError('');try{const body=new FormData();body.append('file',file);const result=await api('/admin/cms/assets',{method:'POST',body});onChange(result.url);setName(file.name);}catch(error){onError(error.message);}finally{onBusy(false);}
  };
  return <fieldset className="community-image-upload"><legend>{label}</legend><CommunityImagePreview value={value} alt={`${label}预览`}/><label>选择本地图片<input aria-label={`上传${label}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>{name&&<p className="cms-hint">已上传：{name}；保存草稿并发布后才会在前台生效。</p>}<details><summary>已有图片地址（可选）</summary><label>{label}地址<input value={value||''} maxLength={2000} onChange={e=>{onChange(e.target.value);setName('');}} placeholder="https://… 或已上传的图片地址"/></label></details>{value&&<button type="button" onClick={()=>{onChange('');setName('');}}>移除当前图片</button>}<p className="cms-hint">{hint||'支持 PNG / JPEG / WebP，最大 5MB。更换图片不会删除旧文件，历史版本仍可恢复。'}</p></fieldset>;
}
