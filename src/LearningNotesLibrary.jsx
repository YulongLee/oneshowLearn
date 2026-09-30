import { useEffect, useState } from "react";
import { api } from "./api.js";
import { RichNoteRead, RichLessonNote } from "./RichLessonNote.jsx";
export function LearningNotesLibrary({ model, navigate, query }) {
  const [items, setItems] = useState([]),
    [current, setCurrent] = useState(null),
    [nextOffset, setNextOffset] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(""),
    [trash, setTrash] = useState(false),
    [busy, setBusy] = useState(false);
  const load = (offset = 0) =>
    api(`/learning/notes?offset=${typeof offset === "number" ? offset : 0}`)
      .then((d) => {
        setItems((items) =>
          typeof offset === "number" && offset > 0
            ? [
                ...items,
                ...d.items.filter((n) => !items.some((i) => i.id === n.id)),
              ]
            : d.items,
        );
        setNextOffset(d.nextOffset);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (model.user) load();
  }, [model.user?.id]);
  const dirty = Boolean(draft && draft.body !== current?.body);
  useEffect(() => {
    const guard = (e) => {
      if (!dirty) return;
      if (e.type === "beforeunload") {
        e.preventDefault();
        e.returnValue = "";
      } else if (!window.confirm("笔记尚未保存，确定离开？"))
        e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    window.addEventListener("oneshowlearn:before-navigate", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      window.removeEventListener("oneshowlearn:before-navigate", guard);
    };
  }, [dirty]);
  const save = async (note, deleted = Boolean(note.deleted_at)) => {
    setBusy(true);
    try {
      const result = await api(`/learning/notes/${note.id}`, {
        method: "PUT",
        headers: { "If-Match": String(note.version) },
        body: JSON.stringify({
          placement_id: note.placement_id,
          title: note.title,
          body: note.body,
          video_time: note.video_time,
          slide_id: note.slide_id,
          deleted,
        }),
      });
      await load();
      setCurrent({
        ...result.item,
        source_url: note.source_url,
        lesson_title: note.lesson_title,
      });
      setDraft(null);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const open = (note) => {
    if (dirty && !window.confirm("放弃当前未保存的笔记修改？")) return;
    setCurrent(note);
    setDraft(null);
  };
  if (!model.user)
    return <div className="ls-empty">登录后查看自己的课时笔记。</div>;
  const shown = items.filter(
    (n) =>
      Boolean(n.deleted_at) === trash &&
      `${n.title} ${n.lesson_title}`
        .toLowerCase()
        .includes((query || "").toLowerCase()),
  );
  return (
    <section className="ls-page">
      <header className="ls-heading">
        <div>
          <h1>课程与项目笔记</h1>
          <p>统一查看课时中保存的笔记、截图与时间标记。</p>
        </div>
        <div className="ls-actions">
          <button onClick={() => setTrash((v) => !v)}>
            {trash ? "返回课时笔记" : "课时笔记回收站"}
          </button>
          <button onClick={load}>刷新</button>
        </div>
      </header>
      {error && (
        <p className="ls-error" role="alert">
          {error}
        </p>
      )}
      <div className="ls-note-library">
        <nav className="ls-panel">
          {nextOffset !== null && (
            <button className="ls-btn" onClick={() => load(nextOffset)}>
              加载更多课时笔记
            </button>
          )}
          {shown.map((note) => (
            <button
              className="ls-lesson-row"
              aria-pressed={current?.id === note.id}
              key={note.id}
              onClick={() => open(note)}
            >
              <strong>{note.title}</strong>
              <small>{note.lesson_title}</small>
            </button>
          ))}
          {!shown.length && (
            <p className="ls-muted">
              {trash ? "回收站是空的" : "还没有匹配的课时笔记"}
            </p>
          )}
        </nav>
        <article className="ls-panel">
          {current ? (
            <>
              <h2>{current.title}</h2>
              <p className="ls-muted">
                {current.lesson_title} ·{" "}
                {current.video_time === null
                  ? "课时笔记"
                  : `${Math.floor(current.video_time / 60)} 分 ${Math.floor(current.video_time % 60)} 秒`}
              </p>
              {draft ? (
                <RichLessonNote
                  value={draft.body}
                  onChange={(body) => setDraft({ ...draft, body })}
                />
              ) : (
                <RichNoteRead body={current.body} />
              )}
              <div className="ls-actions">
                {current.deleted_at ? (
                  <button disabled={busy} onClick={() => save(current, false)}>
                    恢复笔记
                  </button>
                ) : (
                  <>
                    {draft ? (
                      <button
                        className="ls-primary"
                        disabled={busy}
                        onClick={() => save(draft)}
                      >
                        保存修改
                      </button>
                    ) : (
                      <button onClick={() => setDraft({ ...current })}>
                        编辑笔记
                      </button>
                    )}
                    <button
                      disabled={busy || dirty}
                      onClick={() => save(current, true)}
                    >
                      移入回收站
                    </button>
                  </>
                )}
                {current.source_url && (
                  <button onClick={() => navigate(current.source_url)}>
                    返回对应课时 →
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="ls-muted">选择一条笔记，回顾当时的思考。</p>
          )}
        </article>
      </div>
    </section>
  );
}
