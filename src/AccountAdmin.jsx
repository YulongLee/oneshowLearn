import { useEffect, useState } from "react";
import { api } from "./api.js";

function useAccountData(path) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api(path).then((data) => active && setState({ data, error: "", loading: false })).catch((e) => active && setState({ data: null, error: e.message, loading: false }));
    return () => { active = false; };
  }, [path, revision]);
  return [state, () => setRevision((n) => n + 1)];
}
function Feedback({ state }) {
  return state.loading ? <p role="status">正在加载…</p> : state.error ? <p className="admin-error" role="alert">{state.error}</p> : null;
}
const time = (value) => value ? new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString("zh-CN") : "—";
const actionNames = { register: "邮箱注册", password_reset: "找回密码", password_change: "修改密码", logout_all: "退出所有设备", disable: "停用账号", enable: "恢复账号", revoke: "撤销登录", email_test: "测试发信", phone_registered:"手机号注册", wechat_registered:"微信注册", phone_bound:"绑定手机号", wechat_bound:"绑定微信", login_configuration_updated:"更新登录配置" };

export function AdminUsers() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [state, reload] = useAccountData(`/admin/users?q=${encodeURIComponent(search)}&status=${status}&page=${page}`);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const begin = (user, kind) => { setAction({ user, kind }); setReason(""); setError(""); setNotice(""); };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/admin/users/${action.user.id}/action`, { method: "POST", body: JSON.stringify({ action: action.kind, reason }) }); setAction(null); setNotice("操作已保存，该账号原有登录状态已失效。"); reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <><div className="admin-page-head"><div><span>账号管理</span><h1>用户与登录安全</h1><p>查询登录方式与验证状态，停用账号或撤销登录。所有管理操作均保留记录。</p></div><button onClick={reload}>刷新</button></div>
    <section className="admin-panel"><form className="account-filters" onSubmit={(e) => { e.preventDefault(); setSearch(query); setPage(1); }}><input aria-label="搜索邮箱、手机号或昵称" placeholder="搜索邮箱、手机号或昵称" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="账号状态" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已停用</option></select><button type="submit">搜索</button></form>
      {notice && <p className="admin-success" role="status">{notice}</p>}<Feedback state={state} />
      {!state.loading && state.data && <><div className="account-table-wrap"><table className="account-table"><thead><tr><th>用户</th><th>角色 / 登录方式</th><th>权益 / 订单</th><th>最近登录</th><th>状态</th><th>操作</th></tr></thead><tbody>{state.data.items.map((u) => <tr key={u.id}><td><strong>{u.name}</strong><small>{u.email||u.phone_masked||`账号 #${u.id}`}</small></td><td>{({ admin: "管理员", editor: "内容编辑", learner: "学习者" })[u.role]}<small>{[u.email_verified?"邮箱已验证":"",u.login_methods?.includes("phone")?"手机号已验证":"",u.login_methods?.includes("wechat")?"微信已绑定":""].filter(Boolean).join(" · ")||"待验证"}</small></td><td>{u.pack_count} 个项目包<small>{u.order_count} 笔订单</small></td><td>{time(u.last_login_at)}</td><td>{u.status === "active" ? "正常" : "已停用"}</td><td>{u.role === "admin" ? <small>受保护管理员</small> : <div className="account-row-actions"><button onClick={() => begin(u, u.status === "active" ? "disable" : "enable")}>{u.status === "active" ? "停用" : "恢复"}</button><button onClick={() => begin(u, "revoke")}>撤销登录</button></div>}</td></tr>)}</tbody></table></div>{!state.data.items.length && <p className="admin-state">没有符合条件的用户</p>}<div className="account-pagination"><span>共 {state.data.total} 位用户 · 第 {page} 页</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button><button disabled={page * 20 >= state.data.total} onClick={() => setPage(page + 1)}>下一页</button></div></>}
    </section>{action && <div className="admin-modal-bg"><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="account-action-heading" onSubmit={submit}><button type="button" disabled={busy} onClick={() => setAction(null)} aria-label="关闭">×</button><h2 id="account-action-heading">{actionNames[action.kind]}</h2><p>{action.user.email||action.user.phone_masked||`账号 #${action.user.id}`}</p><p>该操作会使用户的所有旧登录状态失效，不会删除课程权益或订单。</p><label>操作原因<textarea required minLength="2" maxLength="300" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="请输入原因，方便后续追溯" /></label>{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={busy}>{busy ? "处理中…" : "确认操作"}</button></form></div>}</>;
}

export function AdminEmail() {
  const [state, reload] = useAccountData("/admin/email");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const perform = async (kind) => {
    setBusy(true); setNotice(""); setError("");
    try { const result = await api(`/admin/email/${kind}`, { method: "POST" }); setNotice(result.message); if (kind === "test") setCooldown(60); reload(); }
    catch (e) { setError(e.message); if (e.cooldownSeconds) setCooldown(e.cooldownSeconds); reload(); } finally { setBusy(false); }
  };
  const data = state.data;
  return <><div className="admin-page-head"><div><span>账号基础服务</span><h1>邮件服务</h1><p>检查真实发信能力，查看注册、找回密码与测试邮件记录。</p></div><button disabled={busy} onClick={reload}>刷新</button></div><Feedback state={state} />
    {data && <><section className="admin-panel"><div className="account-email-summary"><div><small>邮箱注册</small><strong>{data.registrationEnabled ? "已开放" : "暂未开放"}</strong></div><div><small>发信通道</small><strong>{data.mode === "development" ? "本地模拟（不发邮件）" : data.configured ? data.mode.toUpperCase() : "未配置"}</strong></div><div><small>过去 24 小时尝试 / 限额</small><strong>{data.sentToday} / {data.dailyLimit}</strong></div></div><p>发件人：{data.sender || "未配置"}</p>{data.host && <p>服务器：{data.host}:{data.port}</p>}<p className="account-help">密码和授权码保存在服务器，不会传给浏览器。测试邮件只发送到当前管理员自己的已验证邮箱。</p><div className="account-row-actions"><button disabled={busy || !data.configured} onClick={() => perform("verify")}>检测连接</button><button className="admin-primary" disabled={busy || !data.available || cooldown > 0} onClick={() => perform("test")}>{cooldown ? `${cooldown} 秒后可测试` : busy ? "检测中…" : "发送测试邮件给我"}</button></div>{notice && <p className="admin-success" role="status">{notice}</p>}{error && <p className="admin-error" role="alert">{error}</p>}</section>
    <section className="admin-panel"><h2>最近 50 次发送记录</h2><p className="account-help">“服务商已接收”不等于收件箱已送达；也请检查垃圾邮件。记录不包含验证码或密码。</p><div className="account-table-wrap"><table className="account-table"><thead><tr><th>时间</th><th>收件人</th><th>类型</th><th>结果</th><th>错误分类</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{time(item.created_at)}</td><td>{item.recipient}</td><td>{({ register: "注册验证", reset: "找回密码", test: "测试邮件" })[item.purpose]}</td><td>{({ pending: "发送中", accepted: "服务商已接收", failed: "发送失败", development: "本地模拟" })[item.status]}</td><td>{item.error_code || "—"}</td></tr>)}</tbody></table></div>{!data.items.length && <p>暂无发送记录</p>}</section></>}
  </>;
}

export function AdminAccountAudit() {
  const [state, reload] = useAccountData("/admin/account-audit");
  return <><div className="admin-page-head"><div><span>安全记录</span><h1>账号操作记录</h1><p>最近 50 次账号注册、密码修改、会话撤销和用户管理操作。</p></div><button onClick={reload}>刷新</button></div><section className="admin-panel"><Feedback state={state} /><div className="account-table-wrap"><table className="account-table"><thead><tr><th>时间</th><th>操作者</th><th>目标用户</th><th>操作</th><th>原因</th></tr></thead><tbody>{state.data?.items.map((item) => <tr key={item.id}><td>{time(item.created_at)}</td><td>{item.actor_email || "—"}</td><td>{item.target_email || "—"}</td><td>{actionNames[item.action] || item.action}</td><td>{item.reason || "—"}</td></tr>)}</tbody></table></div>{state.data?.items.length === 0 && <p>暂无操作记录</p>}</section></>;
}
