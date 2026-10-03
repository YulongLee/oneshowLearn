import {BrandIdentity} from './BrandIdentity.jsx';
import {ServiceLinks} from './ServiceCenter.jsx';
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, EnvelopeSimple, DeviceMobile, LockKey, Eye, EyeSlash, X } from "@phosphor-icons/react";
import { api, getToken, setToken } from "./api.js";
import { canManage, completeLogin, getPlatform } from "./platforms.js";
import { ExternalLogin } from './ExternalLogin.jsx';
import { AuthShowcase } from './AuthShowcase.jsx';

export function UserAuthCard({ navigate, onSuccess, onClose, initialMode = "login", platform = "user", onPlatformSwitch, presentation = "default" }) {
  const isAdmin = platform === "admin";
  const platformInfo = getPlatform(platform);
  const [mode, setMode] = useState(initialMode);
  const [channel,setChannel] = useState('email');
  const [showPassword,setShowPassword] = useState(false);
  const polished = presentation === 'commercial' && !isAdmin;
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", code: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [capabilities, setCapabilities] = useState(null);
  useEffect(() => { setMode(initialMode); setError(""); setNotice(""); setShowPassword(false); }, [initialMode]);
  useEffect(() => { let active = true; api("/auth/status").then((data) => active && setCapabilities(data)).catch(() => active && setCapabilities({ unavailable: true })); return () => { active = false; }; }, []);
  useEffect(() => { if (!countdown) return; const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [countdown]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const switchMode = (next) => { setMode(next); setError(""); setNotice(""); setShowPassword(false); update("code", ""); };
  const complete = (result) => completeLogin(result, { platform, saveToken: setToken, onSuccess, navigate });
  const requestCode = async (reset = false) => {
    const data = await api(reset ? "/auth/password/request-code" : "/auth/register/request-code", {
      method: "POST", body: JSON.stringify(reset ? { email: form.email } : { name: form.name, email: form.email, password: form.password }),
    });
    setMode(reset ? "reset" : "verify"); update("code", "");
    setCountdown(data.cooldownSeconds || 60); setNotice(data.message);
    if (reset) setForm((current) => ({ ...current, password: "", confirm: "" }));
  };
  const handleError = (e) => { setError(e.message); if (e.cooldownSeconds) setCountdown(e.cooldownSeconds); };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    if (["register", "reset"].includes(mode)) {
      if (form.password !== form.confirm) return setError("两次输入的密码不一致");
      if (new TextEncoder().encode(form.password).length > 72) return setError("密码不能超过 72 字节（中文字符占多个字节）");
    }
    setBusy(true);
    try {
      if (mode === "login") complete(await api("/auth/login", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password }) }));
      else if (mode === "register") await requestCode();
      else if (mode === "verify") complete(await api("/auth/register/verify", { method: "POST", body: JSON.stringify({ email: form.email, code: form.code }) }));
      else if (mode === "forgot") await requestCode(true);
      else {
        await api("/auth/password/reset", { method: "POST", body: JSON.stringify({ email: form.email, code: form.code, newPassword: form.password }) });
        setToken(""); setForm((current) => ({ ...current, password: "", confirm: "", code: "" }));
        setMode("login"); setNotice("密码已更新，所有设备已退出。请使用新密码登录。");
      }
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (countdown || busy) return;
    setBusy(true); setError("");
    try { await requestCode(mode === "reset"); } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const codeMode = mode === "verify" || mode === "reset";
  const signupUnavailable = !capabilities?.registrationEnabled;
  const resetUnavailable = !capabilities?.passwordResetEnabled;
  const blocked = ["register", "verify"].includes(mode) ? signupUnavailable : ["forgot", "reset"].includes(mode) ? resetUnavailable : false;
  const heading = ({ login: isAdmin ? "登录管理平台" : "登录用户平台", register: "创建学习账号", forgot: "找回登录密码", reset: "设置新密码", verify: "输入邮箱验证码" })[mode];
  const copy = mode === "login" ? (isAdmin ? "管理课程资料、用户与订单。仅管理员及内容编辑可进入。" : "继续你的课程、项目与学习进度。管理员也可在这里学习。") : mode === "register" ? "先验证你的邮箱，购买记录和学习成果会保存在账号中。" : mode === "forgot" ? "输入注册邮箱，通过验证码重置密码。" : `请查看 ${form.email} 的收件箱及垃圾邮件，验证码 10 分钟内有效。`;
  const buttonText = busy ? "请稍候…" : ({ login: `进入${platformInfo.label}`, register: "发送注册验证码", forgot: "发送重置验证码", reset: "确认重置密码", verify: "验证并完成注册" })[mode];
  return <section className={`user-auth-card ${polished?'auth-polished-card':''}`}>
    {onClose && <button className="auth-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>}
    <div className="auth-brand"><BrandIdentity/></div>{!polished&&<div className="auth-platform-label">{platformInfo.label}</div>}<h1>{heading}</h1><p>{mode==='login'&&!isAdmin?'继续你的 AI 学习与产品创作之旅。':copy}</p>
    {mode==='login'&&!isAdmin&&<div className="auth-methods" aria-label="选择登录方式">{[['email','邮箱登录'],['phone','手机验证码登录']].map(([id,label])=><button key={id} type="button" aria-pressed={channel===id} disabled={busy} onClick={()=>{setChannel(id);setShowPassword(false);setError('');setNotice('');}}>{polished&&(id==='email'?<EnvelopeSimple size={20}/>:<DeviceMobile size={20}/>)}{label}</button>)}</div>}
    {mode==='login'&&!isAdmin&&channel!=='email'?<ExternalLogin key={channel} channel={channel} capabilities={capabilities} onComplete={complete}/>:<>
    {blocked && <p className="auth-error" role="status">{!capabilities ? "正在检查邮件服务…" : capabilities.unavailable ? "暂时无法连接账号服务，请刷新重试。" : "邮箱服务暂未开放，请稍后再试或联系管理员。"}</p>}
    {capabilities?.deliveryMode === "development" && <p className="auth-notice">本地开发模式：验证码只写入本地测试发件箱，不会发送真实邮件。</p>}
    <form onSubmit={submit}>
      {mode === "register" && <label>你的称呼<input required minLength="2" maxLength="80" autoComplete="nickname" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例如：Yulong" /></label>}
      {!codeMode && <label>邮箱{polished?<div className="auth-input-wrap"><EnvelopeSimple size={21}/><input required type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(e) => update("email", e.target.value.trim())} placeholder="请输入你的邮箱" /></div>:<input required type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(e) => update("email", e.target.value.trim())} placeholder="name@example.com" />}</label>}
      {["login", "register", "reset"].includes(mode) && <label>{mode === "reset" ? "新密码" : "密码"}{polished?<div className="auth-input-wrap"><LockKey size={21}/><input aria-label={mode === "reset" ? "新密码" : "密码"} required type={showPassword?'text':'password'} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 10} maxLength={mode === "login" ? 128 : 72} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder={mode === "login" ? "请输入密码" : "至少 10 位，最多 72 字节"} /><button type="button" className="auth-password-toggle" aria-label={showPassword?'隐藏密码':'显示密码'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<Eye size={21}/>:<EyeSlash size={21}/>}</button></div>:<input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 10} maxLength={mode === "login" ? 128 : 72} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder={mode === "login" ? "输入登录密码" : "至少 10 位，最多 72 字节"} />}</label>}
      {["register", "reset"].includes(mode) && <label>确认密码<input required type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} placeholder="再次输入密码" /></label>}
      {codeMode && <label className="verification-label">6 位验证码<div><EnvelopeSimple size={20} /><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" autoFocus value={form.code} onChange={(e) => update("code", e.target.value.replace(/\D/g, ""))} placeholder="000000" /></div></label>}
      {notice && <div className="auth-notice" role="status">{notice}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {mode === "login" && <button type="button" className="forgot-link" onClick={() => switchMode("forgot")}>忘记密码？</button>}
      <button className="auth-submit" disabled={busy || blocked || (["register", "forgot"].includes(mode) && countdown > 0)}>{["register", "forgot"].includes(mode) && countdown ? `${countdown} 秒后可发送` : buttonText}<ArrowRight size={17} /></button>
    </form>
    {codeMode ? <div className="auth-foot"><button disabled={busy} onClick={() => switchMode(mode === "reset" ? "forgot" : "register")}><ArrowLeft size={14} />修改邮箱</button><button disabled={Boolean(countdown) || busy || blocked} onClick={resend}>{countdown ? `${countdown} 秒后可重发` : "重新发送验证码"}</button></div> : (!isAdmin || mode !== "login") && <button className="auth-switch" disabled={busy} onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "没有账号？使用邮箱注册" : "返回密码登录"}</button>}
    </>}
    {onPlatformSwitch && <button className="auth-platform-switch" disabled={busy} onClick={onPlatformSwitch}>{isAdmin ? "想学习课程？前往用户平台登录" : "管理课程与订单？前往管理平台登录"}<ArrowRight size={15} /></button>}
    <small><CheckCircle size={14} weight="fill" /> 登录信息仅用于账号验证与学习服务</small>
    {!isAdmin&&<ServiceLinks compact/>}
  </section>;
}

export function AuthPage({ navigate, initialMode = "login", platform = "user" }) {
  const isAdmin = platform === "admin";
  if (!isAdmin) return <main className="user-auth-page auth-commercial"><div className="auth-form-column"><button className="auth-home" onClick={()=>navigate('/')}><ArrowLeft size={17}/>返回首页</button><UserAuthCard key={platform} navigate={navigate} initialMode={initialMode} platform={platform} presentation="commercial" onPlatformSwitch={()=>navigate(getPlatform('admin').login)}/><footer className="auth-column-footer">OneShowLearn · Learn · Build · Grow<br/><span>让学习有方向，让想法有作品。</span></footer></div><AuthShowcase/></main>;
  return <main className="user-auth-page"><button className="auth-home" onClick={() => navigate("/")}><ArrowLeft size={17} />返回首页</button><UserAuthCard key={platform} navigate={navigate} initialMode={initialMode} platform={platform} onPlatformSwitch={() => navigate(getPlatform(isAdmin ? "user" : "admin").login)} /><aside><span>{isAdmin ? "OneShowLearn · 管理平台" : "Practice First · 用户平台"}</span><h2>{isAdmin ? <>专注内容，<br />服务学习者，<br />经营你的产品。</> : <>学会 AI，<br />用好 AI，<br />做出你的 AI 产品。</>}</h2><p>{isAdmin ? "同一账号，两个平台。管理者也可以随时切换到用户平台，学习课程与体验产品。" : "一个账号保存你的项目包、学习进度、成果与购买记录。"}</p></aside></main>;
}

export function AccountPage({ navigate, platform = "user" }) {
  const platformInfo = getPlatform(platform);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!getToken()) { navigate(platformInfo.login); return; }
    let active = true;
    api("/auth/me").then(({ user }) => { if (!active) return; if (platform === "admin" && !canManage(user)) { navigate("/app"); return; } setUser(user); }).catch((e) => { if (!active) return; if (e.status === 401) { setToken(""); navigate(platformInfo.login); } else setError(e.message); });
    return () => { active = false; };
  }, []);
  const logout = async () => {
    setBusy(true); setError("");
    try { await api("/auth/logout", { method: "POST" }); setToken(""); navigate(platformInfo.login); }
    catch (e) { if (e.status === 401) { setToken(""); navigate(platformInfo.login); } else setError(e.message); }
    finally { setBusy(false); }
  };
  const change = async (e) => {
    e.preventDefault(); setError("");
    if (form.newPassword !== form.confirm) return setError("两次输入的新密码不一致");
    setBusy(true);
    try { await api("/auth/password/change", { method: "POST", body: JSON.stringify(form) }); setToken(""); navigate(platformInfo.login); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <main className="user-auth-page"><button className="auth-home" onClick={() => navigate(platformInfo.home)}><ArrowLeft size={17} />返回{platformInfo.label}</button><section className="user-auth-card"><span>OneShowLearn · {platformInfo.label} · 账号安全</span><h1>管理登录密码</h1><p>{user ? `${user.name} · ${user.email}` : "正在加载账号…"}</p><p>修改密码后，所有设备的旧登录状态将失效，需要重新登录。</p><form onSubmit={change}>{[["currentPassword", "当前密码"], ["newPassword", "新密码"], ["confirm", "确认新密码"]].map(([key, label]) => <label key={key}>{label}<input required type="password" autoComplete={key === "currentPassword" ? "current-password" : "new-password"} minLength={key === "currentPassword" ? 1 : 10} maxLength={key === "currentPassword" ? 128 : 72} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" disabled={busy || !user}>{busy ? "处理中…" : "更新密码并重新登录"}</button></form><button className="auth-switch" disabled={busy || !user} onClick={logout}>退出所有设备</button></section></main>;
}
