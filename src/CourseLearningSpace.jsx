import { useEffect, useRef, useState, useMemo } from "react";
import {
  BookOpenText,
  FileText,
  Play,
  Robot,
  Stack,
  ArrowRight,
  LockKey,
} from "@phosphor-icons/react";
import { api } from "./api.js";
import { canManage } from "./platforms.js";
import { chooseEntry, entryLessonPath } from "./course-entry-model.js";
import {
  CourseDirectory,
  DirectorySlot,
  useLearningFocus,
} from "./CourseLearningUi.jsx";
import { LessonWorkspace } from "./LessonWorkspace.jsx";
import { LearningRoutes } from "./LearningRoutes.jsx";
import "./learning-system.css";
import { CourseStudyFrame } from './CourseStudyFrame.jsx';
import {FavoriteButton} from './FavoriteButton.jsx';

function PendingLesson({
  selection,
  loading,
  error,
  retry,
  navigate,
  context,
  lessons,
  chapters,
  model,
}) {
  useLearningFocus(false);
  const [tab, setTab] = useState("课件");
  const { course, lesson, missing, phase } = selection;
  const status = loading
    ? "正在加载视频…"
    : error
      ? "视频暂时无法加载"
      : missing
        ? "课时未找到"
        : lesson?.locked
          ? "本节需要课程权限"
          : "视频待发布";
  return (
    <section className="ls-page cl-study-page cl-course-page cs-course-page">
      <CourseStudyFrame>
        <DirectorySlot inline>
          <CourseDirectory
            variant="rail"
            course={course}
            lessons={lessons}
            chapters={chapters}
            currentId={lesson?.id}
            onSelect={(l) => navigate(entryLessonPath(l))}
            navigate={navigate}
            context={context}
          />
        </DirectorySlot>
        <main className="ls-reading">
          <header className="cl-lesson-heading cs-pending-heading">
            <nav aria-label="学习位置">
              <span>学习课程</span>
              <span>›</span>
              <span>
                {course?.title || "课程目录"}
                {phase ? ` · 第 ${phase} 阶段` : ""}
              </span>
            </nav>
            <h1>{lesson?.title || course?.title || "学习课程"}</h1>
            {course&&<FavoriteButton model={model} navigate={navigate} reference={{kind:'course',id:course.id}} title={course.title}/>}
            <p>
              {lesson?.subtitle ||
                course?.subtitle ||
                "从课程目录选择课时开始学习。"}
            </p>
          </header>
          <section
            className="cl-video-empty"
            aria-busy={loading}
            role={error ? "alert" : undefined}
          >
            {lesson?.locked ? <LockKey size={32} /> : <Play size={32} />}
            <strong>{status}</strong>
            <p>
              {error ||
                (missing
                  ? "课时尚未发布或已归档，请选择其他课时。"
                  : lesson?.locked
                    ? "解锁对应课程后即可观看。"
                    : "发布后可在这里播放课程视频。")}
            </p>
            {error && <button onClick={retry}>重新加载</button>}
            {lesson?.locked && (
              <button onClick={() => navigate(`/packs/${course.slug}`)}>
                查看学习权限
              </button>
            )}
          </section>
          <section className="ls-panel cl-pending-materials ls-courseware-panel">
            <div className="ls-tabs">
              {["课件", "资料"].map(
                (t) => (
                  <button
                    key={t}
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>
            <div className="cl-courseware-empty">
              <FileText size={30} />
              <strong>
                {tab}
                {lesson?.locked ? "需要解锁" : "待发布"}
              </strong>
              <p>
                {tab === "课件"
                  ? "发布后可查看课件、翻页与下载。"
                  : "选择课时后查看对应内容。"}
              </p>
            </div>
          </section>
        </main>
        <aside className="ls-panel cs-assistant-panel"><div className="cs-assistant"><header><span className="cs-assistant-icon"><Robot size={26}/></span><h2>学习助手</h2></header><p className="ls-muted">{lesson?.locked ? '解锁本节后，可结合课程资料提问和整理笔记。' : '选择可访问的课时后，可结合课程资料提问和整理笔记。'}</p><button className="ls-btn" disabled>总结本节内容</button></div></aside>
      </CourseStudyFrame>
    </section>
  );
}

export function CourseLearningSpace({ route = "/opc", model, navigate }) {
  const [state, setState] = useState({ loading: true }),
    [retry, setRetry] = useState(0),
    [roadmapOpen, setRoadmapOpen] = useState(route === "/paths");
  const roadmap = useRef(null);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    Promise.all([
      api("/learning/entry"),
      api("/opc/curriculum").catch((e) => ({ phases: [], error: e.message })),
    ])
      .then(([data, curriculum]) => {
        if (active)
          setState({ data, entryData: data, curriculum, loading: false });
      })
      .catch((e) => {
        if (active) setState({ error: e.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [model.user?.id, retry]);
  useEffect(() => {
    setRoadmapOpen(route === "/paths");
  }, [route]);
  const data = state.data || { courses: [], chapters: [], lessons: [] };
  const selection = useMemo(
      // Keep the selected lesson stable while its progress changes during study.
      () => chooseEntry(state.entryData || {}, route),
      [route, state.entryData],
    ),
    { course, lesson, phase } = selection;
  const lessons = data.lessons.filter(
    (l) => l.owner_id === course?.id && (!phase || l.phase === phase),
  );
  const chapters = data.chapters.filter(
    (c) => c.pack_id === course?.id && (!phase || c.phase === phase),
  );
  const openRoadmap = () => {
    setRoadmapOpen(true);
    requestAnimationFrame(() =>
      roadmap.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const context = {
    canManage: canManage(model.user),
    courses: data.courses,
    course,
    chapters,
    progressLessons: data.lessons.filter((l) => l.owner_id === course?.id),
    returnPath: "/courses",
    legacyCount: course?.legacyCount || 0,
    onLegacy: () => navigate(`/learn/${encodeURIComponent(course.slug)}`),
    onCourseChange: (slug) =>
      navigate(`/opc/course/${encodeURIComponent(slug)}`),
    onRoadmap: openRoadmap,
  };
  const go = (path) => {
    const match = /^\/learn\/[^/]+\/lessons\/(\d+)$/.exec(path);
    navigate(match ? `/opc/lessons/${match[1]}` : path);
  };
  return (
    <div className="cl-learning-space">
      {!state.loading && !state.error && lesson && !lesson.locked ? (
        <LessonWorkspace
          id={lesson.id}
          lessons={lessons}
          model={model}
          navigate={go}
          courseContext={context}
          onProgress={(id, progress) =>
            setState((s) => ({
              ...s,
              data: {
                ...s.data,
                lessons: s.data.lessons.map((l) =>
                  l.id === id ? { ...l, progress } : l,
                ),
              },
            }))
          }
        />
      ) : (
        <PendingLesson
          selection={selection}
          lessons={lessons}
          chapters={chapters}
          loading={state.loading}
          error={state.error}
          retry={() => setRetry((v) => v + 1)}
          model={model}
          navigate={navigate}
          context={context}
        />
      )}
      {(roadmapOpen || route === "/paths") && (
        <details
          ref={roadmap}
          className="cl-roadmap-disclosure"
          open={roadmapOpen}
          onToggle={(e) => setRoadmapOpen(e.currentTarget.open)}
        >
          <summary>
            <Stack size={20} />
            <span>完整学习路线</span>
            <small>五阶段目标与产出</small>
          </summary>
          {roadmapOpen && (
            <LearningRoutes
              curriculum={state.curriculum?.phases || []}
              loading={state.loading}
              error={state.curriculum?.error || state.error}
              onRetry={() => setRetry((v) => v + 1)}
              navigate={navigate}
            />
          )}
        </details>
      )}
    </div>
  );
}
