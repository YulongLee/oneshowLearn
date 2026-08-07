import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, EnvelopeSimple, X } from "@phosphor-icons/react";
import { api, setToken } from "./api.js";

export function UserAuthCard({ navigate, onSuccess, onClose, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  useEffect(() => { if (!countdown) return; const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [countdown]);

  const login = async () => {
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password }) });
    setToken(result.token); onSuccess?.(result.user); if (!onSuccess) navigate?.("/app");
  };
  const requestCode = async () => {
    await api("/auth/register/request-code", { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, password: form.password }) });
    setMode("verify"); setCountdown(60);
  };
  const verify = async () => {
    const result = await api("/auth/register/verify", { method: "POST", body: JSON.stringify({ email: form.email, code: form.code }) });
    setToken(result.token); onSuccess?.(result.user); if (!onSuccess) navigate?.("/app");
  };
  const requestResetCode = async () => {
    await api("/auth/password/request-code", { method: "POST", body: JSON.stringify({ email: form.email }) });
    setMode("reset"); setCountdown(60);
  };
  const resetPassword = async () => {
    await api("/auth/password/reset", { method: "POST", body: JSON.stringify({ email: form.email, code: form.code, newPassword: form.password }) });
    setForm((value) => ({ ...value, password: "", code: "" })); setMode("login"); setNotice("密码已更新，请使用新密码登录");
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "login") await login();
      else if (mode === "register") await requestCode();
      else if (mode === "verify") await verify();
      else if (mode === "forgot") await requestResetCode();
      else await resetPassword();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const resend = async () => { if (countdown) return; setBusy(true); setError(""); try { mode === "reset" ? await requestResetCode() : await requestCode(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const codeMode = mode === "verify" || mode === "reset";
  const heading = mode === "login" ? "欢迎回来" : mode === "register" ? "创建学习账号" : mode === "forgot" ? "找回登录密码" : mode === "reset" ? "设置新密码" : "输入邮箱验证码";
  const copy = mode === "login" ? "登录后继续你的项目与学习进度。" : mode === "register" ? "通过邮箱验证注册，购买记录和学习成果将保存在账号中。" : mode === "forgot" ? "输入注册邮箱，我们会向你发送密码重置验证码。" : `验证码已发送至 ${form.email}，10 分钟内有效。`;
  const buttonText = busy ? "请稍候…" : mode === "login" ? "登录" : mode === "register" || mode === "forgot" ? "发送验证码" : mode === "reset" ? "确认重置密码" : "验证并完成注册";

  return <section className="user-auth-card">
    {onClose && <button className="auth-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>}
    <img src="/assets/oneshowlearn-brandmark.png" alt="" /><span>OneShowLearn</span><h1>{heading}</h1><p>{copy}</p>
    <form onSubmit={submit}>
      {mode === "register" && <label>你的称呼<input required minLength="2" maxLength="80" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：Yulong" /></label>}
      {!codeMode && <label>邮箱<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value.trim() })} placeholder="name@example.com" /></label>}
      {["login", "register", "reset"].includes(mode) && <label>{mode === "reset" ? "新密码" : "密码"}<input required type="password" minLength="10" maxLength="128" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === "reset" ? "设置至少 10 位的新密码" : "至少 10 位字符"} /></label>}
      {codeMode && <label className="verification-label">6 位验证码<div><EnvelopeSimple size={20} /><input required inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoFocus value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "") })} placeholder="000000" /></div></label>}
      {notice && <div className="auth-notice"><CheckCircle size={16} />{notice}</div>}
      {error && <div className="auth-error">{error}</div>}
      {mode === "login" && <button type="button" className="forgot-link" onClick={() => { setError(""); setNotice(""); setMode("forgot"); }}>忘记密码？</button>}
      <button className="auth-submit" disabled={busy}>{buttonText}<ArrowRight size={17} /></button>
    </form>
    {codeMode ? <div className="auth-foot"><button onClick={() => setMode(mode === "reset" ? "forgot" : "register")}><ArrowLeft size={14} />修改邮箱</button><button disabled={Boolean(countdown) || busy} onClick={resend}>{countdown ? `${countdown} 秒后可重发` : "重新发送验证码"}</button></div> : <button className="auth-switch" onClick={() => { setError(""); setNotice(""); setMode(mode === "login" ? "register" : "login"); }}>{mode === "login" ? "没有账号？使用邮箱注册" : "返回密码登录"}</button>}
    <small><CheckCircle size={14} weight="fill" /> 邮箱仅用于账号验证、订单与重要学习通知</small>
  </section>;
}

export function AuthPage({ navigate, initialMode = "login" }) {
  return <main className="user-auth-page"><button className="auth-home" onClick={() => navigate("/")}><ArrowLeft size={17} />返回首页</button><UserAuthCard navigate={navigate} initialMode={initialMode} /><aside><span>Practice First</span><h2>学会 AI，<br />用好 AI，<br />做出你的 AI 产品。</h2><p>一个账号保存你的项目包、学习进度、成果与购买记录。</p></aside></main>;
}
