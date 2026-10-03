import { useEffect, useRef, useState } from 'react';
import { DeviceMobile, WechatLogo, ArrowSquareOut, ShieldCheck } from '@phosphor-icons/react';
import { api } from './api.js';
import './external-login.css';

export function ExternalLogin({ channel, capabilities, onComplete, binding=false, hasPassword=false }) {
  const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[create,setCreate]=useState(false);
  const [challenge,setChallenge]=useState(null),[remaining,setRemaining]=useState(0),[flow,setFlow]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const alive=useRef(true),lock=useRef(false),popup=useRef(null),complete=useRef(onComplete);complete.current=onComplete;
  const enabled=channel==='phone'?capabilities?.phoneLoginEnabled:capabilities?.wechatLoginEnabled;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;popup.current?.close();};},[]);
  useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(timer);},[remaining]);
  useEffect(()=>{
    if(!flow)return;let cancelled=false,pending=false;
    const timer=setInterval(async()=>{
      if(pending)return;
      if(Date.now()>flow.expiresAt){setError('二维码已过期，请重新打开扫码窗口');setFlow(null);popup.current?.close();return;}
      pending=true;
      try {const result=await api('/auth/wechat/finish',{method:'POST',body:JSON.stringify({challengeId:flow.challengeId,pollToken:flow.pollToken})});if(cancelled)return;
        if(result.status==='complete'){setFlow(null);popup.current?.close();complete.current(result);}
      } catch(e){if(!cancelled){setFlow(null);setError(e.message);popup.current?.close();}} finally{pending=false;}
    },1800);
    return()=>{cancelled=true;clearInterval(timer);};
  },[flow]);
  const action=async(fn)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){if(alive.current){setError(e.message);if(e.cooldownSeconds)setRemaining(e.cooldownSeconds);}}finally{lock.current=false;if(alive.current)setBusy(false);}};
  const request=()=>action(async()=>{const result=await api('/auth/phone/request-code',{method:'POST',body:JSON.stringify({phone,purpose:binding?'bind':'login',...(binding?{password}:{})})});if(alive.current){setChallenge(result.challengeId);setRemaining(result.cooldownSeconds);setNotice(result.message);setCode('');setPassword('');}});
  const verify=e=>{e.preventDefault();action(async()=>{const result=await api('/auth/phone/verify',{method:'POST',body:JSON.stringify({phone,code,challengeId:challenge,allowCreate:create})});if(alive.current)complete.current(result);});};
  const wechat=()=>{
    if(lock.current||flow)return;
    popup.current=window.open('about:blank','_blank','popup,width=520,height=640');
    if(!popup.current){setError('浏览器阻止了扫码窗口，请允许弹出窗口后重试');return;}
    // Keep no opener relationship with the external authorization page.
    popup.current.opener=null;
    action(async()=>{try{const result=await api('/auth/wechat/start',{method:'POST',body:JSON.stringify({purpose:binding?'bind':'login',...(binding?{password}:{}),allowCreate:create})});if(!alive.current){popup.current?.close();return;}popup.current.location.href=result.url;setPassword('');setFlow({...result,expiresAt:Date.now()+result.expiresIn*1000});}catch(e){popup.current?.close();throw e;}});
  };
  return <div className="external-login">
    {!enabled?<div className="el-unavailable" role="status"><ShieldCheck size={25}/><strong>{!capabilities?'正在检查登录服务…':capabilities.unavailable?'暂时无法连接登录服务':`${channel==='phone'?'手机号':'微信'}登录暂未开放`}</strong><p>你仍可使用邮箱登录。服务配置完成后，这里即可使用。</p></div>:<>
      {binding&&<p className="el-hint">将新方式绑定到当前账号，已有课程和学习记录保持不变。{!hasPassword&&'请在使用原方式登录后的 10 分钟内操作。'}</p>}
      {binding&&hasPassword&&<label>验证当前账号密码<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy||Boolean(flow)} placeholder="仅用于本次安全验证"/></label>}
      {!binding&&<div className="el-hint">已有邮箱账号？请先用邮箱登录，在「设置中心 → 登录方式」绑定，继续使用原有课程与笔记。</div>}
      {channel==='phone'?<form onSubmit={verify}>
        <label>手机号<div className="el-phone"><span>+86</span><input type="tel" inputMode="tel" autoComplete="tel-national" maxLength={11} pattern="1[3-9][0-9]{9}" required value={phone} onChange={e=>{setPhone(e.target.value.replace(/\D/g,''));setChallenge(null);setCode('');}} placeholder="输入中国大陆手机号" disabled={busy}/></div></label>
        <label>验证码<div className="el-code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="6 位验证码" disabled={busy}/><button type="button" onClick={request} disabled={busy||remaining>0||!/^1[3-9]\d{9}$/.test(phone)||(binding&&hasPassword&&!password)}>{remaining?`${remaining}s 后重发`:'获取验证码'}</button></div></label>
        {!binding&&capabilities.externalRegistrationEnabled&&<label className="el-consent"><input type="checkbox" checked={create} onChange={e=>setCreate(e.target.checked)}/><span>我是新用户，未绑定时创建独立学习账号</span></label>}
        <button className="auth-submit" disabled={busy||!challenge}>{busy?'正在验证…':binding?'验证并绑定手机号':'验证码登录'}<DeviceMobile size={19}/></button>
      </form>:<div className="el-wechat"><WechatLogo size={48} weight="duotone"/><h3>微信扫码，便捷登录</h3><p>在微信官方窗口扫码并确认授权，完成后会自动回到此账号。</p>
        {!binding&&capabilities.externalRegistrationEnabled&&<label className="el-consent"><input type="checkbox" checked={create} onChange={e=>setCreate(e.target.checked)} disabled={Boolean(flow)}/>我是新用户，未绑定时创建独立学习账号</label>}
        <button className="auth-submit" onClick={wechat} disabled={busy||Boolean(flow)||(binding&&hasPassword&&!password)}>{busy?'正在准备…':flow?'等待扫码确认…':binding?'打开微信扫码绑定':'打开微信扫码窗口'}<ArrowSquareOut size={18}/></button>
        {flow&&<button className="el-cancel" onClick={()=>{setFlow(null);popup.current?.close();}}>取消本次扫码</button>}
      </div>}
    </>}
    {notice&&<p className="auth-notice" role="status">{notice}</p>}{error&&<p className="auth-error" role="alert">{error}</p>}
  </div>;
}

export function LoginBindings({compact=false}) {
  const [data,setData]=useState(null),[capabilities,setCapabilities]=useState(null),[channel,setChannel]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const load=()=>Promise.all([api('/auth/identities'),api('/auth/status')]).then(([d,c])=>{setData(d);setCapabilities(c);}).catch(e=>setError(e.message));
  useEffect(()=>{load();},[]);
  return <section className={`login-bindings ${compact?'is-compact':''}`}>{!compact&&<header><h2>登录方式</h2><p>绑定后可用不同方式登录同一个账号，课程、笔记和订单不会分开。</p></header>}{error&&<p className="auth-error" role="alert">{error}<button onClick={load}>重试</button></p>}{message&&<p role="status" className="auth-notice">{message}</p>}
    {data&&<><div className="lb-row"><DeviceMobile size={24}/><div><strong>手机号</strong><small>{data.phone||'尚未绑定'}</small></div><button disabled={Boolean(data.phone)} onClick={()=>{setChannel(channel==='phone'?'':'phone');setMessage('');}}>{data.phone?'已绑定':channel==='phone'?'收起':'绑定手机号'}</button></div>
    {channel&&<ExternalLogin key={channel} channel={channel} capabilities={capabilities} binding hasPassword={data.hasPassword} onComplete={()=>{setChannel('');setMessage('绑定成功，以后可以用此方式登录当前账号');load();}}/>}
    <p className="el-hint">为保护课程权益，已绑定的登录方式不会自动覆盖或合并。需要更换时请联系管理员核实账号。</p></>}
  </section>;
}
