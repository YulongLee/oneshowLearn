import {useEffect,useState} from 'react';
import {api,money} from './api.js';
import './admin-cms.css';
import './payment-diagnostics.css';
function ConnectionTest({provider,dirty,testing,result,onTest,enabled}){
  const name=provider==='wechat'?'微信':'支付宝';
  return <section className="payment-connection" aria-label={`${name}支付连接测试`}>
    <div className="payment-connection-head"><div><strong>配置后，测试接口连接</strong><p>只读取已保存配置，不创建订单、不扣款，也不会自动开启收款。</p></div><button type="button" disabled={dirty||Boolean(testing)} onClick={onTest}>{testing===provider?'正在测试…':`测试${name}连接`}</button></div>
    {dirty?<p className="payment-connection-hint">本平台有未保存的修改，请先保存{name}配置，再测试。</p>:!enabled&&<p className="payment-connection-hint">当前渠道未开启，仍可测试连接；通过后也需另行确认是否开启。</p>}
    {result&&!dirty&&<div className={`payment-connection-result is-${result.status}`} role="status" aria-live="polite"><strong>{result.message}</strong>{result.checkedAt&&<small>配置版本 {result.version} · {new Date(result.checkedAt).toLocaleString('zh-CN')} · 耗时 {(result.durationMs/1000).toFixed(1)} 秒</small>}{result.checks?.length>0&&<ul>{result.checks.map(check=><li key={check.label}><b>{check.status==='passed'?'通过':'待处理'} · {check.label}</b><span>{check.detail}</span></li>)}</ul>}{result.limitations?.map(text=><p className="payment-connection-limit" key={text}>{text}</p>)}</div>}
  </section>;
}
export function AdminPayments(){
  const [data,setData]=useState(null),[form,setForm]=useState(null),[secrets,setSecrets]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [testing,setTesting]=useState(''),[results,setResults]=useState({});
  const [operations,setOperations]=useState(null),[operationError,setOperationError]=useState('');
  const loadOperations=async()=>{setOperationError('');try{setOperations(await api('/admin/payments/operations'));}catch(e){setOperationError(e.message);}};
  const dirty=data&&JSON.stringify(form)!==JSON.stringify(data.settings)||Object.values(secrets).some(Boolean);
  const pricingFields=['productId','priceCents','originalPriceCents','publicOrigin'];
  const secretFields=provider=>provider==='wechat'?['wechatPrivateKey','wechatApiV3Key']:['alipayPrivateKey'];
  const sectionDirty=section=>!data?false:section==='pricing'?pricingFields.some(key=>form[key]!==data.settings[key]):JSON.stringify(form[section])!==JSON.stringify(data.settings[section])||secretFields(section).some(key=>Boolean(secrets[key]));
  const saveSection=async section=>{
    if(busy||testing)return;
    setBusy(section);setError('');setMessage('');
    const settings=section==='pricing'?Object.fromEntries(pricingFields.map(key=>[key,form[key]])):form[section];
    const keys=section==='pricing'?[]:secretFields(section);
    try{
      const d=await api(`/admin/payments/${section}`,{method:'PUT',headers:{'If-Match':String(data.version)},body:JSON.stringify({settings,...(section==='pricing'?{}:{secrets:Object.fromEntries(keys.filter(key=>secrets[key]).map(key=>[key,secrets[key]]))})})});
      setData(d);
      setForm(previous=>section==='pricing'?{...previous,...Object.fromEntries(pricingFields.map(key=>[key,d.settings[key]]))}:{...previous,[section]:d.settings[section]});
      setSecrets(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>!keys.includes(key))));
      setResults({});
      setMessage(section==='pricing'?'定价与回调已保存，支付渠道配置未修改。':`${section==='wechat'?'微信':'支付宝'}配置已保存，另一平台及价格未修改。可以测试连接；通过不代表已完成支付与回调验收。`);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const saveButton=section=><button type="button" className="admin-primary" disabled={!data.encryptionReady||!sectionDirty(section)} onClick={()=>saveSection(section)}>{busy===section?'保存中…':section==='pricing'?'保存定价与回调':`保存${section==='wechat'?'微信':'支付宝'}配置`}</button>;
  const load=async()=>{setError('');setResults({});try{const d=await api('/admin/payments');setData(d);setForm(d.settings);setSecrets({});}catch(e){setError(e.message);}};
  const testConnection=async provider=>{
    if(sectionDirty(provider)||busy||testing)return;
    setTesting(provider);setResults(previous=>({...previous,[provider]:null}));
    try{const result=await api(`/admin/payments/${provider}/test`,{method:'POST',headers:{'If-Match':String(data.version)},body:'{}'});setResults(previous=>({...previous,[provider]:result}));}
    catch(e){setResults(previous=>({...previous,[provider]:{status:'failed',message:e.message}}));}
    finally{setTesting('');}
  };
  useEffect(()=>{load();loadOperations();},[]);
  useEffect(()=>{const guard=e=>{if(dirty){e.preventDefault();e.returnValue='';}},nav=e=>{if(dirty&&!window.confirm('支付配置尚未保存，确认离开？'))e.preventDefault();};window.addEventListener('beforeunload',guard);window.addEventListener('oneshowlearn:before-navigate',nav);return()=>{window.removeEventListener('beforeunload',guard);window.removeEventListener('oneshowlearn:before-navigate',nav);};},[dirty]);
  const field=(provider,key,label,area=false)=>{const change=e=>setForm(f=>({...f,[provider]:{...f[provider],[key]:e.target.value}}));return <label key={key}>{label}{area?<textarea aria-label={label} rows={4} value={form[provider][key]} onChange={change} spellCheck={false}/>:<input value={form[provider][key]} onChange={change} autoComplete="off"/>}{provider==='wechat'&&key==='publicKey'&&<span className="cms-hint">用于验证微信的回复。请粘贴商户平台「账户中心 → API 安全 → 微信支付公钥 → 管理公钥」下载的 PEM 全文；公钥 ID 与文件必须对应。不要填写商户 API 证书里的公钥。</span>}</label>;};
  const secret=(key,label)=> <label key={key}>{label} {data.secretsConfigured[key]?'（已加密保存，留空保留）':'（未配置）'}<textarea aria-label={label} rows={3} value={secrets[key]||''} onChange={e=>setSecrets(s=>({...s,[key]:e.target.value}))} autoComplete="off" spellCheck={false} placeholder="只在替换时输入；保存后不回显"/></label>;
  return <div className="cms-page admin-payments"><div className="admin-page-head"><div><span>PAYMENTS & PRICING</span><h1>支付与定价</h1><p>微信与支付宝独立保存、独立测试；真实签名通知到账后自动开通对应课程。</p></div></div>{error&&<p className="admin-error" role="alert">{error}</p>}{message&&<p className="admin-success" role="status">{message}</p>}{!form?<button onClick={load}>加载支付配置</button>:<form className="admin-panel platform-form" onSubmit={e=>e.preventDefault()}><fieldset disabled={Boolean(busy)||Boolean(testing)}>
    {!data.encryptionReady&&<p role="alert" className="admin-error">服务器尚未配置 PAYMENT_CONFIG_ENCRYPTION_KEY；请由运维设置 64 位十六进制加密主密钥并安全备份。不要在此表单或聊天中填写主密钥。</p>}
    <fieldset><legend>课程定价与回调</legend><label>购买后开通的课程商品<select value={form.productId||''} onChange={e=>setForm(f=>({...f,productId:e.target.value?Number(e.target.value):null}))}><option value="">请选择实际售卖课程，不自动绑定演示资料</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.title} · {money(p.price_cents)} · {p.status}</option>)}</select></label><div className="cms-form-row"><label>售价（人民币元）<input required type="number" min="0.01" max="100000" step="0.01" value={form.priceCents/100} onChange={e=>setForm(f=>({...f,priceCents:Math.round(Number(e.target.value)*100)}))}/></label><label>原价（人民币元）<input required type="number" min="0.01" max="100000" step="0.01" value={form.originalPriceCents/100} onChange={e=>setForm(f=>({...f,originalPriceCents:Math.round(Number(e.target.value)*100)}))}/></label></div><p className="cms-hint">售价以当前保存的配置为准。保存会同步所选商品与课程价格；已有订单保留成交时金额。完整课程的配套项目范围按服务器实际授权规则校验，学员端显示对应购买权益。</p>
    <label>网站 HTTPS 回调域名<input required type="url" value={form.publicOrigin} onChange={e=>setForm(f=>({...f,publicOrigin:e.target.value}))}/></label>
    <p className="cms-hint">回调地址随配置版本自动生成；域名需指向本服务且允许支付平台访问。扫码创建订单时自动提交通知地址，无需手工复制每个版本。课程选项为空时，请先在“课程与路径”创建实际售卖的课程商品。</p>
    <div className="cms-actions">{saveButton('pricing')}</div></fieldset>
    {['wechat','alipay'].map(provider=><fieldset key={provider}><legend>{provider==='wechat'?'微信支付 · Native 扫码':'支付宝 · 电脑网站支付'}</legend><label className="cms-checkbox"><input type="checkbox" checked={form[provider].enabled} onChange={e=>setForm(f=>({...f,[provider]:{...f[provider],enabled:e.target.checked}}))}/>开启此渠道</label><p className="cms-hint">{provider==='wechat'?'需要直连商户开通 Native 支付，并绑定 AppID；采用微信支付公钥模式。':'需要应用开通电脑网站支付并绑定签约商户；使用 alipay.trade.page.pay 跳转支付宝官方收银台，采用 RSA2 公钥模式（非证书模式）。旧当面付订单保留原查询与回调。'} 此处使用正式网关，不是沙箱；未配置时前台不可下单。</p>
      {provider==='wechat'&&<p className="cms-hint">本版本使用微信支付公钥验签。若商户仍使用平台证书模式，请先核对接入方式；共享商户号需确认其他产品兼容后再切换。旧平台证书签名的通知暂不支持，订单可通过查单核验。</p>}{field(provider,'appId','AppID')}{provider==='wechat'?<>{field(provider,'mchId','商户号 mchid')}{field(provider,'serialNo','商户 API 证书序列号')}{field(provider,'publicKeyId','微信支付公钥 ID（PUB_KEY_ID_…）')}{field(provider,'publicKey','微信支付公钥 PEM（验证微信回复）',true)}{secret('wechatPrivateKey','微信商户 API 私钥 PEM（签署请求）')}{secret('wechatApiV3Key','微信 APIv3 密钥（32 字节）')}</>:<>{field(provider,'sellerId','支付宝卖家 UID / seller_id（2088…）')}{field(provider,'publicKey','支付宝公钥（不是应用公钥）',true)}{secret('alipayPrivateKey','支付宝应用私钥')}<p className="cms-hint">支持密钥工具复制的原始文本（不带 BEGIN / END）以及完整 PEM。私钥支持 PKCS1 / PKCS8，无需自行添加标头。应用公钥上传支付宝平台，网站此处填写支付宝提供的支付宝公钥。</p></>}
      <div className="cms-actions">{saveButton(provider)}</div>
      <small>当前回调：{data.version?`${data.settings.publicOrigin}/api/payments/notify/${provider}/${data.version}`:'首次保存后生成'}</small>
      <ConnectionTest provider={provider} dirty={sectionDirty(provider)} testing={testing} result={results[provider]} onTest={()=>testConnection(provider)} enabled={data.settings[provider].enabled}/>
    </fieldset>)}
    <p className="cms-hint">私钥加密保存，不返回浏览器；留空保留旧密钥。历史配置仅用于核验未结清订单，关闭渠道不影响已付款订单接收通知。暂不包含 H5/JSAPI 同设备拉起、退款自动化或订阅扣款。</p>
    <div className="cms-actions"><button type="button" onClick={()=>{if(!dirty||window.confirm('丢弃未保存的配置并重新加载？'))load();}}>重新加载全部配置</button></div>
  </fieldset></form>}
  <section className="admin-panel payment-operations" aria-label="支付运营与异常订单"><div className="payment-connection-head"><div><h2>支付运行状态</h2><p>真实订单结果与平台错误；不把基础连接通过当作支付验收。</p></div><button type="button" onClick={loadOperations}>刷新状态</button></div>{operationError&&<p role="alert">{operationError}</p>}
    {operations&&<><div className="payment-operation-channels">{operations.channels.map(c=><article key={c.provider}><strong>{c.provider==='wechat'?'微信支付':'支付宝'}</strong><p>已核验到账 {c.paid} 笔 · 待核验 {c.pending} 笔</p>{c.latestFailure&&<p className="admin-error">最近异常：{c.latestFailure.providerCode||'历史记录未保存具体平台码'} · 配置 v{c.latestFailure.configVersion}</p>}<small>{c.paid?'已有到账记录，仍须分别验证异常恢复场景。':'暂无到账开课验收记录，不代表已可正式收款。'}</small></article>)}</div>
    <div className="payment-operation-list">{operations.items.map(o=><article key={o.id}><div><strong>{o.provider==='wechat'?'微信':'支付宝'} · {o.orderNo}</strong><span>{money(o.amountCents)} · {o.status==='paid'?'已到账':o.status==='pending'?'待核验':o.attemptState==='rejected'?'下单被拒绝':'已关闭'} · 配置 v{o.configVersion}</span></div>{o.failureMessage&&<p>{o.failureMessage}</p>}{o.providerCode&&<small>平台码：{o.providerCode}{o.traceId&&` · 请求追踪：${o.traceId}`}</small>}<small>{o.nextCheckAt?`下次自动核验：${new Date(o.nextCheckAt).toLocaleString('zh-CN')}`:o.manualReview?'需人工关注：未安排自动补查，请让订单所属用户查询恢复。':'无需自动补查'}{o.lastCheckedAt&&` · 最近核验：${new Date(o.lastCheckedAt).toLocaleString('zh-CN')}`}</small></article>)}</div>{operations.limitations.map(text=><p className="cms-hint" key={text}>{text}</p>)}</>}
  </section></div>;
}
