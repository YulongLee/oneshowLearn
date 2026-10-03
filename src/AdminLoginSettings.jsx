import { useEffect, useState } from 'react';
import { DeviceMobile, EnvelopeSimple, ShieldCheck } from '@phosphor-icons/react';
import { api } from './api.js';
import './admin-login-settings.css';

export function AdminLoginSettings({ navigate }) {
  const [saved,setSaved]=useState(null),[settings,setSettings]=useState(null),[secrets,setSecrets]=useState({}),[clear,setClear]=useState({});
  const [email,setEmail]=useState(null),[emailError,setEmailError]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const dirty=Boolean(saved&&(JSON.stringify(saved.settings)!==JSON.stringify(settings)||Object.values(secrets).some(Boolean)||Object.values(clear).some(Boolean)));
  const install=data=>{setSaved(data);setSettings(data.settings);setSecrets({});setClear({});};
  const load=async()=>{setBusy(true);setError('');try{install(await api('/admin/login-settings'));}catch(e){setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{load();api('/admin/email').then(setEmail).catch(()=>setEmailError('邮件服务状态暂时无法读取，请到邮件服务页重试。'));},[]);
  useEffect(()=>{const prevent=e=>{if(dirty||busy){e.preventDefault();if(e.type==='beforeunload')e.returnValue='';else setError('登录配置尚未保存，请先保存或撤销修改。');}};window.addEventListener('beforeunload',prevent);window.addEventListener('oneshowlearn:before-navigate',prevent);return()=>{window.removeEventListener('beforeunload',prevent);window.removeEventListener('oneshowlearn:before-navigate',prevent);};},[dirty,busy]);
  const field=(section,key,value)=>setSettings(s=>({...s,[section]:{...s[section],[key]:value}}));
  const save=async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{
    const patch=Object.fromEntries(Object.entries(secrets).filter(([,v])=>Boolean(v)));for(const [k,v]of Object.entries(clear))if(v)patch[k]='';
    install(await api('/admin/login-settings',{method:'PUT',headers:{'If-Match':String(saved.version)},body:JSON.stringify({settings,secrets:patch})}));
    setNotice('配置已保存。请使用自己的手机号验证实际收码与登录；保存配置不代表短信已送达。');
  }catch(e){setError(e.message);}finally{setBusy(false);}};
  const secret=(key,label)=><div key={key}><label>{label}<input type="password" autoComplete="new-password" value={secrets[key]||''} disabled={busy||Boolean(clear[key])} placeholder={saved.secretsConfigured[key]?'已配置，留空保留原密钥':'尚未配置'} onChange={e=>setSecrets(s=>({...s,[key]:e.target.value}))}/></label>{saved.secretsConfigured[key]&&<label className="als-clear"><input type="checkbox" checked={Boolean(clear[key])} onChange={e=>setClear(c=>({...c,[key]:e.target.checked}))}/>清除此项（请先关闭对应登录方式）</label>}</div>;
  return <div className="admin-login-settings"><div className="admin-page-head"><div><span>账号与登录</span><h1>登录方式配置</h1><p>管理手机号验证码登录，查看邮箱登录服务状态。</p></div></div>
    {error&&<p className="admin-error" role="alert">{error}{!saved&&<button onClick={load}>重新加载</button>}</p>}{notice&&<p className="admin-success" role="status">{notice}</p>}
    {!settings?<div className="admin-state">{busy?'正在加载配置…':'暂未加载配置'}</div>:<form onSubmit={save}>
      <div className="als-security"><ShieldCheck size={23}/><div><strong>密钥仅在服务端加密保存，不返回浏览器</strong><p>短信 AccessKey 不同于 AI 模型 API Key。已有邮箱账号可在设置中心绑定手机号，沿用原账号的课程与笔记。{!saved.encryptionReady&&'服务器尚未配置 AUTH_CONFIG_ENCRYPTION_KEY，暂不能保存密钥。'}</p></div></div>
      <fieldset disabled={busy}><div className="als-columns"><section className="admin-panel"><header><DeviceMobile size={27}/><div><h2>手机号验证码</h2><p>阿里云短信 · 中国大陆 +86 手机号</p></div></header>
        <label className="als-switch"><input type="checkbox" checked={settings.sms.enabled} onChange={e=>field('sms','enabled',e.target.checked)}/>启用手机号登录</label>
        <label>短信签名<input value={settings.sms.signName} maxLength={120} onChange={e=>field('sms','signName',e.target.value)} placeholder="阿里云审核通过的签名"/></label>
        <label>验证码模板编号<input value={settings.sms.templateCode} maxLength={120} onChange={e=>field('sms','templateCode',e.target.value)} placeholder="SMS_123456789"/></label>
        <p className="als-help">模板变量为 {'${code}'}。验证码 5 分钟有效，短信模板中也请写明 5 分钟。请在阿里云开通短信服务、完成资质及签名模板审核。</p>
        {secret('smsAccessKeyId','AccessKey ID')}{secret('smsAccessKeySecret','AccessKey Secret')}
        <label>全站 24 小时发送上限<input type="number" min={1} max={10000} value={settings.sms.dailyLimit} onChange={e=>field('sms','dailyLimit',Number(e.target.value))}/></label><p className="als-help">默认 100 次，包含失败与超时尝试。另有手机号、IP 频率限制。请同时在阿里云控制台配置费用预警与防刷限额。</p>
      </section><section className="admin-panel"><header><EnvelopeSimple size={27}/><div><h2>邮箱登录</h2><p>邮箱与密码 · 验证注册 · 找回密码</p></div></header>
        <p>已有用户继续使用原邮箱和密码登录，无需重新注册。</p>
        {emailError?<p role="alert">{emailError}</p>:!email?<p role="status">正在读取邮件服务状态…</p>:<>
          <p className="als-help">邮件通道：{email.mode==='development'?'本地模拟（不会真实发信）':email.configured?'已配置真实邮件服务':'尚未配置真实邮件服务'}</p>
          <p className="als-help">邮箱验证注册：{email.registrationEnabled?'已开放':'未开放'} · 找回密码：{email.available?'可用':'未开放'}</p>
          <p className="als-help">当前发件人：{email.sender||'尚未配置'}</p>
        </>}
        <p className="als-help">发信凭据由服务器管理，不与短信密钥混用。可在邮件服务页检查连接、向当前管理员发送测试邮件并查看发送记录。</p>
        <button type="button" onClick={()=>navigate('/admin/email')}>查看邮件服务</button>
      </section></div></fieldset>
      <footer><span>{dirty?'有未保存的配置':'当前配置已同步'} · 版本 {saved.version}</span><button type="button" disabled={busy||!dirty} onClick={()=>{install(saved);setError('');}}>撤销修改</button><button type="button" disabled={busy||dirty} onClick={load}>重新载入</button><button className="admin-primary" disabled={busy||!dirty||!saved.encryptionReady}>{busy?'正在保存…':'保存登录配置'}</button></footer>
    </form>}
  </div>;
}
