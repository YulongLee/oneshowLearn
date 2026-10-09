import {BrandIdentity} from './BrandIdentity.jsx';
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, ChartBar, Check, FileText, FolderOpen, House, List, Package, Plus, SignOut, Users, X } from "@phosphor-icons/react";
import { api, money, setToken } from "./api.js";
import {uploadAsset} from "./upload-asset.js";
import { AuthPage } from "./Auth.jsx";
import { canManage } from "./platforms.js";
import "./admin.css";
export { AdminUsers, AdminEmail, AdminAccountAudit } from "./AccountAdmin.jsx";

const nav = [
  ["/admin", "内容运营", ChartBar], ["/admin/readiness", "正式交付检查", Check], ["/admin/catalog", "课程与路径", Package], ["/admin/content", "课程资料", BookOpenText],
  ["/admin/library", "统一资料库", FileText], ["/admin/projects", "实战项目管理", Package], ["/admin/pages", "页面配置", House],
  ["/admin/community", "官方社区内容", Users],
  ["/admin/analytics", "经营与体验监测", ChartBar], ["/admin/parsing", "资料自动解析", FileText], ["/admin/certificates", "课程结业证书", Check],
  ["/admin/learning", "课时与项目编排", BookOpenText],
  ["/admin/ai", "AI 配置", ChartBar],
  ["/admin/payments", "支付与定价", Package],
  ["/admin/service", "购买与服务说明", FileText], ["/admin/support", "售后申请", Users],
  ["/admin/login-settings", "登录方式配置", Users],
  ["/admin/opc", "AI OPC 编排", BookOpenText], ["/admin/assets", "附件库", FolderOpen], ["/admin/content-audit", "内容操作记录", FileText],
  ["/admin/orders", "订单管理", FileText], ["/admin/users", "用户管理", Users],
  ["/admin/email", "邮件服务", FileText], ["/admin/account-audit", "账号操作记录", FileText], ["/admin/account", "账号安全", Users],
];

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const load = () => { setState((s) => ({ ...s, loading: true, error: "" })); loader().then((data) => setState({ loading: false, data, error: "" })).catch((e) => setState({ loading: false, data: null, error: e.message })); };
  useEffect(load, deps);
  return [state, load];
}

export function AdminLogin({ navigate }) {
  return <AuthPage navigate={navigate} platform="admin" />;
}

export function AdminShell({ route, navigate, children }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; api("/auth/me").then(({ user }) => { if (!active) return; if (!canManage(user)) { navigate("/app"); return; } setUser(user); }).catch((e) => { if (!active) return; if (e.status === 401) { setToken(""); navigate("/admin/login"); } else setError(e.message); }); return () => { active = false; }; }, []);
  const logout = async () => { try { await api("/auth/logout", { method: "POST" }); } catch (e) { if (e.status !== 401) { setError(e.message); return; } } setToken(""); navigate("/admin/login"); };
  if (!user) return <div className="admin-state">{error || "正在验证管理权限…"}</div>;
  const visibleNav = nav.filter(([path]) => user.role === "admin" || !["/admin/analytics", "/admin/parsing", "/admin/certificates", "/admin/readiness", "/admin/ai", "/admin/payments", "/admin/service", "/admin/support", "/admin/login-settings", "/admin/users", "/admin/email", "/admin/account-audit"].includes(path));
  return <div className="admin-layout"><aside className={open ? "open" : ""}><button className="admin-brand" onClick={() => navigate("/admin")}><BrandIdentity tagline="运营管理后台"/></button><nav>{visibleNav.map(([path,label,Icon])=><button key={path} className={route===path?"active":""} onClick={()=>{navigate(path);setOpen(false);}}><Icon size={19}/>{label}</button>)}</nav><button className="admin-logout" onClick={logout}><SignOut size={19}/>退出登录</button></aside><main><header><button onClick={()=>setOpen(!open)} aria-label="打开管理导航">{open?<X size={22}/>:<List size={22}/>}</button><div><strong>内容与商业化管理</strong><small>所有前台课程资料均由这里配置</small></div><button className="admin-platform-switch" onClick={() => navigate("/app")}>切换到用户平台 <ArrowRight size={15}/></button></header><div className="admin-content">{error && <p className="admin-error" role="alert">{error}</p>}{children}</div></main></div>;
}

function Loading({ state }) { if(state.loading)return <div className="admin-state">正在加载…</div>; if(state.error)return <div className="admin-state error">{state.error}</div>; return null; }
function Status({ value }) { return <span className={`admin-status ${value}`}>{({published:"已发布",draft:"草稿",archived:"已归档",active:"正常",pending:"待支付",paid:"已支付",cancelled:"已取消",refunded:"已退款"})[value]||value}</span>; }
function Header({ kicker, title, copy, action }) { return <div className="admin-page-head"><div><span>{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>; }

export function AdminDashboard() {
  const [state] = useLoad(() => api("/admin/dashboard"));
  return <><Header kicker="经营总览" title="今天从这里开始运营" copy="查看内容供给、用户与订单状态。"/><Loading state={state}/>{state.data&&<><div className="admin-metrics">{[["已发布路径",state.data.publishedPaths],["已发布项目包",state.data.publishedPacks],["注册学习者",state.data.users],["待处理订单",state.data.pendingOrders]].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong><small>实时数据</small></article>)}</div><section className="admin-panel admin-revenue"><div><span>累计实收</span><strong>{money(state.data.paidRevenueCents)}</strong><p>已接入微信与支付宝；实收以服务器核验订单为准，退款登记另列，不等同于净结算。</p></div><ChartBar size={52} weight="duotone"/></section><div className="admin-quick"><article><BookOpenText size={24}/><strong>内容配置原则</strong><p>60% 实战文档 · 20% Prompt/代码/模板 · 10% 任务清单 · 10% 短视频。</p></article><article><Package size={24}/><strong>销售单位</strong><p>当前以五章完整课程一次性购买为主，实战项目按实际发布配置提供。</p></article></div></> }</>;
}

export function AdminCatalog() {
  const [pathState, reloadPaths] = useLoad(()=>api("/admin/paths")); const [packState] = useLoad(()=>api("/admin/packs"));
  const [editing,setEditing]=useState(null); const save=async(e)=>{e.preventDefault();await api(`/admin/paths/${editing.id}`,{method:"PUT",body:JSON.stringify({title:editing.title,description:editing.description,level:editing.level,status:editing.status,sortOrder:editing.sort_order})});setEditing(null);reloadPaths();};
  return <><Header kicker="商品目录" title="产品与学习路径" copy="维护当前课程与实际学习路径，不改变既有五章内容。"/><Loading state={pathState}/><section className="admin-panel"><div className="admin-section-title"><div><h2>学习路径</h2><p>控制名称、介绍、级别与上架状态。</p></div></div><div className="admin-table"><div className="tr head"><span>路径</span><span>级别</span><span>状态</span><span>排序</span><span></span></div>{pathState.data?.items.map(item=><div className="tr" key={item.id}><span><strong>{item.title}</strong><small>{item.description}</small></span><span>{item.level}</span><span><Status value={item.status}/></span><span>{item.sort_order}</span><span><button onClick={()=>setEditing(item)}>编辑</button></span></div>)}</div></section><section className="admin-panel"><div className="admin-section-title"><div><h2>课程商品</h2><p>价格以人民币分保存，避免财务精度问题。</p></div></div><Loading state={packState}/><div className="admin-card-grid">{packState.data?.items.map(pack=><article key={pack.id}><span>{pack.path_title}</span><h3>{pack.title}</h3><p>{pack.deliverable}</p><div><strong>{money(pack.price_cents)}</strong><Status value={pack.status}/></div></article>)}</div></section>{editing&&<div className="admin-modal-bg" onMouseDown={()=>setEditing(null)}><form className="admin-modal" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><button type="button" onClick={()=>setEditing(null)}><X size={20}/></button><h2>编辑学习路径</h2><label>名称<input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>介绍<textarea value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></label><div className="admin-form-row"><label>级别<input value={editing.level} onChange={e=>setEditing({...editing,level:e.target.value})}/></label><label>状态<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value})}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">归档</option></select></label></div><button className="admin-primary">保存修改</button></form></div>}</>;
}

const emptyContent={type:"document",title:"",body:"",resource_url:"",duration_seconds:0,is_preview:false,status:"draft",sort_order:0};
export function AdminContent() {
  const [packs] = useLoad(()=>api("/admin/packs")); const [packId,setPackId]=useState(""); const [steps,setSteps]=useState([]); const [stepId,setStepId]=useState(""); const [items,setItems]=useState([]); const [editing,setEditing]=useState(null); const [message,setMessage]=useState("");
  useEffect(()=>{if(!packId)return;api(`/admin/packs/${packId}/steps`).then(d=>{setSteps(d.items);setStepId(d.items[0]?.id||"");});},[packId]);
  const loadItems=()=>stepId&&api(`/admin/content?stepId=${stepId}`).then(d=>setItems(d.items)); useEffect(()=>{loadItems();},[stepId]);
  const save=async(e)=>{e.preventDefault();const body={stepId:Number(stepId),type:editing.type,title:editing.title,body:editing.body,resourceUrl:editing.resource_url||"",durationSeconds:Number(editing.duration_seconds||0),isPreview:Boolean(editing.is_preview),status:editing.status,sortOrder:Number(editing.sort_order||0)};await api(`/admin/content${editing.id?`/${editing.id}`:""}`,{method:editing.id?"PUT":"POST",body:JSON.stringify(body)});setEditing(null);setMessage("资料已保存并同步到前台");loadItems();};
  const upload=async(e)=>{const file=e.target.files[0];if(!file)return;const result=await uploadAsset(file);setEditing(cur=>({...cur,resource_url:result.url}));};
  return <><Header kicker="核心内容 CMS" title="课程资料管理" copy="按项目包 → 项目步骤 → 内容资料进行配置，前台将读取这里的发布内容。" action={<button className="admin-primary" disabled={!stepId} onClick={()=>setEditing({...emptyContent,step_id:stepId,sort_order:items.length+1})}><Plus size={16}/>新增资料</button>}/>{message&&<div className="admin-success"><Check size={16}/>{message}</div>}<section className="admin-panel admin-content-selector"><label>项目包<select value={packId} onChange={e=>setPackId(e.target.value)}><option value="">选择项目包</option>{packs.data?.items.map(p=><option key={p.id} value={p.id}>{p.path_title} / {p.title}</option>)}</select></label><label>项目步骤<select value={stepId} onChange={e=>setStepId(e.target.value)} disabled={!steps.length}><option value="">选择步骤</option>{steps.map(s=><option key={s.id} value={s.id}>{s.sort_order}. {s.title}</option>)}</select></label></section><section className="admin-panel"><div className="admin-section-title"><div><h2>当前步骤资料</h2><p>支持文档、Prompt、代码、模板、任务、清单、视频与下载附件。</p></div></div>{!stepId?<div className="admin-state"><FolderOpen size={28}/>请先选择项目包和步骤</div>:<div className="admin-content-list">{items.map(item=><button key={item.id} onClick={()=>setEditing(item)}><span className="content-kind">{({document:"文档",prompt:"Prompt",code:"代码",template:"模板",task:"任务",checklist:"清单",video:"视频",download:"下载"})[item.type]}</span><span><strong>{item.title}</strong><small>{item.is_preview?"可免费预览":"购买后解锁"}</small></span><Status value={item.status}/><ArrowRight size={16}/></button>)}{!items.length&&<div className="admin-state">该步骤还没有资料</div>}</div>}</section>{editing&&<div className="admin-modal-bg" onMouseDown={()=>setEditing(null)}><form className="admin-modal wide" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><button type="button" onClick={()=>setEditing(null)}><X size={20}/></button><h2>{editing.id?"编辑":"新增"}课程资料</h2><div className="admin-form-row"><label>内容类型<select value={editing.type} onChange={e=>setEditing({...editing,type:e.target.value})}>{["document","prompt","code","template","task","checklist","video","download"].map(t=><option key={t} value={t}>{t}</option>)}</select></label><label>发布状态<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value})}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">归档</option></select></label></div><label>标题<input required value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>正文 / Prompt / 清单<textarea rows="9" value={editing.body||""} onChange={e=>setEditing({...editing,body:e.target.value})}/></label><label>资源地址<input value={editing.resource_url||""} onChange={e=>setEditing({...editing,resource_url:e.target.value})} placeholder="上传文件后自动填写，或粘贴视频地址"/></label><label className="admin-upload">上传资料附件<input type="file" onChange={upload}/></label><label className="admin-check"><input type="checkbox" checked={Boolean(editing.is_preview)} onChange={e=>setEditing({...editing,is_preview:e.target.checked})}/>允许未购买用户免费预览</label><button className="admin-primary">保存资料</button></form></div>}</>;
}

export {AdminOrders} from "./AdminOrders.jsx";
