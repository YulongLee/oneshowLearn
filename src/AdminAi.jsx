import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import './admin-ai.css';

const features={tutor:'AI 导师对话',web:'导师联网回答',ask:'课程 / 项目答疑',summary:'课时总结',notes:'课时笔记整理',keypoints:'知识点提取',mindmap:'文本思维导图',flashcards:'复习卡片'};
const changedNames={enabled:'服务开关',baseUrl:'接口区域',model:'模型',timeout:'超时',maxTokens:'回答长度',dailyLimit:'账号限额',globalLimit:'全站限额',features:'功能开关','credential:replace':'更换密钥','credential:clear':'清除密钥','credential:environment':'恢复服务器密钥'};
const time=value=>value?new Date(`${value.replace(' ','T')}Z`).toLocaleString('zh-CN'):'—';
const errorNames={provider_auth:'模型鉴权失败',provider_quota:'服务商限流或额度不足',timeout:'回复超时',provider_response:'服务商返回错误',provider_error:'模型响应异常',network:'连接或响应异常',web_search_failed:'联网搜索或来源验证失败',web_unsupported:'模型不支持联网搜索'};
export function AdminAi() {
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[usage,setUsage]=useState(null);
  const [keyAction,setKeyAction]=useState('keep'),[apiKey,setApiKey]=useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[usageError,setUsageError]=useState(''),[offset,setOffset]=useState(0);
  const lock=useRef(false),mounted=useRef(true);
  const dirty=Boolean(data&&draft&&(JSON.stringify(data.settings)!==JSON.stringify(draft)||keyAction!=='keep'||apiKey));
  const accept=value=>{setData(value);setDraft(value.settings);setKeyAction('keep');setApiKey('');};
  const loadUsage=async(page=0)=>{try{const value=await api(`/admin/ai/usage?offset=${page}`);if(mounted.current){setUsage(value);setOffset(page);setUsageError('');}}catch(e){if(mounted.current)setUsageError(e.message);}};
  const load=async()=>{setLoading(true);setError('');try{const value=await api('/admin/ai');if(mounted.current)accept(value);await loadUsage();}catch(e){if(mounted.current)setError(e.message);}finally{if(mounted.current)setLoading(false);}};
  useEffect(()=>{mounted.current=true;load();return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const guard=e=>{if(!dirty)return;if(e.type==='beforeunload'){e.preventDefault();e.returnValue='';}else if(!window.confirm('AI 配置尚未保存，确定离开并放弃修改？'))e.preventDefault();};
    window.addEventListener('beforeunload',guard);window.addEventListener('oneshowlearn:before-navigate',guard);
    return()=>{window.removeEventListener('beforeunload',guard);window.removeEventListener('oneshowlearn:before-navigate',guard);};
  },[dirty]);
  const save=async event=>{
    event.preventDefault();if(lock.current)return;
    if(keyAction==='clear'&&!window.confirm('清除后台使用的密钥并关闭 AI？服务器环境密钥不会被删除，但不会再自动使用。'))return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{const value=await api('/admin/ai',{method:'PUT',headers:{'If-Match':String(data.version)},body:JSON.stringify({settings:draft,keyAction,...(keyAction==='replace'?{apiKey}:{})})});
      if(mounted.current){accept(value);setNotice('配置已保存，新请求立即生效；已发出的模型请求可能继续处理。');window.dispatchEvent(new Event('oneshowlearn:ai-config'));}await loadUsage();
    }catch(e){if(mounted.current)setError(e.message);}finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  const test=async()=>{
    if(lock.current||dirty)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try{const value=await api('/admin/ai/test',{method:'POST',body:JSON.stringify({version:data.version})});if(mounted.current)setNotice(`${value.message} 耗时 ${(value.durationMs/1000).toFixed(1)} 秒。`);}
    catch(e){if(mounted.current)setError(e.message);}finally{await loadUsage();lock.current=false;if(mounted.current)setBusy(false);}
  };
  const field=(key,value)=>setDraft(d=>({...d,[key]:value}));
  return <div className="admin-ai"><div className="admin-page-head"><div><span>平台 AI 服务</span><h1>AI 配置</h1><p>统一管理学习平台的模型、功能与用量。仅管理员可访问。</p></div><button disabled={busy||loading} onClick={()=>{if(!dirty||window.confirm('重新加载会放弃未保存的修改，是否继续？'))load();}}>重新加载</button></div>
    {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="admin-success" role="status">{notice}</p>}
    {loading&&<p role="status">正在读取 AI 配置…</p>}
    {data&&draft&&<><form onSubmit={save}><fieldset disabled={busy||loading}><section className="admin-panel"><div className="aic-section-head"><div><h2>模型与服务</h2><p>当前来源：{data.source} · 版本 {data.version} · 更新于 {time(data.updatedAt)}</p></div><label className="aic-check"><input type="checkbox" checked={draft.enabled} onChange={e=>field('enabled',e.target.checked)}/>启用 AI 服务</label></div>
      <div className="aic-grid"><label>服务商<input value="阿里云百炼" readOnly/><small>当前仅支持已接入的阿里云文字模型。</small></label><label>接口区域<select value={draft.baseUrl} onChange={e=>field('baseUrl',e.target.value)}><option value="https://dashscope.aliyuncs.com/compatible-mode/v1">中国内地（杭州）</option><option value="https://dashscope-intl.aliyuncs.com/compatible-mode/v1">国际（新加坡）</option></select><small>不同区域的密钥和模型权限可能不同。国际接口会把问题发送到境外。</small></label><label>模型名称<input value={draft.model} onChange={e=>field('model',e.target.value)} maxLength={100} required placeholder="例如 deepseek-v4-flash"/><small>填写百炼账号中有权限的文字模型 ID；本系统不自动开通模型。</small></label><label>密钥操作<select value={keyAction} onChange={e=>{setKeyAction(e.target.value);setApiKey('');if(e.target.value==='clear')field('enabled',false);}}><option value="keep">保留当前密钥</option><option value="replace">设置 / 更换密钥</option><option value="environment">使用服务器默认密钥</option><option value="clear">清除并停用密钥</option></select><small>状态：{data.keyMask||'未配置'} · {({environment:'服务器环境变量',custom:'后台加密保存',none:'已清除'})[data.keyMode]}</small></label></div>
      {keyAction==='replace'&&<label>新 API 密钥<input type="password" aria-label="新 API 密钥" autoComplete="new-password" value={apiKey} minLength={12} maxLength={512} required onChange={e=>setApiKey(e.target.value)}/><small>只在提交时传给本站后端，保存后不回显；不会写入调用记录。</small></label>}
      {data.keyError&&<p className="admin-error">{data.keyError}</p>}{!data.encryptionReady&&<p className="aic-hint">服务器尚未设置加密主密钥，暂不能保存新 API 密钥；保留现有服务器密钥不受影响。</p>}
      <p className="aic-hint">保存配置不代表模型连接成功。请保存后测试；测试只发送固定验证文字，不发送课程或学员笔记。已关闭的服务也可以测试，测试不会自动开启服务。</p>
    </section><section className="admin-panel"><h2>调用额度与回答长度</h2><div className="aic-grid">{[['dailyLimit','每账号 24 小时次数',1,500],['globalLimit','全站 24 小时次数',1,10000],['maxTokens','单次回答最大 Token',32,4096],['timeout','回复超时（毫秒）',5000,60000]].map(([key,label,min,max])=><label key={key}>{label}<input type="number" required min={min} max={max} step={1} value={draft[key]} onChange={e=>field(key,e.target.value===''?'':Number(e.target.value))}/><small>允许范围：{min}–{max}</small></label>)}</div><p className="aic-hint">额度以首次请求起算的 24 小时窗口限制，失败调用与连接测试也计入；降低额度不重置已使用次数。另有每账号每分钟 10 次、每账号 1 个在途请求及单服务实例 4 个并发的保护。</p></section>
    <section className="admin-panel"><h2>学员端功能开关</h2><div className="aic-features">{Object.entries(features).map(([key,label])=><label key={key} className="aic-check"><input type="checkbox" checked={draft.features[key]} onChange={e=>field('features',{...draft.features,[key]:e.target.checked})}/>{label}</label>)}</div><p className="aic-hint">联网回答复用当前密钥和模型，支持已接入的 DeepSeek V4 / V3.2 与 Qwen Plus / Max / Flash / Turbo 文字模型；其他模型暂不可用。搜索计入 AI 调用额度，百炼可能额外收取搜索费用，请核对服务商账单。总开关或导师开关关闭时联网回答也暂停。语音、图片理解尚未接入。</p></section>
    <div className="aic-actions"><button className="admin-primary" type="submit" disabled={!dirty||busy||(keyAction==='replace'&&!data.encryptionReady)}>{busy?'处理中…':'保存并生效'}</button><button type="button" disabled={busy||dirty||!data.keyConfigured||Boolean(data.keyError)} onClick={test}>测试已保存的连接</button><span>{dirty?'有未保存的修改；保存后才能测试。':'测试会产生少量真实模型用量，每分钟最多 2 次。'}</span></div></fieldset></form>
    <section className="admin-panel"><div className="aic-section-head"><div><h2>调用记录与用量</h2><p>最近 24 小时，仅统计接入记录功能后的请求。Token 是服务商返回的实际用量，不代表费用账单。</p></div><button disabled={busy} onClick={()=>loadUsage()}>刷新记录</button></div>{usageError&&<p className="admin-error" role="alert">{usageError}</p>}
      {usage&&<><div className="aic-metrics">{[[usage.stats.calls,'请求次数'],[usage.stats.succeeded,'成功'],[usage.stats.failed,'失败'],[usage.stats.inputTokens,'输入 Token'],[usage.stats.outputTokens,'输出 Token']].map(([value,label])=><article key={label}><strong>{value}</strong><small>{label}</small></article>)}</div><small>有 Token 数据的调用：{usage.stats.meteredCalls}；未返回用量的失败调用不能推算为免费。记录不包含密钥、问题或回答正文。权限和额度拦截不记为模型调用。</small>
      <div className="aic-table"><table><thead><tr><th>时间 / 账号 ID</th><th>功能 / 模型</th><th>结果</th><th>输入 / 输出 Token</th><th>耗时</th><th>错误分类</th></tr></thead><tbody>{usage.items.map(item=><tr key={item.id}><td>{time(item.created_at)}<small>账号 #{item.user_id} · 配置 v{item.config_version}</small></td><td>{features[item.action]||'连接测试'}<small>{item.model}</small></td><td>{({pending:'请求中',success:'成功',failed:'失败',interrupted:'已中断 / 结果未知'})[item.display_status]}</td><td>{item.input_tokens??'—'} / {item.output_tokens??'—'}</td><td>{item.duration_ms==null?'—':`${(item.duration_ms/1000).toFixed(1)} 秒`}</td><td>{errorNames[item.error_code]||'—'}</td></tr>)}</tbody></table></div>{!usage.items.length&&<p>暂无调用记录</p>}<div className="aic-actions"><button disabled={offset===0} onClick={()=>loadUsage(Math.max(0,offset-50))}>上一页</button><span>第 {Math.floor(offset/50)+1} 页</span><button disabled={usage.nextOffset===null} onClick={()=>loadUsage(usage.nextOffset)}>下一页</button></div>
      <h2>最近配置操作</h2><ul className="aic-audit">{usage.audits.map(item=><li key={item.id}><strong>版本 {item.version} · 管理员 #{item.actor_id}</strong><span>{item.changes.map(key=>changedNames[key]||key).join('、')||'保存配置'} · {time(item.created_at)}</span></li>)}</ul>{!usage.audits.length&&<p>还没有后台配置修改记录。</p>}</>}
    </section></>}
  </div>;
}
