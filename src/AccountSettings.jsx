import { useEffect, useRef, useState } from 'react';
import { UserCircle, ShieldCheck, SlidersHorizontal, UploadSimple, CheckCircle, SignOut, LockSimple, Receipt, EnvelopeSimple, ArrowRight, Lifebuoy } from '@phosphor-icons/react';
import { api, setToken } from './api.js';
import { Gate, Modal } from './PersonalShared.jsx';
// PersonalShared's dialog styles are loaded by the personal-workspace route in
// normal navigation. Settings is a separate lazy route, so load the shared
// dialog foundation here as well instead of falling back to browser defaults.
import './personal-workspace.css';
import { PLAYBACK_RATES, playbackRate } from './player-model.js';
import './account-settings.css';
import { LoginBindings } from './ExternalLogin.jsx';
import {AccountOrders} from './AccountOrders.jsx';
import {accountSection,accountMenuRequest,profileNameError,profileSaveLabel} from './account-center-model.js';

export function AccountSettings({ model, navigate, notify }) {
  return <div className="account-settings"><header className="as-heading"><h1>设置中心</h1><p>管理个人资料、账号安全与订单。</p></header><Gate model={model} navigate={navigate}><Settings key={model.user?.id} model={model} navigate={navigate} notify={notify}/></Gate></div>;
}
function Settings({ model, navigate, notify }) {
  const [tab,setTab]=useState(()=>accountMenuRequest(window.location.search).section),[saved,setSaved]=useState(null),[draft,setDraft]=useState(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[conflict,setConflict]=useState(false),[logoutConfirm,setLogoutConfirm]=useState(()=>accountMenuRequest(window.location.search).logout),[reloadConfirm,setReloadConfirm]=useState(false);
  const [password,setPassword]=useState({currentPassword:'',newPassword:'',confirm:''});
  const [nameError,setNameError]=useState(''),[profileFailed,setProfileFailed]=useState(false),[profileSaved,setProfileSaved]=useState(false);
  const [rate,setRate]=useState(()=>{try{return playbackRate(localStorage.getItem('osl-playback-rate'));}catch{return 1;}});
  const bypass=useRef(false),working=useRef(false),alive=useRef(true),fileInput=useRef(null);
  const dirty=Boolean(saved&&draft&&['name','bio','avatar'].some(key=>saved[key]!==draft[key]));
  const passwordDirty=Object.values(password).some(Boolean);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const load=async()=>{setLoading(true);setError('');try{const profile=await api('/auth/profile');if(alive.current){setSaved(profile);setDraft(profile);setConflict(false);setNameError('');setProfileFailed(false);setProfileSaved(false);}}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setLoading(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{
    const prevent=e=>{if(bypass.current)return;if(working.current||dirty||passwordDirty){e.preventDefault();setTab(dirty?'profile':'security');setError(working.current?'正在保存，请稍候再切换页面。':'你有尚未保存的修改。请先保存或撤销修改，再切换页面。');}};
    const unload=e=>{if(!bypass.current&&(dirty||passwordDirty||working.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('oneshowlearn:before-navigate',prevent);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('oneshowlearn:before-navigate',prevent);window.removeEventListener('beforeunload',unload);};
  },[dirty,passwordDirty]);
  // Keep section editors mounted; switching categories never discards drafts.
  const chooseSection=id=>{if(working.current)return;setTab(accountSection(id));if(!conflict)setError('');};
  useEffect(()=>{
    const request=e=>{if(e.detail?.userId!==model.user.id||working.current)return;chooseSection(e.detail.section);if(e.detail.logout==='current')setLogoutConfirm('current');};
    window.addEventListener('oneshowlearn:account-section',request);
    return()=>window.removeEventListener('oneshowlearn:account-section',request);
  },[model.user.id,conflict]);
  const editProfile=patch=>{setDraft(value=>({...value,...patch}));setProfileFailed(false);setProfileSaved(false);if('name' in patch)setNameError('');};
  const save=async(e)=>{e.preventDefault();if(working.current||!dirty||conflict)return;const invalid=profileNameError(draft.name);setNameError(invalid);if(invalid){document.getElementById('account-name')?.focus();return;}working.current=true;setBusy(true);setError('');setProfileFailed(false);try{
    const result=await api('/auth/profile',{method:'PUT',headers:{'If-Match':saved.version},body:JSON.stringify({name:draft.name,bio:draft.bio,avatar:draft.avatar})});
    if(!alive.current)return;setSaved(result);setDraft(result);setConflict(false);setProfileSaved(true);notify('个人资料已保存');await model.refresh({preserve:true}).catch(()=>notify('资料已保存，账号菜单暂未同步，请稍后刷新'));
  }catch(e){if(alive.current){setError(e.message);setConflict(e.status===409);setProfileFailed(e.status!==409);}}finally{working.current=false;if(alive.current)setBusy(false);}};
  const upload=async(e)=>{const file=e.target.files?.[0];e.target.value='';if(!file||working.current)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('请选择 5 MB 以内的 JPG、PNG 或 WebP 图片');return;}
    setBusy(true);working.current=true;setError('');const url=URL.createObjectURL(file);
    try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');const side=Math.min(image.width,image.height);context.fillStyle='#fff';context.fillRect(0,0,256,256);context.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);const avatar=canvas.toDataURL('image/jpeg',0.88);if(alive.current)editProfile({avatar});}
    catch{if(alive.current)setError('无法读取这张图片，请选择其他图片');}finally{URL.revokeObjectURL(url);working.current=false;if(alive.current)setBusy(false);}
  };
  const changePassword=async(e)=>{e.preventDefault();if(working.current)return;setError('');
    if(dirty){setTab('profile');setError('请先保存或撤销个人资料修改，再更新密码。');return;}
    if(password.newPassword!==password.confirm){setError('两次输入的新密码不一致');return;}
    if(new TextEncoder().encode(password.newPassword).length>72){setError('新密码不能超过 72 个 UTF-8 字节');return;}
    working.current=true;setBusy(true);try{await api('/auth/password/change',{method:'POST',body:JSON.stringify(password)});bypass.current=true;setToken('');notify('密码已更新，请重新登录');navigate('/login');}catch(e){setError(e.message);}finally{working.current=false;if(alive.current)setBusy(false);}
  };
  const logout=async()=>{if(working.current)return;working.current=true;setBusy(true);setError('');try{if(logoutConfirm==='all')await api('/auth/logout',{method:'POST'});bypass.current=true;setToken('');navigate('/login');}catch(e){setLogoutConfirm('');setError(e.message);}finally{working.current=false;if(alive.current)setBusy(false);}};
  const preference=next=>{try{localStorage.setItem('osl-playback-rate',String(next));setRate(next);notify('播放速度已保存到当前浏览器');}catch{setError('浏览器未允许保存偏好，请检查存储权限');}};
  return <div className="as-layout">
    <nav className="as-navigation" aria-label="设置分类">{[['profile','个人资料',UserCircle],['security','登录与安全',ShieldCheck],['preferences','学习偏好',SlidersHorizontal],['orders','我的订单',Receipt]].map(([id,label,Icon])=><button key={id} aria-current={tab===id?'page':undefined} aria-controls={`account-${id}`} disabled={busy} onClick={()=>chooseSection(id)}><Icon size={20}/>{label}{((id==='profile'&&dirty)||(id==='security'&&passwordDirty))&&<span className="as-draft-dot" aria-label="有未保存修改"/>}</button>)}</nav>
    {((dirty&&tab!=='profile')||(passwordDirty&&tab!=='security'))&&<div className="as-draft-notice" role="status"><span>你的未保存输入已保留，离开设置前请先处理。</span><button onClick={()=>chooseSection(dirty?'profile':'security')}>返回编辑<ArrowRight size={15}/></button></div>}
    <div className="as-panel">
      {error&&<div className="as-error" role="alert">{error}{conflict&&<button onClick={()=>setReloadConfirm(true)}>重新载入资料</button>}{!saved&&!loading&&<button onClick={load}>重新加载</button>}</div>}
      <section id="account-profile" aria-label="个人资料" hidden={tab!=='profile'}>
        <header className="as-panel-heading"><div><h2>个人资料</h2><p>设置你的头像与昵称，让学习空间更有辨识度。</p></div></header>
        {loading?<p className="as-loading" role="status">正在读取个人资料…</p>:draft&&<form onSubmit={save} noValidate><fieldset disabled={busy}>
          <div className="as-avatar-row"><div className="as-avatar">{draft.avatar?<img src={draft.avatar} alt="头像预览"/>:saved.name.slice(0,1)}</div><div className="as-avatar-copy"><h3>{saved.name}</h3><p>学习账号</p><small>JPG、PNG 或 WebP · 最大 5 MB · 居中裁剪</small>{saved.avatar!==draft.avatar&&<small className="as-avatar-pending">头像修改将在保存后生效</small>}</div><div className="as-avatar-actions"><button type="button" onClick={()=>fileInput.current.click()}><UploadSimple size={17}/>更换头像</button>{draft.avatar&&<button type="button" onClick={()=>editProfile({avatar:''})}>移除</button>}</div><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="选择头像" onChange={upload}/></div>
          <div className="as-form-row"><label htmlFor="account-name">昵称</label><div><input id="account-name" required minLength={2} maxLength={80} aria-invalid={Boolean(nameError)} aria-describedby={nameError?'account-name-help account-name-error':'account-name-help'} value={draft.name} onChange={e=>editProfile({name:e.target.value})}/><small id="account-name-help">2–80 个字，显示在学习空间和账号菜单。</small>{nameError&&<small id="account-name-error" className="as-field-error" role="alert">{nameError}</small>}</div></div>
          <div className="as-form-row"><label htmlFor="account-bio">个人简介</label><div><textarea id="account-bio" rows={3} maxLength={300} aria-describedby="account-bio-count" placeholder="一句话介绍自己，或写下你的下一个产品想法…" value={draft.bio} onChange={e=>editProfile({bio:e.target.value})}/><small id="account-bio-count" className="as-counter">{draft.bio.length} / 300</small></div></div>
          <div className="as-profile-note"><EnvelopeSimple size={18}/><span>邮箱与手机号在「登录与安全」中管理。</span><button type="button" onClick={()=>chooseSection('security')}>查看<ArrowRight size={14}/></button></div>
        </fieldset><footer className="as-save-footer"><span role="status">{!busy&&!conflict&&!dirty&&!profileFailed&&<CheckCircle size={17}/>} {profileSaveLabel({busy,conflict,dirty,failed:profileFailed,saved:profileSaved})}</span><button type="button" disabled={busy||!dirty} onClick={()=>{setDraft(saved);setError('');setConflict(false);setNameError('');setProfileFailed(false);setProfileSaved(false);}}>撤销修改</button><button className="as-primary" disabled={busy||!dirty||conflict}>{busy?'正在处理…':'保存修改'}</button></footer></form>}
      </section>
      <section id="account-security" aria-label="登录与安全" hidden={tab!=='security'}>
        <header className="as-panel-heading"><div><h2>登录与安全</h2><p>登录方式属于同一个账号，课程与学习记录不会分开。</p></div><span className="as-muted-badge"><ShieldCheck size={15}/>账号保护</span></header>
        {loading?<p className="as-loading" role="status">正在读取账号信息…</p>:saved&&<><div className="as-login-email"><EnvelopeSimple size={23}/><div><h3>邮箱登录</h3><p>{saved.email||'尚未绑定邮箱'}</p></div><span className={`as-status ${saved.emailVerified?'as-status-success':'as-status-quiet'}`}>{saved.emailVerified?'已验证':saved.email?'未验证':'未绑定'}</span></div><p className="as-login-note">{saved.email?'邮箱账号可通过登录页找回密码。':'当前账号使用手机号验证码登录，暂不支持自助绑定邮箱。'}</p><LoginBindings compact/>
          <div className="as-security-block"><h3>登录密码</h3><p>{saved.hasPassword?'修改后，所有设备都需要重新登录。':'手机号验证码账号无需设置邮箱密码。'}</p>{saved.hasPassword&&<form onSubmit={changePassword}><fieldset disabled={busy}><div className="as-password-fields">{[['currentPassword','当前密码'],['newPassword','新密码'],['confirm','确认新密码']].map(([key,label])=><label key={key}>{label}<input type="password" required autoComplete={key==='currentPassword'?'current-password':'new-password'} minLength={key==='currentPassword'?1:10} maxLength={key==='currentPassword'?128:72} value={password[key]} onChange={e=>setPassword({...password,[key]:e.target.value})}/></label>)}</div><small>新密码至少 10 个字符，最多 72 个 UTF-8 字节。</small></fieldset><footer><button type="button" disabled={busy||!passwordDirty} onClick={()=>{setPassword({currentPassword:'',newPassword:'',confirm:''});setError('');}}>清空输入</button><button className="as-primary" disabled={busy||!passwordDirty}>{busy?'处理中…':'更新密码并重新登录'}</button></footer></form>}</div>
        </>}
        <div className="as-session"><div><h3>退出登录</h3><p>不影响已购课程和已保存的学习记录。</p></div><div className="as-session-actions"><button disabled={busy} onClick={()=>setLogoutConfirm('current')}><SignOut size={17}/>退出当前浏览器</button><button className="as-danger" disabled={busy} onClick={()=>setLogoutConfirm('all')}>退出所有设备</button></div></div>
      </section>
      <section id="account-preferences" aria-label="学习偏好" hidden={tab!=='preferences'}>
        <header className="as-panel-heading"><div><h2>学习偏好</h2><p>以你的节奏学习，用熟悉的方式浏览。</p></div><span className="as-muted-badge">仅当前浏览器</span></header>
        <div className="as-preference"><div><h3>默认播放速度</h3><p>下次打开课程或实战项目时生效。</p></div><select aria-label="默认播放速度" value={rate} onChange={e=>preference(playbackRate(e.target.value))}>{PLAYBACK_RATES.map(value=><option key={value} value={value}>{value}×{value===1?'（正常）':''}</option>)}</select></div>
        <div className="as-preference"><div><h3>桌面侧栏</h3><p>手机使用独立抽屉导航，不受此设置影响。</p></div><select aria-label="桌面侧栏显示方式" value={model.sidebar.mode} onChange={e=>model.sidebar.setMode(e.target.value)}><option value="expanded">完整菜单</option><option value="icons">仅显示图标</option><option value="hidden">隐藏侧栏</option></select></div>
        <div className="as-preference"><div><h3>展开宽度</h3><p>也可以拖动侧栏边缘调整。</p></div><label className="as-width"><input aria-label="侧栏展开宽度" type="range" min={228} max={360} step={1} value={model.sidebar.width} onChange={e=>model.sidebar.resize(Number(e.target.value))}/><output>{model.sidebar.width} px</output></label></div>
        <footer><span>偏好即时保存，仅在当前浏览器生效。</span><button onClick={()=>{model.sidebar.setMode('expanded');model.sidebar.resize(228);preference(1);}}>恢复默认偏好</button></footer>
      </section>
      <section id="account-orders" aria-label="我的订单" hidden={tab!=='orders'}>{tab==='orders'&&<AccountOrders navigate={navigate}/>}</section>
    </div>
    <div className="as-help"><Lifebuoy size={21}/><span>账号或购买遇到问题？</span><button disabled={busy} onClick={()=>navigate('/support')}>帮助与售后<ArrowRight size={16}/></button></div>
    <p className="as-bottom-note"><LockSimple size={14}/>个人资料修改不会影响已购课程与学习记录。</p>
    {reloadConfirm&&<Modal title="重新载入最新资料？" close={()=>setReloadConfirm(false)}><div className="ps-modal-body"><p>当前未保存的表单修改会被替换，已保存的账号资料不受影响。</p><div className="ps-form-actions"><button onClick={()=>setReloadConfirm(false)}>继续编辑</button><button onClick={()=>{setReloadConfirm(false);load();}}>重新载入</button></div></div></Modal>}
    {logoutConfirm&&<Modal className="as-logout-modal" title={logoutConfirm==='all'?'退出所有设备？':'退出当前浏览器？'} close={()=>!busy&&setLogoutConfirm('')}><div className="ps-modal-body"><p>{logoutConfirm==='all'?'所有设备将需要重新登录。':'只清除当前浏览器的登录状态，不退出其他设备。'}未保存的输入会被清空，已保存的资料和课程权益不受影响。</p><div className="ps-form-actions"><button className="ps-outline" disabled={busy} onClick={()=>setLogoutConfirm('')}>取消</button><button className="as-danger" disabled={busy} onClick={logout}>{busy?'正在退出…':logoutConfirm==='all'?'确认退出所有设备':'确认退出当前浏览器'}</button></div></div></Modal>}
  </div>;
}
