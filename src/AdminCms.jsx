import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpenText,CheckCircle,CloudArrowUp,FileText,FolderOpen,MagnifyingGlass,Plus,X} from '@phosphor-icons/react';
import {api,money} from './api.js';
import {uploadAsset} from './upload-asset.js';
import {Markdown} from './PersonalShared.jsx';
import {safeResourceUrl} from './opc-model.js';
import './admin-cms.css';
import {AttachLibrary} from './AttachLibrary.jsx';

const kinds={document:'实战文档',prompt:'Prompt',code:'代码',template:'模板',task:'实践任务',checklist:'检查清单',video:'短视频',download:'下载附件'};
const states={draft:'草稿',published:'已发布',archived:'已归档'};
const phases=['不加入 AI OPC','01 产品与机会','02 AI 产品开发','03 上线与合规','04 收款与商业化','05 运营与增长'];
const defaults={packs:{path_id:0,slug:'',title:'',subtitle:'',description:'',deliverable:'',cover_url:'',price_cents:0,estimated_minutes:0,status:'draft',is_featured:false,sort_order:0},steps:{pack_id:0,title:'',summary:'',status:'draft',sort_order:0,phase:0},content:{step_id:0,type:'document',title:'',body:'',resource_url:'',duration_seconds:0,is_preview:false,status:'draft',sort_order:0}};
const labels={paths:'学习路径',packs:'课程',steps:'章节',content:'资料',library:'统一资料',projects:'实战项目',pages:'页面配置'};
function Badge({status}) {return <span className={`admin-status ${status}`}>{states[status]||status}</span>;}
function SectionHead({title,children}) {return <div className="cms-section-head"><h2>{title}</h2>{children}</div>;}
function Empty({children}) {return <div className="cms-empty"><FolderOpen size={30}/><p>{children}</p></div>;}

function AssetStorageStatus(){
  const [storage,setStorage]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;api('/admin/cms/storage').then(value=>{if(active)setStorage(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  return <section className="admin-panel" aria-label="附件存储"><h2>附件存储</h2><p className="cms-hint">{error||(!storage?'正在检查存储配置…':storage.provider==='oss'?`新附件存入阿里云 OSS · ${storage.bucket}/${storage.prefix}`:'新附件存入服务器受保护目录')}</p><small>原有附件保留原路径；课程资料仍按发布状态和学习权限访问。密钥仅在服务器配置。</small></section>;
}

function PrivateAssetUpload({onUploaded}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState([]);
  const controller=useRef(null);
  const reload=()=>api('/admin/uploads').then(d=>setPending(d.items)).catch(e=>setMessage(e.message));
  useEffect(()=>{reload();return()=>controller.current?.abort();},[]);
  const upload=async e=>{
    const input=e.currentTarget,files=Array.from(input.files||[]);
    if(!files.length)return;
    if(files.some(file=>file.size>1024*1024*1024)){setMessage('单个附件不能超过 1GB，请压缩后重试。超过 50MB 的正式视频支持分片恢复。');input.value='';return;}
    if(controller.current)return;controller.current=new AbortController();setBusy(true);let saved=0;
    try{
      for(const file of files){setMessage(`正在上传 ${saved+1}/${files.length}：${file.name}`);await uploadAsset(file,{signal:controller.current.signal,onProgress:p=>setMessage(`${file.name} · ${p.phase==='checking'?'校验':p.phase==='finalizing'?'云端整理':'上传'} ${p.percent}%`)});saved++;}
      setMessage(`已上传 ${saved} 个受保护附件，可在课时编排中引用。`);
    }catch(error){setMessage(`已上传 ${saved} 个。${error.message}，未上传的文件可重新选择。`);}
    finally{controller.current=null;setBusy(false);input.value='';await reload();await onUploaded();}
  };
  useEffect(()=>{if(!busy)return;const guard=e=>{if(e.type==='beforeunload'){e.preventDefault();e.returnValue='';}else if(!window.confirm('附件正在上传，确定离开？'))e.preventDefault();};window.addEventListener('beforeunload',guard);window.addEventListener('oneshowlearn:before-navigate',guard);return()=>{window.removeEventListener('beforeunload',guard);window.removeEventListener('oneshowlearn:before-navigate',guard);};},[busy]);
  return <section className="admin-panel cms-upload"><label><CloudArrowUp size={22}/>上传课程 / 项目附件<input type="file" multiple disabled={busy} accept=".pdf,.txt,.md,.csv,.json,.zip,.pptx,.docx,.xlsx,.mp4,.webm,.mp3,.png,.jpg,.jpeg,.webp,.vtt" onChange={upload}/><small>支持多选课件图片、视频、原件、VTT 字幕。单文件最大 1GB，分片校验上传；中断后 24 小时内重新选择同一文件可恢复。不会自动发布为课程。</small></label><p role="status">{message}</p>{busy&&<button type="button" onClick={()=>controller.current?.abort()}>暂停上传，保留已传分片</button>}{pending.length>0&&<div><h3>本人未完成的上传</h3>{pending.map(s=><p key={s.id}>{s.name} · {Math.round(s.received/s.size*100)}% <button type="button" disabled={busy||s.state!=='uploading'} onClick={async()=>{if(!window.confirm('取消此未完成上传并移除暂存分片？不会删除已发布附件。'))return;setBusy(true);try{await api('/admin/uploads/'+s.id,{method:'DELETE'});await reload();}catch(e){setMessage(e.message);}finally{setBusy(false);}}}>取消暂存</button></p>)}<small>恢复请重新选择同一原文件；云端整理中不能取消。</small><button type="button" disabled={busy} onClick={reload}>刷新状态</button></div>}</section>;
}

export function ContentEditor({entity,initial,paths=[],onClose,onSaved}) {
  const [form,setForm]=useState(()=>({...initial,is_preview:Boolean(initial.is_preview),is_featured:Boolean(initial.is_featured)}));
  const initialJson=useRef(JSON.stringify({...initial,is_preview:Boolean(initial.is_preview),is_featured:Boolean(initial.is_featured)}));
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false),[assets,setAssets]=useState(null),[uploadStatus,setUploadStatus]=useState('');
  const dialog=useRef(null),dirty=JSON.stringify(form)!==initialJson.current;
  const confirmClose=()=>!busy&&!uploading&&(!dirty||window.confirm('有尚未保存的修改，确定放弃这些修改吗？'));
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  useEffect(()=>{
    const unload=e=>{if(dirty||busy||uploading){e.preventDefault();e.returnValue='';}};
    const navigate=e=>{if(!confirmClose())e.preventDefault();};
    window.addEventListener('beforeunload',unload);window.addEventListener('oneshowlearn:before-navigate',navigate);
    return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('oneshowlearn:before-navigate',navigate);};
  },[dirty,busy,uploading]);
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  const input=(key,title,{type='text',max=200,required=false,hint}={})=><label>{title}<input readOnly={key==='title'&&Boolean(form.library_id)} type={type} required={required} maxLength={max} min={type==='number'?0:undefined} step={type==='number'?1:undefined} value={form[key]??''} onChange={e=>set(key,type==='number'?Number(e.target.value):e.target.value)}/>{hint&&<small>{hint}</small>}</label>;
  const area=(key,title,rows=3)=><label>{title}<textarea rows={rows} maxLength={key==='body'?200000:20000} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>;
  const upload=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>1024*1024*1024){setError('附件不能超过 1GB。');e.target.value='';return;}
    setUploading(true);setError('');
    try{const result=await uploadAsset(file,{onProgress:p=>setUploadStatus(`正在${p.phase==='checking'?'校验':p.phase==='finalizing'?'云端整理':'上传'} ${p.percent}%`)});set('resource_url',result.url);}catch(e){setError(e.message);}finally{setUploading(false);setUploadStatus('');e.target.value='';}
  };
  const save=async e=>{
    e.preventDefault();if(uploading||busy)return;setBusy(true);setError('');
    try{
      const response=await api(`/admin/${entity==='library'?'platform':'cms'}/${entity}${form.id?`/${form.id}`:''}`,{method:form.id?'PUT':'POST',headers:form.id?{'If-Match':form.version}:{},body:JSON.stringify(form)});
      onSaved(response.item);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <dialog ref={dialog} className="cms-dialog" aria-label={`${initial.id?'编辑':'新建'}${labels[entity]}`} onCancel={e=>{e.preventDefault();if(confirmClose())onClose();}}><form onSubmit={save}>
    <header><div><small>内容管理 / {labels[entity]}</small><h2>{initial.id?'编辑':'新建'}{labels[entity]}</h2></div><button type="button" className="cms-icon" aria-label="关闭编辑" onClick={()=>{if(confirmClose())onClose();}} disabled={busy||uploading}><X size={22}/></button></header>
    <div className="cms-editor-body"><fieldset disabled={busy||uploading}>
      <div className="cms-form-row">{input('title',`${labels[entity]}名称`,{required:true,max:entity==='content'?200:120})}<label>发布状态<select value={form.status} onChange={e=>set('status',e.target.value)}>{Object.entries(states).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
      <p className="cms-hint">保存发布状态后立即生效；学习者只会看到路径、课程、章节与资料均为“已发布”的内容。归档不会删除历史学习记录，可重新编辑恢复。</p>
      {entity==='paths'&&<>{area('description','路径介绍')}{input('level','学习难度')}</>}
      {entity==='packs'&&<>
        <div className="cms-form-row"><label>所属学习路径<select value={form.path_id} onChange={e=>set('path_id',Number(e.target.value))}>{paths.map(p=><option value={p.id} key={p.id}>{p.title} · {states[p.status]}</option>)}</select></label>{input('slug','课程地址标识',{required:true,hint:'仅小写英文、数字与连字符，例如 ai-opc。更改会改变课程链接。',max:100})}</div>
        {input('subtitle','一句话介绍',{max:300})}{area('description','课程详情 / 学习说明',5)}{area('deliverable','学习成果与交付内容')}
        {input('cover_url','公开封面图片地址',{max:2000,hint:'封面是公开素材，请使用 HTTPS 图片地址或现有公开图片路径。'})}
        <div className="cms-form-row">{input('price_cents','价格（人民币分）',{type:'number',hint:`显示价格 ${money(form.price_cents)}。价格配置不代表已接通在线支付。`})}{input('estimated_minutes','预计学习时长（分钟）',{type:'number'})}</div>
        <label className="cms-checkbox"><input type="checkbox" checked={form.is_featured} onChange={e=>set('is_featured',e.target.checked)}/>推荐课程</label>
      </>}
      {entity==='steps'&&<>{area('summary','章节简介与目标')}<label>AI OPC 阶段编排<select value={form.phase||0} onChange={e=>set('phase',Number(e.target.value))}>{phases.map((p,i)=><option key={p} value={i}>{p}</option>)}</select><small>属于 AI OPC 的章节在这里关联阶段，发布后自动进入相应学习空间。</small></label></>}
      {entity==='content'&&form.library_id&&<p className="cms-hint">此条目引用统一资料 #{form.library_id}。名称、正文与附件请到“统一资料库”修改；这里仅维护本章节的发布状态、免费预览与排序。</p>}
      {entity==='library'&&<p className="cms-hint">原资料修改会同步到所有引用章节。将原资料设为草稿或归档，会隐藏所有引用内容；各章节的免费预览与学习权限仍单独控制。当前引用：{initial.references?.length||0} 处。</p>}
      {(entity==='content'&&!form.library_id||entity==='library')&&<>
        <div className="cms-form-row"><label>资料类型<select value={form.type} onChange={e=>set('type',e.target.value)}>{Object.entries(kinds).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>{input('duration_seconds','阅读 / 演示时长（秒）',{type:'number'})}</div>
        <div className="cms-tabs"><button type="button" aria-pressed={!preview} onClick={()=>setPreview(false)}>编辑正文</button><button type="button" aria-pressed={preview} onClick={()=>setPreview(true)}>正文预览</button></div>
        {preview?<section className="cms-preview"><h3>{form.title||'未命名资料'}</h3><Markdown body={form.body||'还没有正文内容。'}/></section>:area('body','正文（支持 Markdown / Prompt / 代码 / 任务清单）',12)}
        {input('resource_url','配套附件或视频地址',{max:2000,hint:'上传的附件受学习权限保护；外部链接及旧 /uploads 文件属于公开资源，不受本站下载权限控制。'})}
        <div className="cms-upload"><label><CloudArrowUp size={22}/>上传受保护附件<input type="file" accept=".pdf,.txt,.md,.csv,.json,.zip,.pptx,.docx,.xlsx,.mp4,.webm,.mp3,.png,.jpg,.jpeg,.webp" onChange={upload}/><small>PDF / Office / ZIP / 文本 / 图片 / 音视频，最大 1GB</small></label><button type="button" onClick={async()=>{try{setAssets((await api('/admin/cms/assets')).items);}catch(e){setError(e.message);}}}>从附件库选择</button></div>
        {assets&&<div className="cms-asset-picker"><button type="button" onClick={()=>setAssets(null)}>收起附件库</button>{assets.map(a=><button type="button" key={a.id} onClick={()=>{set('resource_url',a.url);setAssets(null);}}><FileText size={16}/>{a.original_name}<small>{a.private?'受保护':'旧公开附件'}</small></button>)}{!assets.length&&<p>附件库为空，请先上传。</p>}</div>}
      </>}
      {entity==='content'&&<label className="cms-checkbox"><input type="checkbox" checked={form.is_preview} onChange={e=>set('is_preview',e.target.checked)}/>设为免费预览（发布后未购买用户也能读取正文和附件）</label>}
      {entity!=='library'&&input('sort_order','显示顺序',{type:'number',hint:'数字越小越靠前；同顺序按创建先后排列。'})}
      {entity==='content'&&form.id&&!form.library_id&&<button type="button" disabled={dirty} onClick={async()=>{setBusy(true);try{await api(`/admin/platform/library/import/${form.id}`,{method:'POST',headers:{'If-Match':form.version}});onSaved(form);}catch(e){setError(e.message);}finally{setBusy(false);}}}>纳入统一资料库（先保存当前修改）</button>}
    </fieldset></div>
    <footer>{error&&<p role="alert" className="admin-error">{error}</p>}<span role="status">{uploading?uploadStatus||'正在上传，请勿关闭…':dirty?'有未保存的修改':'关闭不会更改已保存内容'}</span><div><button type="button" disabled={busy||uploading} onClick={()=>{if(confirmClose())onClose();}}>取消</button><button className="admin-primary" disabled={busy||uploading}>{busy?'正在保存…':'保存修改'}</button></div></footer>
  </form></dialog>;
}

export function AdminCms({mode='overview',navigate}) {
  const [snapshot,setSnapshot]=useState({paths:[],packs:[]}),[tree,setTree]=useState(null),[packId,setPackId]=useState(''),[stepId,setStepId]=useState('');
  const [loading,setLoading]=useState(true),[treeLoading,setTreeLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[editing,setEditing]=useState(null),[assets,setAssets]=useState([]),[audit,setAudit]=useState([]);
  const request=useRef(0),treeRequest=useRef(0);
  async function load(){const rev=++request.current;setLoading(true);setError('');try{const data=await api('/admin/cms/snapshot');if(rev===request.current)setSnapshot(data);if(mode==='assets'){const d=await api('/admin/cms/assets');if(rev===request.current)setAssets(d.items);}if(mode==='audit'){const d=await api('/admin/cms/audit');if(rev===request.current)setAudit(d.items);}}catch(e){if(rev===request.current)setError(e.message);}finally{if(rev===request.current)setLoading(false);}}
  useEffect(()=>{setEditing(null);setNotice('');load();return()=>{request.current++;};},[mode]);
  async function loadTree(value,keepStep=stepId){const rev=++treeRequest.current;setTree(null);if(!value)return;setTreeLoading(true);setError('');try{const data=await api(`/admin/cms/packs/${value}`);if(rev===treeRequest.current){setTree(data);setStepId(data.steps.some(s=>String(s.id)===String(keepStep))?String(keepStep):String(data.steps[0]?.id||''));}}catch(e){if(rev===treeRequest.current)setError(e.message);}finally{if(rev===treeRequest.current)setTreeLoading(false);}}
  useEffect(()=>{loadTree(packId);return()=>{treeRequest.current++;};},[packId]);
  const edit=(entity,item)=>setEditing({entity,item});
  const create=(entity)=>edit(entity,{...defaults[entity],path_id:snapshot.paths[0]?.id||0,pack_id:Number(packId),step_id:Number(stepId),sort_order:entity==='steps'?(Math.max(0,...(tree?.steps||[]).map(s=>s.sort_order))+1):entity==='content'?(Math.max(0,...(selected?.items||[]).map(i=>i.sort_order))+1):0});
  const selected=tree?.steps.find(s=>String(s.id)===String(stepId));
  const matching=list=>list.filter(i=>(filter==='all'||i.status===filter)&&`${i.title} ${i.subtitle||''}`.toLowerCase().includes(query.toLowerCase().trim()));
  const saved=async(item)=>{const kind=editing.entity;setEditing(null);setNotice(`${labels[kind]}已保存。只有完整发布链中的内容会显示到用户平台。`);await load();if(packId)await loadTree(packId,kind==='steps'?item.id:stepId);};
  const titles={overview:['内容运营','从课程准备，到持续交付'],catalog:['课程与学习路径','管理课程信息、定价、上架状态与学习路径'],content:['课程资料','按课程、章节和资料组织你的实战内容'],assets:['附件库','查看已上传资料，受保护附件仅对有权限的学习者开放'],audit:['内容操作记录','最近 100 次通过新版 CMS 保存的操作，不记录正文和文件内容']};
  const pickPack=(value)=>{setPackId(String(value));setStepId('');setQuery('');setFilter('all');};
  const filters=<div className="cms-filters"><label><MagnifyingGlass size={18}/><input aria-label="搜索内容" placeholder="搜索名称…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="发布状态筛选" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部状态</option>{Object.entries(states).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>;
return <div className="cms-page"><div className="admin-page-head"><div><span>ONESHOWLEARN / CONTENT STUDIO</span><h1>{titles[mode][0]}</h1><p>{titles[mode][1]}</p></div><div className="cms-actions"><button onClick={load} disabled={loading}>刷新数据</button>{mode==='catalog'&&<button className="admin-primary" disabled={!snapshot.paths.length} onClick={()=>create('packs')}><Plus size={18}/>新建课程</button>}</div></div>
    {error&&<p role="alert" className="admin-error">{error}</p>}{notice&&<p role="status" className="admin-success"><CheckCircle size={18}/>{notice}</p>}{loading&&<p role="status" className="cms-hint">正在读取管理数据…</p>}
    {mode==='assets'&&<><AssetStorageStatus/><PrivateAssetUpload onUploaded={load}/></>}
    {mode==='overview'&&<><div className="cms-metrics">{[['课程总数',snapshot.packs.length],['已发布课程',snapshot.packs.filter(p=>p.status==='published').length],['草稿课程',snapshot.packs.filter(p=>p.status==='draft').length],['资料总数',snapshot.packs.reduce((a,p)=>a+p.items,0)]].map(([title,value])=><article key={title}><span>{title}</span><strong>{value}</strong><small>来自当前内容库</small></article>)}</div><section className="cms-onboarding"><div><span className="content-kind">内容工作流</span><h2>让每份资料，都有清晰的学习位置。</h2><p>课程信息 → 章节与阶段 → 正文和附件 → 发布检查</p><small>建议内容结构：60% 实战文档 · 20% Prompt/代码/模板 · 10% 任务清单 · 10% 短视频。</small></div><button className="admin-primary" onClick={()=>navigate('/admin/content')}>维护课程内容<ArrowRight size={18}/></button></section><section className="admin-panel"><SectionHead title="课程发布概况"><button onClick={()=>navigate('/admin/catalog')}>管理全部课程 →</button></SectionHead><div className="cms-course-list">{snapshot.packs.map(p=><article key={p.id}><BookOpenText size={22}/><div><strong>{p.title}</strong><small>{p.chapters} 个章节 · {p.published} 项已发布资料 / {p.items} 项资料</small></div><Badge status={p.status}/><span>{p.ready?'可进入发布流程':'待完善内容'}</span></article>)}</div></section></>}
    {mode==='catalog'&&<>{filters}<div className="cms-course-grid">{matching(snapshot.packs).map(p=><article key={p.id}><div className="cms-course-top"><span>{snapshot.paths.find(x=>x.id===p.path_id)?.title}</span><Badge status={p.status}/></div><h2>{p.title}</h2><p>{p.subtitle||'尚未填写课程简介'}</p><small>{p.chapters} 个章节 · {p.items} 项资料 · {p.published} 项有效发布</small><footer><strong>{money(p.price_cents)}</strong><button onClick={()=>edit('packs',p)}>编辑课程</button><button onClick={()=>{pickPack(p.id);navigate('/admin/content');}}>维护资料 →</button></footer></article>)}</div>{!matching(snapshot.packs).length&&!loading&&<Empty>没有匹配的课程，可以新建草稿或调整筛选条件。</Empty>}<section className="admin-panel"><SectionHead title="学习路径分类"/><div className="cms-paths">{snapshot.paths.map(p=><article key={p.id}><div><strong>{p.title}</strong><p>{p.description}</p></div><Badge status={p.status}/><button onClick={()=>edit('paths',p)}>编辑路径</button></article>)}</div></section></>}
    {mode==='content'&&<><section className="cms-course-select"><label>当前课程<select value={packId} onChange={e=>pickPack(e.target.value)}><option value="">请选择要维护的课程</option>{snapshot.packs.map(p=><option value={p.id} key={p.id}>{p.title} · {states[p.status]}</option>)}</select></label><button disabled={!tree||treeLoading} onClick={()=>edit('packs',tree.pack)}>编辑课程信息</button></section>{!packId?<Empty>先选择课程，再维护章节和资料。还没有课程？请到“课程与路径”新建草稿。</Empty>:treeLoading?<Empty>正在读取章节资料…</Empty>:tree&&<><section className="cms-publish-check"><div><strong>发布检查</strong><p>当前课程：{states[tree.pack.status]} · 资料可见需要整个发布链有效</p></div><ul>{tree.readiness.checks.map(c=><li key={c.label} className={c.ok?'ok':''}><CheckCircle size={16}/>{c.label}</li>)}</ul><button onClick={()=>edit('packs',tree.pack)}>设置发布状态</button></section><div className="cms-studio"><aside className="cms-chapters"><SectionHead title="课程章节"><button aria-label="新增章节" onClick={()=>create('steps')}><Plus size={18}/></button></SectionHead>{tree.steps.map(s=><button className={String(stepId)===String(s.id)?'selected':''} key={s.id} onClick={()=>{setStepId(String(s.id));setQuery('');setFilter('all');}}><span>{s.sort_order}. {s.title}</span><small>{states[s.status]} · {s.items.length} 项资料{s.phase?` · OPC 阶段 ${s.phase}`:''}</small></button>)}{!tree.steps.length&&<p className="cms-hint">暂无章节，点击 + 创建。</p>}</aside><section className="cms-materials">{selected?<><SectionHead title={selected.title}><div className="cms-actions"><AttachLibrary stepId={stepId} onDone={()=>loadTree(packId)}/><button onClick={()=>edit('steps',selected)}>编辑章节</button><button className="admin-primary" onClick={()=>create('content')}><Plus size={17}/>新增资料</button></div></SectionHead><p className="cms-hint">{selected.summary||'本章节尚未填写简介'} · {states[selected.status]}</p>{filters}<div className="cms-item-list">{matching(selected.items).map(i=><button key={i.id} onClick={()=>edit('content',i)}><span className="cms-item-icon"><FileText size={22}/></span><span><strong>{i.sort_order}. {i.title}</strong><small>{kinds[i.type]} · {i.is_preview?'免费预览':'课程权限'} · {i.body?'有正文':'无正文'}{i.resource_url?' · 有附件':''}</small></span><Badge status={i.status}/><ArrowRight size={16}/></button>)}</div>{!matching(selected.items).length&&<Empty>当前没有匹配资料，点击“新增资料”添加文档、模板、任务或演示。</Empty>}</>:<Empty>新增或选择一个章节，开始组织你的课程资料。</Empty>}</section></div></>}</>}
    {mode==='assets'&&<section className="admin-panel"><p className="cms-hint">在“课程资料 → 编辑资料”上传或复用附件。旧公开附件不会自动转为私密；请重新上传并替换引用。这里不提供永久删除，避免破坏已发布内容。</p><div className="cms-item-list">{assets.map(a=><article key={a.id}><FileText size={22}/><div><strong>{a.original_name}</strong><small>{(a.size_bytes/1024/1024).toFixed(2)} MB · {a.private?'受学习权限保护':'旧公开附件'} · {a.created_at}</small></div><button onClick={async()=>{try{const d=await api(`/admin/cms/assets/${a.id}/link`);if(safeResourceUrl(d.url))window.open(d.url,'_blank','noopener,noreferrer');}catch(e){setError(e.message);}}}>打开附件</button></article>)}</div>{!assets.length&&!loading&&<Empty>暂未上传附件。</Empty>}</section>}
    {mode==='audit'&&<section className="admin-panel"><div className="cms-course-list">{audit.map(a=><article key={a.id}><FileText size={20}/><div><strong>{a.title}</strong><small>{a.actor_name||'原管理员'} · {({create:'新建',update:'修改',import:'导入',attach:'引用',publish:'发布'})[a.action]||a.action}{labels[a.entity]} · {a.created_at}</small></div><Badge status={a.status}/></article>)}</div>{!audit.length&&!loading&&<Empty>通过新版 CMS 保存内容后，操作记录会显示在这里。</Empty>}</section>}
    {editing&&<ContentEditor key={`${editing.entity}-${editing.item.id||'new'}`} entity={editing.entity} initial={editing.item} paths={snapshot.paths} onClose={()=>setEditing(null)} onSaved={saved}/>}
  </div>;
}
