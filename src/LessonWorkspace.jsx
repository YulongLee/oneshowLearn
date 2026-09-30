import { useEffect, useRef, useState } from "react";
import { ArrowsOut, Robot } from "@phosphor-icons/react";
import { api } from "./api.js";
import { Markdown } from "./PersonalShared.jsx";
import { safeResourceUrl } from "./opc-model.js";
import { studyMaterials } from "./project-study-model.js";
import { RichLessonNote, RichNoteRead } from "./RichLessonNote.jsx";
import "./learning-system.css";
import {
  CourseDirectory,
  DirectorySlot,
  useLearningFocus,
} from "./CourseLearningUi.jsx";
import { LearningVideoPlayer } from "./LearningVideoPlayer.jsx";
import './study-refinements.css';
import './ai-live.css';
import { useAiCapabilities } from './useAiCapabilities.js';
import { StudyColumns } from './StudyColumns.jsx';

export const lessonLink = (p) =>
  p.kind === "project"
    ? `/projects/${encodeURIComponent(p.owner_slug)}/workspace/${p.id}`
    : `/learn/${encodeURIComponent(p.owner_slug)}/lessons/${p.id}`;
const timestamp = (value) =>
  `${Math.floor((value || 0) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((value || 0) % 60)
    .toString()
    .padStart(2, "0")}`;
const progressBody = (p) => ({
  video_time: p.video_time || 0,
  video_duration: p.video_duration || 0,
  current_prompt_id: p.current_prompt_id || null,
  slide_id: p.slide_id || null,
  follow_video: Boolean(p.follow_video),
  tasks: p.tasks || [],
  complete: Boolean(p.completed_at),
});

// One writer per mounted lesson. A failed CAS stops autosaving until explicit reload.
function useLessonProgress(lesson, enabled, onChange, video) {
  const [value, setValue] = useState(lesson.progress),
    [state, setState] = useState("已同步");
  const ref = useRef({ ...lesson.progress }),
    saved = useRef(JSON.stringify(progressBody(lesson.progress))),
    pending = useRef(null),
    blocked = useRef(false),
    failure = useRef(""),
    alive = useRef(true);
  const change = (patch) => {
    ref.current = { ...ref.current, ...patch };
    setValue({ ...ref.current });
    setState(blocked.current ? failure.current : "待保存");
  };
  const save = async () => {
    if (!enabled || blocked.current) return false;
    if (pending.current) {
      if (!(await pending.current)) return false;
      return save();
    }
    const body = progressBody(ref.current),
      snapshot = JSON.stringify(body);
    if (snapshot === saved.current) {
      if (alive.current) setState("已同步");
      return true;
    }
    setState("保存中…");
    const request = api(`/learning/placements/${lesson.id}/progress`, {
      signal: AbortSignal.timeout(15000),
      method: "PUT",
      headers: { "If-Match": String(ref.current.version) },
      body: JSON.stringify(body),
    })
      .then(({ progress }) => {
        ref.current = {
          ...ref.current,
          version: progress.version,
          completed_at: body.complete
            ? progress.completed_at
            : ref.current.completed_at || progress.completed_at,
        };
        saved.current = snapshot;
        if (alive.current) {
          setValue({ ...ref.current });
          setState(
            JSON.stringify(progressBody(ref.current)) === snapshot
              ? "已同步"
              : "待保存",
          );
          onChange?.(lesson.id, progress);
        }
        return true;
      })
      .catch((e) => {
        if (e.status === 409) blocked.current = true;
        failure.current = e.name === 'TimeoutError' ? '进度保存超时，请检查网络后重试。' : e.message;
        if (alive.current) setState(failure.current);
        return false;
      })
      .finally(() => {
        pending.current = null;
      });
    pending.current = request;
    return request;
  };
  const dirty = () =>
    enabled && JSON.stringify(progressBody(ref.current)) !== saved.current;
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(save, 5000);
    const visibility = () => {
      if (document.hidden) save();
    };
    const guard = (e) => {
      if (e.type === 'oneshowlearn:before-navigate' && e.detail?.waitUntil) {
        if (!enabled) return;
        e.detail.waitUntil(async () => {
          const media = video.current;
          if (media && Number.isFinite(media.currentTime) && media.readyState > 0) {
            media.pause();
            change({video_time: media.currentTime});
          }
          return save();
        }, dirty);
        return;
      }
      if (!dirty()) return;
      if (e.type === "beforeunload") {
        e.preventDefault();
        e.returnValue = "";
      } else e.preventDefault();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("beforeunload", guard);
    window.addEventListener("oneshowlearn:before-navigate", guard);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("beforeunload", guard);
      window.removeEventListener("oneshowlearn:before-navigate", guard);
    };
  }, []);
  return { value, change, save, state, blocked: blocked.current };
}

function LessonNotes({ lesson, video, slide, time, onJump, user }) {
  const [items, setItems] = useState([]),
    [draft, setDraft] = useState(null),
    [nextNotes, setNextNotes] = useState(null),
    [text, setText] = useState(""),
    [title, setTitle] = useState(""),
    [state, setState] = useState(""),
    [tab, setTab] = useState("notes");
  const panel = useRef(null);
  const editor = useRef(null),
    live = useRef(null),
    saved = useRef(""),
    inFlight = useRef(null),
    alive = useRef(true),
    conflict = useRef(false),
    anchor = useRef({ video_time: null, slide_id: null });
  const load = (offset = 0) =>
    api(`/learning/notes?placement=${lesson.id}&offset=${offset}`)
      .then((d) => {
        setItems((items) => {
          const next = d.items.filter((n) => !n.deleted_at);
          return offset
            ? [
                ...items,
                ...next.filter((n) => !items.some((i) => i.id === n.id)),
              ]
            : next;
        });
        setNextNotes(d.nextOffset);
      })
      .catch((e) => setState(e.message));
  useEffect(() => {
    alive.current = true;
    if (user) load();
    return () => {
      alive.current = false;
    };
  }, [lesson.id, user?.id]);
  live.current = { draft, text, title };
  const body = () => ({
    placement_id: lesson.id,
    title: live.current.title.trim() || "课时笔记",
    body: live.current.text,
    ...anchor.current,
    deleted: false,
  });
  const dirty = () =>
    Boolean(
      user &&
      (live.current.text.trim() || live.current.draft) &&
      JSON.stringify(body()) !== saved.current,
    );
  const save = async () => {
    if (inFlight.current) {
      if (!(await inFlight.current)) return false;
      return save();
    }
    if (!dirty() || conflict.current) return !dirty();
    setState("保存中…");
    const data = body(),
      snapshot = JSON.stringify(data),
      id = live.current.draft?.id;
    const request = (async () => { try {
      const result = await api(`/learning/notes${id ? `/${id}` : ""}`, {
        signal: AbortSignal.timeout(15000),
        method: id ? "PUT" : "POST",
        headers: id ? { "If-Match": String(live.current.draft.version) } : {},
        body: JSON.stringify(data),
      });
      saved.current = snapshot;
      if (alive.current) {
        setDraft(result.item);
        live.current.draft = result.item;
        setState("笔记已保存");
        setItems((items) => [
          result.item,
          ...items.filter((n) => n.id !== result.item.id),
        ]);
      }
      return true;
    } catch (e) {
      if (e.status === 409) conflict.current = true;
      if (alive.current) setState(e.name === 'TimeoutError' ? '笔记保存超时，请检查网络后重试，输入仍保留。' : e.message);
      return false;
    } finally {
      inFlight.current = null;
    } })();
    inFlight.current = request;
    return request;
  };
  useEffect(() => {
    const timer = setTimeout(save, 1400);
    return () => clearTimeout(timer);
  }, [text, title, draft?.id]);
  useEffect(() => {
    const timer = setInterval(save, 4000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const guard = (e) => {
      if (e.type === 'oneshowlearn:before-navigate' && e.detail?.waitUntil) {
        if (user) e.detail.waitUntil(save, dirty);
        return;
      }
      if (!dirty()) return;
      if (e.type === "beforeunload") {
        e.preventDefault();
        e.returnValue = "";
      } else e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    window.addEventListener("oneshowlearn:before-navigate", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      window.removeEventListener("oneshowlearn:before-navigate", guard);
    };
  }, []);
  const start = async (note = null, anchored = false) => {
    if (inFlight.current) return;
    if (dirty() && !(await save())) return;
    conflict.current = false;
    anchor.current = {
      video_time: note?.video_time ?? (anchored ? time : null),
      slide_id: note?.slide_id ?? (anchored ? slide?.id || null : null),
    };
    setDraft(note);
    setTitle(note?.title || "");
    setText(note?.body || "");
    live.current = {
      draft: note,
      title: note?.title || "",
      text: note?.body || "",
    };
    saved.current = note ? JSON.stringify(body()) : "";
    setState(
      anchored
        ? `已关联 ${timestamp(time)}${slide ? " / 当前课件页" : ""}，填写内容后自动保存`
        : "",
    );
  };
  const format = (prefix, suffix = prefix) => {
    const el = editor.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    setText(
      text.slice(0, start) +
        prefix +
        (text.slice(start, end) || "文字") +
        suffix +
        text.slice(end),
    );
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  };
  const archive = async (note) => {
    if (!window.confirm("将这条笔记移入回收站？")) return;
    try {
      await api(`/learning/notes/${note.id}`, {
        method: "PUT",
        headers: { "If-Match": String(note.version) },
        body: JSON.stringify({
          placement_id: note.placement_id,
          title: note.title,
          body: note.body,
          video_time: note.video_time,
          slide_id: note.slide_id,
          deleted: true,
        }),
      });
      setItems((items) => items.filter((n) => n.id !== note.id));
      if (draft?.id === note.id) {
        setDraft(null);
        setText("");
        setTitle("");
        saved.current = "";
      }
    } catch (e) {
      setState(e.message);
    }
  };
  return (
    <aside className="ls-panel ls-notes" ref={panel}>
      <div className="ls-tabs">
        {[
          ["notes", "我的笔记"],
          ["summary", "AI 笔记"],
          ["ask", "问 AI"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
          >
            {label}
          </button>
        ))}
        <button
          className="cl-notes-expand"
          aria-label="切换笔记全屏"
          onClick={async () => {
            try {
              if (document.fullscreenElement === panel.current)
                await document.exitFullscreen();
              else if (panel.current.requestFullscreen)
                await panel.current.requestFullscreen();
              else setState("此浏览器暂不支持笔记全屏");
            } catch {
              setState("此浏览器暂不支持笔记全屏");
            }
          }}
        >
          <ArrowsOut size={19} />
        </button>
      </div>
      {tab !== "notes" ? (
        <CourseAiPanel lesson={lesson} mode={tab} user={user} slideId={slide?.id || null} onNote={note => setItems(items => [note, ...items.filter(item => item.id !== note.id)])}/>
      ) : !user ? (
        <p>登录后可保存私人笔记。</p>
      ) : (
        <>
          <input
            aria-label="笔记标题"
            placeholder="笔记标题"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <RichLessonNote
            value={text}
            onChange={setText}
            video={video}
            slide={slide}
            onAnchor={() => {
              anchor.current = {
                video_time: time,
                slide_id: slide?.id || null,
              };
            }}
          />
          <div className="ls-actions ls-note-actions">
            <button className="ls-timestamp-action" onClick={() => start(null, true)}>
              ＋ 记录 {timestamp(time)}
            </button>
            <button onClick={() => start()}>新笔记</button>
            <button onClick={() => save()}>保存</button>
          </div>
          <small role="status">{state || "输入后自动保存 · 仅自己可见"}</small>
          {conflict.current && (
            <div>
              <p>
                其他页面已修改这条笔记。可先下载当前草稿，再读取最新版本，避免覆盖。
              </p>
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([live.current.text], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "课程笔记草稿.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                下载当前草稿
              </button>
              <button
                onClick={async () => {
                  if (
                    !window.confirm(
                      "读取最新版本将替换当前输入。请先下载或复制草稿。",
                    )
                  )
                    return;
                  try {
                    const d = await api(
                      `/learning/notes?placement=${lesson.id}`,
                    );
                    const latest = d.items.find((n) => n.id === draft?.id);
                    conflict.current = false;
                    saved.current = JSON.stringify(body());
                    await start(latest && !latest.deleted_at ? latest : null);
                    setItems(d.items.filter((n) => !n.deleted_at));
                  } catch (e) {
                    setState(e.message);
                  }
                }}
              >
                读取最新版本
              </button>
            </div>
          )}
          <h3>时间线笔记 · {items.length}</h3>
          {nextNotes !== null && (
            <button onClick={() => load(nextNotes)}>加载更早笔记</button>
          )}
          {items.map((note) => (
            <article className="ls-note" key={note.id}>
              <button onClick={() => onJump(note.video_time, note.slide_id)}>
                {note.video_time === null
                  ? "课时笔记"
                  : timestamp(note.video_time)}
                {note.slide_id
                  ? ` · PPT ${lesson.config.slides.findIndex((s) => s.id === note.slide_id) + 1}`
                  : ""}
              </button>
              <h4>{note.title}</h4>
              <RichNoteRead body={note.body} />
              <div className="ls-actions">
                <button onClick={() => start(note)}>编辑</button>
                <button onClick={() => archive(note)}>移入回收站</button>
              </div>
            </article>
          ))}
        </>
      )}
      {tab === "notes" && (
        <div className="ls-ai-note-entry">
          <Robot size={22} />
          <div><strong>AI 整理笔记</strong><small>基于当前课时 · 服务可用性以配置为准</small></div>
          <button aria-label="查看 AI 笔记功能" onClick={() => setTab("summary")}>→</button>
        </div>
      )}
    </aside>
  );
}

export function CourseAiPanel({ lesson, mode, user, onNote, slideId=null }) {
  const cap = useAiCapabilities(user?.id);
  const [question, setQuestion] = useState(""),
    [response, setResponse] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [savedAnswer, setSavedAnswer] = useState(false),
    [saveBusy, setSaveBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const active = useRef(null), saving = useRef(false);
  useEffect(() => {
    setQuestion(''); setResponse(''); setEvidence(null); setError(''); setNotice(''); setBusy(false); setSavedAnswer(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [lesson.id, mode]);
  const ask = async (action) => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setNotice(''); setResponse(''); setEvidence(null);
    try {
      const result = await api(`/learning/placements/${lesson.id}/ai`, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ action, question: action === 'ask' ? question : '', slideId }),
      });
      if (!controller.signal.aborted) { setResponse(result.answer); setEvidence(result); setSavedAnswer(false); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  };
  const saveAnswer = async () => {
    if (saving.current || savedAnswer) return;
    saving.current = true; setSaveBusy(true);
    try {
      const references = (evidence?.sources || []).map(s=>`[${s.id}] ${s.label}`).join('\n');
      const result = await api('/learning/notes', { method: 'POST', body: JSON.stringify({ placement_id: lesson.id, title: `AI 整理 · ${lesson.title}`.slice(0, 120), body: `AI 生成内容，请对照课程资料核对。\n\n${response}${references?'\n\n课程来源：\n'+references:''}`, video_time: null, slide_id: null, deleted: false }) });
      onNote?.(result.item); setSavedAnswer(true);
      setNotice('已保存为本课时的私人笔记，可在学习笔记中查看。');
    } catch (e) { setError(e.message); } finally { saving.current = false; setSaveBusy(false); }
  };
  return (
    <section className="ls-ai">
      <h3>{mode === "summary" ? "学习整理助手" : "针对当前课时提问"}</h3>
      <p className="ls-muted">
        {!user ? '登录后可使用 AI 答疑与整理。' : cap?.available
          ? "仅依据当前课时的课件文字、已发布资料及自己的笔记回答，并标明课程来源。资料不足会明确告知；不会观看视频或自动识别图片、PPT/PDF 原件。点击后相关文字将发送至阿里云百炼，请勿包含敏感信息。"
          : cap?.reason || "正在检查 AI 服务…"}
      </p>
      {mode === "ask" ? (
        <>
          <textarea
            aria-label="向 AI 提问"
            maxLength={4000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="这一页讲了什么？"
          />
          <button
            className="ls-btn"
            disabled={!user || !cap?.available || cap.features?.ask===false || busy || saveBusy || !question.trim()}
            onClick={() => ask("ask")}
          >
            {cap?.features?.ask===false?'答疑已暂停':'发送问题'}
          </button>
        </>
      ) : (
        <div className="ls-actions">
          {[
            ["summary", "生成本节总结"],
            ["keypoints", "提取知识点"],
            ["notes", "整理我的笔记"],
            ["mindmap", "生成思维导图"],
            ["flashcards", "生成复习卡片"],
          ].map(([key, label]) => (
            <button
              disabled={!user || !cap?.available || cap.features?.[key]===false || busy || saveBusy}
              onClick={() => ask(key)}
              key={key}
            >
              {label}{cap?.available&&cap.features?.[key]===false?'（已暂停）':''}
            </button>
          ))}
        </div>
      )}
      {busy && <p role="status">AI 正在整理回答…</p>}
      {error && <p className="ai-error" role="alert">{error}</p>}
      {evidence?.coverage && (evidence.coverage.partial || evidence.coverage.imageOnlyPages>0) && <p className="ls-muted">本次仅依据可读文字{evidence.coverage.partial?'的部分片段':''}；{evidence.coverage.imageOnlyPages>0?`${evidence.coverage.imageOnlyPages} 页课件尚无文字，未参与回答。`:'并非完整课件总结。'}</p>}
      {evidence?.sources?.length>0 && <details className="ls-ai-sources"><summary>本次回答引用的课程资料（{evidence.sources.length}）</summary>{evidence.sources.map(s=><div key={s.id}><strong>[{s.id}] {s.label}</strong><p>{s.excerpt}{s.excerpt.length>=800?'…':''}</p></div>)}<p className="ls-muted">来源标记用于核对，不代表 AI 的解释一定正确。</p></details>}
      {response && <><Markdown body={response}/><div className="ai-result-actions"><button disabled={busy || saveBusy || savedAnswer} onClick={saveAnswer}>{savedAnswer ? '已保存至笔记' : saveBusy ? '保存中…' : '保存为私人笔记'}</button><button onClick={async () => { try { await navigator.clipboard.writeText(response); setNotice('已复制'); } catch { setError('复制失败，请手动选择文本。'); } }}>复制结果</button></div></>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

// Keep the same editor mounted when the mobile sheet is closed: drafts and autosave survive.
function ResponsiveNotes({ children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 700px)");
    const sync = () => {
      dialog.current.close();
      // Inline desktop notes must not steal focus or scroll the learner away
      // from the video when a responsive breakpoint changes.
      if (!mobile.matches) dialog.current.setAttribute("open", "");
    };
    sync();
    mobile.addEventListener("change", sync);
    return () => mobile.removeEventListener("change", sync);
  }, []);
  return (
    <div className="ls-notes-frame">
      <button
        className="ls-notes-open ls-primary"
        onClick={() => dialog.current.showModal()}
      >
        打开学习笔记 / AI 助手
      </button>
      <dialog
        className="ls-notes-dialog"
        ref={dialog}
        aria-label="学习笔记与 AI 助手"
      >
        <button
          className="ls-notes-close"
          onClick={() => dialog.current.close()}
        >
          收起笔记 ↓
        </button>
        {children}
      </dialog>
    </div>
  );
}
function LessonSurface({
  lesson,
  lessons,
  navigate,
  model,
  onProgress,
  footer,
  courseContext,
}) {
  const isCourse = lesson.kind === "course";
  useLearningFocus(false);
  const video = useRef(null),
    slideRef = useRef(null),
    [time, setTime] = useState(lesson.progress.video_time || 0),
    [tab, setTab] = useState(
      lesson.progress.current_prompt_id ? "file" : "slides",
    ),
    [message, setMessage] = useState("");
  const [materialFilter,setMaterialFilter]=useState(lesson.progress.current_prompt_id?'prompt':'all');
  const progress = useLessonProgress(lesson, Boolean(model.user), onProgress, video),
    p = progress.value;
  const [media, setMedia] = useState(lesson.config);
  const refreshedAt = useRef(0);
  const refreshMedia = async () => {
    if (Date.now() - refreshedAt.current < 5000) return media.video?.url;
    refreshedAt.current = Date.now();
    try {
      const fresh = await api(`/learning/placements/${lesson.id}`);
      setMedia(fresh.config);
      setMessage("媒体链接已刷新，播放位置和笔记保留。");
      return fresh.config.video?.url;
    } catch (e) {
      setMessage(e.message);
      throw e;
    }
  };
  const config = media,
    slide = config.slides.find((s) => s.id === p.slide_id) || config.slides[0],
    index = lessons.findIndex((l) => l.id === lesson.id);
  const updateTime = () => {
    const time = video.current.currentTime;
    setTime(time);
    const patch = { video_time: time };
    if (p.follow_video) {
      const mapping = config.mappings.find(
        (m) => m.start <= time && time < m.end,
      );
      if (mapping) patch.slide_id = mapping.slideId;
    }
    progress.change(patch);
  };
  const jump = (time, id) => {
    if (time !== null && video.current) {
      video.current.currentTime = time;
      setTime(time);
    }
    progress.change({
      ...(time !== null ? { video_time: time } : {}),
      ...(id ? { slide_id: id, follow_video: false } : {}),
    });
  };
  const follow = () => {
    const mapping = config.mappings.find(
      (m) => m.start <= time && time < m.end,
    );
    progress.change({
      follow_video: true,
      ...(mapping ? { slide_id: mapping.slideId } : {}),
    });
  };
  const go = (lesson) => navigate(lessonLink(lesson));
  const complete = async () => {
    const previous = p.completed_at;
    progress.change({ completed_at: new Date().toISOString() });
    if (await progress.save()) {
      setMessage("本节学习已完成，实践完成不等于产品已上线。");
      const next = lessons[index + 1];
      if (
        next &&
        (lesson.kind === "course" || next.stage_id === lesson.stage_id)
      )
        navigate(lessonLink(next));
    } else progress.change({ completed_at: previous });
  };
  const materialTabs = { file: "资料", tasks: "实践" };
  return (
    <section
      className={`ls-page cl-study-page cl-course-page ${isCourse ? "" : "cl-project-page"}`}
    >
      <StudyColumns
        className="ls-layout cl-course-layout"
      >
        <DirectorySlot inline>
          <CourseDirectory
            course={
              courseContext?.course || {
                title: lesson.owner_title,
                slug: lesson.owner_slug,
              }
            }
            lessons={lessons}
            chapters={courseContext?.chapters}
            currentId={lesson.id}
            onSelect={go}
            navigate={navigate}
            context={courseContext}
            related={isCourse ? lesson.relatedLessons || [] : []}
            files={[
              ...(config.ppt
                ? [
                    {
                      id: "ppt",
                      name: config.ppt.original_name,
                      url: config.ppt.url,
                      size: config.ppt.size_bytes,
                    },
                  ]
                : []),
              ...lesson.materials
                .filter((m) => safeResourceUrl(m.resource_url))
                .map((m) => ({
                  id: m.library_id,
                  name: m.title,
                  url: m.resource_url,
                  size: m.asset?.size_bytes,
                })),
            ]}
          />
        </DirectorySlot>
        <main className="ls-reading">
          <header className="ls-heading cl-lesson-heading">
            <div>
              <p>
                {lesson.owner_title}　›　{lesson.chapter}
              </p>
              <h1>{lesson.title}</h1>
              <p>{lesson.subtitle}</p>
            </div>
            <div className="ls-actions">
              <button
                disabled={index <= 0}
                onClick={() => go(lessons[index - 1])}
              >
                ← 上一节
              </button>
              <button
                disabled={index === lessons.length - 1}
                onClick={() => go(lessons[index + 1])}
              >
                下一节 →
              </button>
            </div>
          </header>
          {config.video ? (
            <LearningVideoPlayer videoRef={video} source={config.video.url} subtitle={config.subtitle?.url} title={lesson.title} resumeTime={p.video_time}
              onTimeUpdate={updateTime} onDuration={duration => progress.change({video_duration: duration})}
              onSave={() => progress.save()} onRefresh={refreshMedia} saveState={model.user ? progress.state : '登录后保存进度'} />
          ) : (
            <div className="cl-video-empty">
              <strong>本课时暂无视频</strong>
              <p>可阅读下方课件与资料。</p>
            </div>
          )}
          <section className="ls-panel ls-courseware-panel">
            <div className="ls-tabs">
              <button
                aria-pressed={tab === "slides"}
                onClick={() => setTab("slides")}
              >
                课件
              </button>
              {Object.entries(materialTabs).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={tab === key || (key === "tasks" && tab === "operations")}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {["tasks", "operations"].includes(tab) && <div className="ls-study-subtabs" role="group" aria-label="实践内容">
              <button aria-pressed={tab === "tasks"} onClick={() => setTab("tasks")}>实践清单</button>
              <button aria-pressed={tab === "operations"} onClick={() => setTab("operations")}>操作步骤与成果</button>
            </div>}
            {tab === "slides" ? (
              <>
                <div className="ls-actions">
                  <button
                    onClick={() =>
                      p.follow_video
                        ? progress.change({ follow_video: false })
                        : follow()
                    }
                  >
                    {p.follow_video ? "✓ 跟随视频" : "恢复跟随视频"}
                  </button>
                  {!p.follow_video && <small>自由浏览模式</small>}
                </div>
                {slide ? (
                  <>
                    <div className="ls-slide-view">
                      <nav className="ls-thumbnails" aria-label="课件缩略图">
                        {config.slides.map((s, i) => (
                          <button
                            key={s.id}
                            aria-label={`第 ${i + 1} 页`}
                            aria-pressed={s.id === slide.id}
                            onClick={() =>
                              progress.change({
                                slide_id: s.id,
                                follow_video: false,
                              })
                            }
                          >
                            <img src={s.asset?.url} alt={`第 ${i + 1} 页`} />
                          </button>
                        ))}
                      </nav>
                      <div ref={slideRef} className="ls-slide-canvas">
                        <img
                          src={slide.asset?.url}
                          alt={
                            slide.text ||
                            `课件第 ${config.slides.indexOf(slide) + 1} 页`
                          }
                        />
                      </div>
                    </div>
                    <div className="ls-actions">
                      <button
                        onClick={() =>
                          slideRef.current
                            .requestFullscreen?.()
                            .catch(() => setMessage("此浏览器暂不支持课件全屏"))
                        }
                      >
                        全屏课件
                      </button>
                      <button
                        disabled={config.slides.indexOf(slide) === 0}
                        onClick={() =>
                          progress.change({
                            slide_id:
                              config.slides[config.slides.indexOf(slide) - 1]
                                .id,
                            follow_video: false,
                          })
                        }
                      >
                        ←
                      </button>
                      <span>
                        {config.slides.indexOf(slide) + 1} /{" "}
                        {config.slides.length}
                      </span>
                      <button
                        disabled={
                          config.slides.indexOf(slide) ===
                          config.slides.length - 1
                        }
                        onClick={() =>
                          progress.change({
                            slide_id:
                              config.slides[config.slides.indexOf(slide) + 1]
                                .id,
                            follow_video: false,
                          })
                        }
                      >
                        →
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="ls-muted">本节暂无逐页课件。</p>
                )}
                {config.ppt && (
                  <a
                    className="ls-btn"
                    href={config.ppt.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    下载 {config.ppt.original_name}（
                    {Math.ceil(config.ppt.size_bytes / 1024)} KB）
                  </a>
                )}
              </>
            ) : tab === "tasks" ? (
              <>
                <h3>完成本节实践</h3>
                {config.tasks.map((task) => (
                  <label className="ls-task" key={task.id}>
                    <input
                      type="checkbox"
                      disabled={
                        !model.user ||
                        (Boolean(p.completed_at) && task.required)
                      }
                      checked={p.tasks.includes(task.id)}
                      onChange={(e) =>
                        progress.change({
                          tasks: e.target.checked
                            ? [...p.tasks, task.id]
                            : p.tasks.filter((id) => id !== task.id),
                        })
                      }
                    />
                    <span>
                      {task.title}
                      {task.required ? "（必需）" : ""}
                    </span>
                  </label>
                ))}
                {!config.tasks.length && <p>本节没有配置实践清单。</p>}
                <div className="ls-actions">
                  <button
                    onClick={() => progress.save()}
                    disabled={!model.user}
                  >
                    保存实践进度
                  </button>
                  <button onClick={() => navigate("/projects")}>
                    前往实战项目 →
                  </button>
                </div>
              </>
            ) : tab === "operations" ? (
              <>
                {config.expectedResult && (
                  <section className="ls-material">
                    <h3>预期成果</h3>
                    <Markdown body={config.expectedResult} />
                    {config.result && (
                      <img
                        className="ls-result-image"
                        src={config.result.url}
                        alt="本节预期成果示例"
                      />
                    )}
                  </section>
                )}
                {config.operations.map((op, i) => (
                  <article className="ls-material" key={op.id}>
                    <h3>
                      {i + 1}. {op.title}
                    </h3>
                    <Markdown body={op.body} />
                  </article>
                ))}
                {!config.operations.length && <p>本节暂无操作步骤。</p>}
              </>
            ) : (
              <>
                {tab === "file" && <div className="ls-project-material-filters ls-study-subtabs" role="group" aria-label={isCourse ? "课程资料分类" : "项目资料分类"}>
                  {[["all","全部资料"],["article","图文"],["code","代码"],["prompt","Codex 提示词"],["files","附件"]].map(([key,label])=><button key={key} aria-pressed={materialFilter===key} onClick={()=>setMaterialFilter(key)}>{label}</button>)}
                </div>}
                {studyMaterials(lesson.materials,tab,true,materialFilter)
                  .map((m) => (
                    <article className="ls-material" key={m.library_id}>
                      {m.role === "prompt" && <small className="ls-prompt-label">Codex 提示词</small>}
                      <h3>
                        {m.title}
                        {m.promptVersion ? ` · v${m.promptVersion}` : ""}
                      </h3>
                      {m.asset && (
                        <small className="ls-muted">
                          {m.asset.original_name} · {m.asset.mime_type} ·{" "}
                          {Math.ceil(m.asset.size_bytes / 1024)} KB
                        </small>
                      )}
                      {["code", "prompt"].includes(m.role) ? (
                        <>
                          <pre>
                            <code>{m.body}</code>
                          </pre>
                          <button
                            className="ls-btn"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(m.body)
                                .then(() => {
                                  setMessage("已复制");
                                  if (m.role === "prompt") {
                                    progress.change({
                                      current_prompt_id: m.library_id,
                                    });
                                    progress.save();
                                  }
                                })
                                .catch(() =>
                                  setMessage("复制失败，请手动选择正文复制"),
                                )
                            }
                          >
                            复制{m.role === "prompt" ? " Prompt" : "代码"}
                          </button>
                        </>
                      ) : (
                        <Markdown body={m.body} />
                      )}
                      {safeResourceUrl(m.resource_url) && (
                        <div className="ls-actions">
                          <a
                            className="ls-btn"
                            href={safeResourceUrl(m.resource_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            打开 / 下载资料
                          </a>
                        </div>
                      )}
                    </article>
                  ))}
                {!studyMaterials(lesson.materials,tab,true,materialFilter).length && <p className="ls-muted">本节暂无此类资料。</p>}
              </>
            )}
          </section>
          {!isCourse && lesson.relatedLessons?.length > 0 && (
            <section className="ls-panel">
              <h3>关联课程与实战</h3>
              {lesson.relatedLessons.map((l) => (
                <button
                  className="ls-lesson-row"
                  key={l.id}
                  onClick={() => go(l)}
                >
                  {l.locked ? "🔒 " : ""}
                  {l.owner_title} · {l.title} →
                </button>
              ))}
            </section>
          )}
          <div className="ls-actions">
            <button
              className="ls-primary"
              disabled={
                !model.user ||
                Boolean(p.completed_at) ||
                config.tasks.some((t) => t.required && !p.tasks.includes(t.id))
              }
              onClick={complete}
            >
              {p.completed_at ? "本节已完成" : "完成本节 →"}
            </button>
            <small role="status">{progress.blocked ? progress.state : message || progress.state}</small>
            {progress.blocked && <button onClick={() => window.location.reload()}>刷新以读取最新进度</button>}
          </div>
          {footer}
        </main>
        <ResponsiveNotes>
          <LessonNotes
            lesson={lesson}
            video={video}
            slide={slide}
            time={time}
            onJump={jump}
            user={model.user}
          />
        </ResponsiveNotes>
      </StudyColumns>
    </section>
  );
}

export function LessonWorkspace({
  id,
  lessons,
  model,
  navigate,
  onProgress,
  footer,
  courseContext,
}) {
  const [state, setState] = useState({ loading: true }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    api(`/learning/placements/${id}`)
      .then((lesson) => {
        if (active) setState({ lesson });
      })
      .catch((e) => {
        if (active) setState({ error: e.message, status: e.status });
      });
    return () => {
      active = false;
    };
  }, [id, model.user?.id, retry]);
  if (state.loading)
    return (
      <div className="ls-empty" role="status">
        正在加载课时与学习记录…
      </div>
    );
  if (!state.lesson)
    return (
      <section className="ls-empty" role="alert">
        <h2>暂时无法打开本节</h2>
        <p>{state.error}</p>
        <div className="ls-actions">
          <button onClick={() => setRetry((v) => v + 1)}>重试</button>
          <button
            onClick={() =>
              navigate(
                lessons.find((l) => l.id === id)?.kind === "course"
                  ? `/packs/${lessons.find((l) => l.id === id).owner_slug}`
                  : lessons.find((l) => l.id === id)
                    ? `/projects/${lessons.find((l) => l.id === id).owner_slug}`
                    : "/projects",
              )
            }
          >
            {state.status === 403 ? "查看详情与购买方式" : "返回目录"}
          </button>
        </div>
      </section>
    );
  return (
    <LessonSurface
      key={`${id}-${retry}`}
      lesson={state.lesson}
      lessons={lessons}
      model={model}
      navigate={navigate}
      onProgress={onProgress}
      footer={footer}
      courseContext={courseContext}
    />
  );
}
