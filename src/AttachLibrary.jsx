import {useState} from 'react';
import {api} from './api.js';
import {Dialog} from './AdminDialog.jsx';
const stateLabels={draft:'草稿',published:'已发布',archived:'已归档'};
export function AttachLibrary({stepId,onDone}){
  const [open,setOpen]=useState(false),[items,setItems]=useState([]),[id,setId]=useState(''),[preview,setPreview]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const close=()=>{if(!busy)setOpen(false);};
  return <><button onClick={async()=>{setOpen(true);setError('');try{setItems((await api('/admin/platform/library')).items);}catch(e){setError(e.message);}}}>引用统一资料</button>{open&&<Dialog title="引用统一资料" close={close}><form className="platform-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api(`/admin/platform/library/${id}/attach`,{method:'POST',body:JSON.stringify({stepId:Number(stepId),isPreview:preview,status:'draft',sortOrder:0})});setOpen(false);onDone();}catch(e){setError(e.message);}finally{setBusy(false);}}}><p>引用后先保存为章节草稿；请检查排序和预览权限，再发布该条目。原资料修改会同步到所有引用处。</p><label>选择资料<select required value={id} onChange={e=>setId(e.target.value)}><option value="">请选择资料</option>{items.map(i=><option key={i.id} value={i.id}>{i.title} · {stateLabels[i.status]}</option>)}</select></label><label className="cms-checkbox"><input type="checkbox" checked={preview} onChange={e=>setPreview(e.target.checked)}/>此章节允许免费预览</label>{error&&<p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={!id||busy}>添加引用</button></form></Dialog>}</>;
}
