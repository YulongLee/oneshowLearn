export function courseEntryRoute(route) {
  route = route.replace(/\/+$/, "") || "/";
  const lesson = /^\/opc\/lessons\/([1-9]\d*)$/.exec(route);
  const course = /^\/opc\/course\/([^/]+)$/.exec(route);
  const phase = /^\/opc\/phase\/([1-5])$/.exec(route);
  let slug = null;
  if (course) {
    try {
      slug = decodeURIComponent(course[1]);
    } catch {
      slug = "";
    }
  }
  return {
    lessonId: lesson ? Number(lesson[1]) : null,
    slug,
    phase: phase ? Number(phase[1]) : null,
  };
}
// Both course entry points resume the same readable, unfinished learning record.
// Callers retain their own course/phase filters and explicit lesson links.
export function chooseContinueLesson(lessons = [], courses = []) {
  const recent = lessons
    .filter((l) => !l.locked && l.progress?.version > 0)
    .sort((a, b) =>
      (b.progress.updated_at || "").localeCompare(a.progress.updated_at || ""),
    );
  return (
    recent.find((l) => !l.progress.completed_at) ||
    lessons.find(
      (l) =>
        !l.locked &&
        !l.progress?.completed_at &&
        courses.some((c) => c.id === l.owner_id && c.entitled),
    ) ||
    lessons.find((l) => !l.locked && !l.progress?.completed_at) ||
    recent[0] ||
    lessons.find((l) => !l.locked) ||
    lessons[0] ||
    null
  );
}
export function chooseEntry(data, route = "/opc") {
  const { lessonId, slug, phase } = courseEntryRoute(route);
  const courses = data.courses || [],
    lessons = data.lessons || [],
    chapters = data.chapters || [];
  if (lessonId) {
    const lesson = lessons.find((l) => l.id === lessonId);
    return {
      course: courses.find((c) => c.id === lesson?.owner_id) || null,
      lesson: lesson || null,
      missing: !lesson,
      phase: null,
    };
  }
  const defaultCourse = slug === null ? courses.find(c=>c.id===data.defaultCourseId) : null;
  const chosenSlug = slug ?? defaultCourse?.slug ?? null;
  const available = lessons.filter(
    (l) =>
      (!phase || l.phase === phase) && (chosenSlug === null || l.owner_slug === chosenSlug),
  );
  const lesson = chooseContinueLesson(available, courses);
  const course =
    (chosenSlug !== null
      ? courses.find((c) => c.slug === chosenSlug)
      : courses.find((c) => c.id === lesson?.owner_id) ||
        (phase
          ? courses.find((c) =>
              chapters.some((ch) => ch.pack_id === c.id && ch.phase === phase),
            )
          : courses.find((c) => c.entitled) || courses[0])) || null;
  return { course, lesson, phase, missing: slug !== null && !course };
}
export function entryLessonPath(lesson) {
  return lesson.kind === "course"
    ? `/opc/lessons/${lesson.id}`
    : `/projects/${encodeURIComponent(lesson.owner_slug)}/workspace/${lesson.id}`;
}
