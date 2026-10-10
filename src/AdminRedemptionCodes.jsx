import { useEffect, useMemo, useState } from 'react';
import { Copy, Key, Prohibit, Sparkle } from '@phosphor-icons/react';
import { api, money } from './api.js';
import './admin-cms.css';

const statusLabel = { active: '未使用', used: '已使用', revoked: '已失效' };

export function AdminRedemptionCodes() {
  const [data, setData] = useState(null), [status, setStatus] = useState(''), [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ productId: '', count: 10, expiresAt: '', note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [generated, setGenerated] = useState(null), [copied, setCopied] = useState(false);
  const load = async () => { setLoading(true); setError(''); try { const next = await api(`/admin/redemption-codes?status=${encodeURIComponent(status)}`); setData(next); setForm((f) => ({ ...f, productId: f.productId || next.products[0]?.id || '' })); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [status]);
  const product = useMemo(() => data?.products.find((item) => Number(item.id) === Number(form.productId)), [data, form.productId]);
  const generate = async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage(''); setGenerated(null); setCopied(false);
    try {
      const payload = { productId: Number(form.productId), count: Number(form.count), expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null, note: form.note };
      const result = await api('/admin/redemption-codes', { method: 'POST', body: JSON.stringify(payload) });
      setGenerated(result); setMessage(`已生成 ${result.count} 个兑换码。明文仅在本次展示，请立即复制保存。`); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const copyAll = async () => { if (!generated) return; const text = generated.codes.join('\n'); try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); } setCopied(true); };
  const revoke = async (id) => { if (!window.confirm('确认撤销这个未使用的兑换码？撤销后不可恢复。')) return; setError(''); try { await api(`/admin/redemption-codes/${id}/revoke`, { method: 'POST', body: '{}' }); setMessage('兑换码已撤销'); await load(); } catch (e) { setError(e.message); } };
  return <div className="cms-page admin-redemption-codes"><div className="admin-page-head"><div><span>COURSE ACCESS</span><h1>课程兑换码</h1><p>生成一次性兑换码，兑换成功后直接开通对应课程，不创建支付订单。</p></div><button type="button" onClick={load}>刷新</button></div>
    {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
    <section className="admin-panel"><div className="admin-section-title"><div><h2><Key size={19} /> 生成兑换码</h2><p>兑换码只在生成完成时显示一次，服务端仅保存不可逆摘要。</p></div></div><form className="redemption-form" onSubmit={generate}><label>绑定课程<select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">请选择已发布课程</option>{(data?.products || []).map((item) => <option key={item.id} value={item.id}>{item.title} · {money(item.price_cents)}</option>)}</select></label><label>生成数量<input type="number" min="1" max="500" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} /><small>单批最多 500 个</small></label><label>有效期（可选）<input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /><small>留空表示长期有效</small></label><label>批次备注（可选）<input maxLength="200" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="例如：合作伙伴 / 活动名称" /></label><div className="cms-actions"><button className="admin-primary" disabled={busy || !form.productId}>{busy ? '生成中…' : '生成兑换码'}</button>{product && <span className="cms-hint">当前课程：{product.title} · {money(product.price_cents)}</span>}</div></form></section>
    {generated && <section className="admin-panel redemption-generated"><div className="admin-section-title"><div><h2><Sparkle size={19} /> 本批兑换码</h2><p>批次 {generated.batchId} · {generated.count} 个 · {generated.expiresAt ? `有效至 ${new Date(generated.expiresAt).toLocaleString('zh-CN')}` : '长期有效'}</p></div><button type="button" onClick={copyAll}><Copy size={16} /> {copied ? '已复制' : '复制全部'}</button></div><div className="redemption-warning">请立即复制并妥善分发。离开当前页面后无法再次查看完整兑换码。</div><pre>{generated.codes.join('\n')}</pre></section>}
    <section className="admin-panel"><div className="admin-section-title"><div><h2>兑换码记录</h2><p>仅展示末 4 位和使用状态，避免后台泄露完整兑换码。</p></div><select aria-label="兑换码状态" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部状态</option><option value="active">未使用</option><option value="used">已使用</option><option value="revoked">已失效</option></select></div>{loading ? <div className="admin-state">正在加载兑换码…</div> : !data?.items.length ? <div className="cms-empty"><Key size={28} /><p>还没有兑换码。生成一批后，学员可以在课程收银台直接兑换。</p></div> : <div className="admin-table redemption-table"><div className="tr head"><span>兑换码</span><span>课程</span><span>状态</span><span>使用信息</span><span>操作</span></div>{data.items.map((item) => <div className="tr" key={item.id}><span><strong>OSL-••••-••••-••••-{item.codeLast4}</strong><small>{item.note || '无批次备注'}</small></span><span>{item.productTitle}<small>{item.expiresAt ? `有效至 ${new Date(item.expiresAt).toLocaleString('zh-CN')}` : '长期有效'}</small></span><span><em className={`admin-status ${item.status}`}>{statusLabel[item.status]}</em></span><span>{item.usedAt ? <><strong>{item.usedBy || '账号已删除'}</strong><small>{new Date(item.usedAt).toLocaleString('zh-CN')}</small></> : <small>尚未使用</small>}</span><span>{item.status === 'active' && <button type="button" onClick={() => revoke(item.id)}><Prohibit size={15} />撤销</button>}</span></div>)}</div>}</section>
  </div>;
}
