import { useEffect, useRef, useState } from "react";
import { ArrowRight, Plus } from "@phosphor-icons/react";
import { api } from "./api.js";
import { OPC_PHASES } from "./opc-model.js";

export function AdminOpc({ navigate }) {
  const formRef = useRef(null);
  const [steps, setSteps] = useState([]);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    packId: "",
    title: "",
    summary: "",
    phase: 2,
    sortOrder: 1,
    status: "draft",
  });
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        api("/admin/opc/steps"),
        api("/admin/packs"),
      ]);
      setSteps(a.items);
      setPacks(b.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const assign = async (id, phase) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/admin/opc/steps/${id}`, {
        method: "PUT",
        body: JSON.stringify({ phase: phase ? Number(phase) : null }),
      });
      setSteps((v) =>
        v.map((s) =>
          s.id === id ? { ...s, phase: phase ? Number(phase) : null } : s,
        ),
      );
      setMessage(
        "阶段编排已保存；只有已发布路径、项目包、章节和内容会显示在学习空间。",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    let created = false;
    try {
      const chapter = await api(form.id ? `/admin/opc/chapters/${form.id}` : "/admin/steps", {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify({
          packId: Number(form.packId),
          title: form.title,
          summary: form.summary,
          sortOrder: Number(form.sortOrder),
          status: form.status,
        }),
      });
      created = true;
      await api(`/admin/opc/steps/${chapter.id}`, {
        method: "PUT",
        body: JSON.stringify({ phase: Number(form.phase) }),
      });
      setMessage(
        "章节已保存并编入 AI OPC。请前往课程资料，为这个章节添加实际学习内容。",
      );
    } catch (e) {
      setError(
        created
          ? `章节已保存，阶段关联失败，请在列表中重新选择阶段：${e.message}`
          : e.message,
      );
    } finally {
      if (created) {
        setForm((v) => ({
          ...v,
          id: undefined,
          title: "",
          summary: "",
          sortOrder: Number(v.sortOrder) + 1,
        }));
        try {
          const d = await api("/admin/opc/steps");
          setSteps(d.items);
        } catch {}
      }
      setBusy(false);
    }
  };
  return (
    <>
      <div className="admin-page-head">
        <div>
          <span>AI OPC 课程编排</span>
          <h1>五个阶段，组成一条实践路线</h1>
          <p>
            将后台章节编入 AI
            OPC，复用现有资料、发布状态与课程学习权限。不会自动生成示例课程。
          </p>
        </div>
        <button className="admin-primary" onClick={() => navigate("/opc")}>
          查看学习空间
          <ArrowRight size={16} />
        </button>
      </div>
      {error && (
        <div className="admin-error" role="alert">
          {error}
          <button onClick={load}>重新加载</button>
        </div>
      )}
      {message && (
        <div className="admin-success" role="status">
          {message}
        </div>
      )}
      <section className="admin-panel">
        <div className="admin-section-title">
          <div>
            <h2>阶段内容概览</h2>
            <p>阶段可自由浏览，付费内容沿用所属项目包的访问权限。</p>
          </div>
          <button
            className="admin-primary"
            onClick={() => navigate("/admin/content")}
          >
            管理课程资料
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="admin-card-grid">
          {OPC_PHASES.map((p) => (
            <article key={p.id}>
              <span>阶段 {p.id}</span>
              <h3>{p.title}</h3>
              <p>{p.subtitle}</p>
              <small>
                {steps.filter((s) => s.phase === p.id).length} 个已编排章节
              </small>
            </article>
          ))}
        </div>
      </section>
      <section className="admin-panel">
        <div className="admin-section-title">
          <div>
            <h2>章节与阶段关联</h2>
            <p>同一章节只属于一个阶段；取消关联不删除章节及内容。</p>
          </div>
        </div>
        {loading ? (
          <p>正在加载…</p>
        ) : (
          <div className="admin-opc-mappings">
            {steps.map((s) => (
              <div key={s.id} className="admin-opc-mapping">
                <div>
                  <strong>{s.title}</strong>
                  <small>
                    {s.pack_title} ·{" "}
                    {
                      { published: "已发布", draft: "草稿", archived: "归档" }[
                        s.status
                      ]
                    }{" "}
                    · {s.content_count} 项已发布资料
                  </small>
                  <button type="button" className="admin-opc-edit" disabled={busy} onClick={() => { setForm({id:s.id,packId:s.pack_id,title:s.title,summary:s.summary,phase:s.phase || 2,sortOrder:s.sort_order,status:s.status}); formRef.current?.scrollIntoView({behavior:"smooth",block:"center"}); }}>编辑章节与发布状态</button>
                </div>
                <label>
                  AI OPC 阶段
                  <select
                    aria-label={`${s.title}的 AI OPC 阶段`}
                    disabled={busy}
                    value={s.phase || ""}
                    onChange={(e) => assign(s.id, e.target.value)}
                  >
                    <option value="">不编入 AI OPC</option>
                    {OPC_PHASES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}. {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
            {!steps.length && <p>先创建课程章节，再添加学习资料。</p>}
          </div>
        )}
      </section>
      <section className="admin-panel">
        <div className="admin-section-title">
          <div>
            <h2>{form.id ? "编辑课程章节" : "新增课程章节"}</h2>
            <p>
              章节对应一个实践主题，章节下的文档、模板和视频在学习空间逐项展示。
            </p>
          </div>
        </div>
        <form ref={formRef} className="admin-opc-form" onSubmit={create}>
          <div className="admin-form-row">
            <label>
              所属项目包
              <select
                required
                value={form.packId}
                onChange={(e) => setForm({ ...form, packId: e.target.value })}
              >
                <option value="">选择项目包</option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              编入阶段
              <select
                value={form.phase}
                onChange={(e) =>
                  setForm({ ...form, phase: Number(e.target.value) })
                }
              >
                {OPC_PHASES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            章节标题
            <input
              required
              minLength={2}
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例如：开发 Web 产品"
            />
          </label>
          <label>
            章节简介
            <textarea
              rows={2}
              maxLength={1000}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </label>
          <div className="admin-form-row">
            <label>
              排序
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: e.target.value })
                }
              />
            </label>
            <label>
              发布状态
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="draft">草稿</option>
                <option value="published">发布（资料仍需单独发布）</option>
                <option value="archived">归档</option>
              </select>
            </label>
          </div>
          <button className="admin-primary" disabled={busy || loading}>
            <Plus size={16} />
            {form.id ? "保存章节" : "创建章节"}
          </button>
          {form.id && <button type="button" className="admin-opc-edit" onClick={() => setForm({...form,id:undefined,title:"",summary:"",status:"draft"})}>取消编辑，返回新增</button>}
        </form>
      </section>
    </>
  );
}
