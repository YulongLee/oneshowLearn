import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CaretDown,
  Check,
  Clock,
  DownloadSimple,
  FileText,
  LockKey,
  Play,
  Stack,
} from "@phosphor-icons/react";
import { LearningLayoutContext } from "./learning-layout-context.js";
import { safeResourceUrl } from "./opc-model.js";
import "./course-learning-space.css";

export function useLearningFocus(enabled = true) {
  const { host, setFocused } = useContext(LearningLayoutContext);
  useEffect(() => {
    setFocused(enabled);
    return () => setFocused(false);
  }, [setFocused, enabled]);
  return host;
}
export function DirectorySlot({ children, inline = false }) {
  const { host } = useContext(LearningLayoutContext);
  if (inline) return <InlineCourseDirectory>{children}</InlineCourseDirectory>;
  return host ? createPortal(children, host) : children;
}
function InlineCourseDirectory({ children }) {
  const ref = useRef(null);
  const [compact, setCompact] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const parent = ref.current.closest(".cl-study-page");
    const observer = new ResizeObserver(([entry]) =>
      setCompact(entry.contentRect.width <= 960),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  return (
    <details
      ref={ref}
      className="cl-inline-directory"
      data-compact={compact || undefined}
      open={!compact || expanded}
      onToggle={(e) => {
        if (compact) setExpanded(e.currentTarget.open);
      }}
    >
      <summary>
        <BookOpenText size={20} />
        <span>课程目录与资料</span>
        <CaretDown size={17} />
      </summary>
      {children}
    </details>
  );
}
const duration = (n) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;

export function CourseDirectory({
  course,
  lessons = [],
  chapters = [],
  currentId,
  onSelect,
  navigate,
  context,
  files = [],
  related = [],
  variant = "default",
}) {
  const isProject = lessons[0]?.kind === "project";
  const Footer = variant === 'rail' ? 'details' : 'div';
  const [tab, setTab] = useState("chapters"),
    [closed, setClosed] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});
  const progressLessons = context?.progressLessons || lessons;
  const completed = progressLessons.filter(
    (l) => l.progress?.completed_at,
  ).length;
  const percent = progressLessons.length
    ? Math.round((completed / progressLessons.length) * 100)
    : 0;
  const groups = chapters.length
    ? chapters
    : lessons.reduce((out, l) => {
        const id = l.chapter_id || l.stage_id;
        if (!out.some((g) => g.id === id)) out.push({ id, title: l.chapter });
        return out;
      }, []);
  useEffect(() => {
    const current = lessons.find((l) => l.id === currentId);
    if (current) {
      setClosed((v) => ({
        ...v,
        [current.chapter_id || current.stage_id]: false,
      }));
      const groupId = current.chapter_id || current.stage_id;
      if (lessons.filter(l => (l.chapter_id || l.stage_id) === groupId).findIndex(l => l.id === currentId) >= 5)
        setExpandedGroups(v => ({ ...v, [groupId]: true }));
    }
  }, [currentId]);
  return (
    <aside className={`cl-directory ${variant === "rail" ? "cs-directory" : ""}`} aria-label="课程学习目录">
      {variant === "rail" && <div className="cs-directory-progress"><div><h2>课程进度</h2><span>{completed} / {progressLessons.length} 节 <b>{percent}%</b></span></div><progress value={percent} max="100" aria-label="课程完成进度" /></div>}
      {isProject && (
        <button
          className="cl-return"
          onClick={() =>
            navigate(
              context?.returnPath ||
                (lessons[0]?.kind === "project"
                  ? `/projects/${course?.slug}`
                  : "/courses"),
            )
          }
        >
          <ArrowLeft size={17} />
          返回项目详情
        </button>
      )}
      {variant !== "rail" && <div className="cl-course-info">
        {(safeResourceUrl(course?.cover_url) || isProject) && (
          <span className="cl-course-cover">
            {safeResourceUrl(course?.cover_url) ? (
              <img src={course.cover_url} alt={course.title} />
            ) : (
              <>
                <BookOpenText size={28} />
                <span>Learn · Build · Grow</span>
              </>
            )}
          </span>
        )}
        <div>
          <strong>{course?.title || "学习课程"}</strong>
          <div className="cl-course-progress">
            <progress value={percent} max="100" aria-label="课程完成进度" />
            <small>{progressLessons.length ? `${percent}%` : "待发布"}</small>
          </div>
          <small>
            {progressLessons.length
              ? `已完成 ${completed} / ${progressLessons.length} 节`
              : "真实课时发布后显示目录"}
          </small>
        </div>
      </div>}
      {context?.courses?.length > 1 && (
        <label className="cl-course-picker">
          切换课程
          <select
            value={course?.slug || ""}
            onChange={(e) => context.onCourseChange(e.target.value)}
          >
            <option value="" disabled>
              选择课程
            </option>
            {context.courses.map((c) => (
              <option value={c.slug} key={c.id}>
                {c.title}
                {c.entitled ? "" : " · 课程介绍/试看"}
              </option>
            ))}
          </select>
        </label>
      )}
      {variant !== 'rail' && <div className="cl-directory-tabs" role="group" aria-label="课程侧栏内容">
        <button
          aria-pressed={tab === "chapters"}
          onClick={() => setTab("chapters")}
        >
          课程目录
        </button>
        <button aria-pressed={tab === "files"} onClick={() => setTab("files")}>
          课程资料
        </button>
      </div>}
      {tab === "chapters" ? (
        <div className="cl-chapters">
          {groups.map((g) => {
            const items = lessons.filter(
                (l) => (l.chapter_id || l.stage_id) === g.id,
              ),
              open =
                closed[g.id] === undefined
                  ? items.some((l) => l.id === currentId) ||
                    (!currentId && g.id === groups[0]?.id)
                  : !closed[g.id];
            return (
              <section key={g.id} className="cl-chapter">
                <button
                  className="cl-chapter-toggle"
                  aria-expanded={open}
                  onClick={() => setClosed((v) => ({ ...v, [g.id]: open }))}
                >
                  <strong>{g.title}</strong>
                  <small>
                    {items.filter((l) => l.progress?.completed_at).length}/
                    {items.length}
                  </small>
                  <CaretDown size={15} className={open ? "is-open" : ""} />
                </button>
                {open && (
                  <div>
                    {(variant === 'rail' && !expandedGroups[g.id] ? items.slice(0,5) : items).map((l) => (
                      <button
                        className="cl-lesson"
                        key={l.id}
                        aria-current={l.id === currentId ? "step" : undefined}
                        onClick={() => onSelect(l)}
                      >
                        <span
                          className={
                            "cl-lesson-icon " +
                            (l.progress?.completed_at ? "is-complete" : "")
                          }
                        >
                          {l.locked ? (
                            <LockKey size={15} />
                          ) : l.progress?.completed_at ? (
                            <Check size={15} />
                          ) : (
                            <Play
                              size={13}
                              weight={l.id === currentId ? "fill" : "regular"}
                            />
                          )}
                        </span>
                        <span title={l.title}>
                          {l.title}
                          {l.is_preview && <small>免费试看</small>}
                        </span>
                        {l.is_demo_media ? <small>演示</small> : l.duration_seconds > 0 && (
                          <time>{duration(l.duration_seconds)}</time>
                        )}
                      </button>
                    ))}
                    {variant === 'rail' && items.length > 5 && <button className="cs-show-more" onClick={()=>setExpandedGroups(v=>({...v,[g.id]:!v[g.id]}))}>{expandedGroups[g.id] ? '收起部分课时' : `展开更多（${items.length-5} 节）`} <CaretDown size={13}/></button>}
                    {!items.length && (
                      <p className="cl-directory-hint">本章课时待发布</p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          {!groups.length && (
            <div className="cl-directory-empty">
              <BookOpenText size={26} />
              <strong>课程目录待发布</strong>
              <p>
                发布章节与课时后，
                <br />
                即可在这里继续学习。
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="cl-directory-files">
          <p>当前课时的配套资料</p>
          {files
            .filter((f) => safeResourceUrl(f.url))
            .map((f, i) => (
              <a
                key={f.id || i}
                href={safeResourceUrl(f.url)}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={17} />
                <span>
                  {f.name}
                  <small>
                    {f.size ? `${Math.ceil(f.size / 1024)} KB` : "在线资料"}
                  </small>
                </span>
                <DownloadSimple size={16} />
              </a>
            ))}
          {!files.length && (
            <p className="cl-directory-hint">
              {currentId ? "本节暂无下载资料。" : "选择已发布课时后查看附件。"}
            </p>
          )}
          {related.length > 0 && (
            <div className="cl-related-materials">
              <h4>关联课时</h4>
              {related.map((l) => (
                <button key={l.id} onClick={() => onSelect(l)}>
                  {l.owner_title} · {l.title}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {(isProject || tab === "files" || variant === 'rail') && (
        <Footer className="cl-directory-footer">
          {variant === 'rail' && <summary>更多课程选项</summary>}
          {context?.onRoadmap && (
            <button onClick={context.onRoadmap}>
              <Stack size={18} />
              查看完整学习路线
              <ArrowRight size={16} />
            </button>
          )}
          {context?.legacyCount > 0 && (
            <button onClick={context.onLegacy}>
              <FileText size={18} />
              查看已有章节资料
              <ArrowRight size={16} />
            </button>
          )}
          {isProject && (
            <button onClick={() => navigate("/app")}>
              <ArrowLeft size={16} />
              返回工作台
            </button>
          )}
          {context?.canManage && (
            <button onClick={() => navigate("/admin/learning")}>
              管理课程内容 <ArrowRight size={16} />
            </button>
          )}
        </Footer>
      )}
    </aside>
  );
}
