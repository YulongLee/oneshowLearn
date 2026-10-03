// Monday-first calendar, using local noon to avoid DST/date-boundary drift.
export function calendarMonth(year, month) {
  const first = new Date(year, month, 1, 12);
  const count = new Date(year, month + 1, 0, 12).getDate();
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > count ? null : new Date(year, month, day, 12);
  });
}

export function learningEntries(library = [], recent = null) {
  // The API has a most-recent pack, not a lesson/timestamp history.
  // Never synthesize the four dated lesson rows in the visual reference.
  const ownedRecent = library.find(pack => pack.id === recent?.id);
  return ownedRecent ? [ownedRecent] : [];
}

export function recentStudyItems(library = [], entry = {}, projects = []) {
  const owned = new Set(library.map(course => course.id));
  const lessons = [...(entry.lessons || []).filter(lesson => owned.has(lesson.owner_id)), ...projects.filter(project => project.run).flatMap(project => (project.stages || []).flatMap(stage => stage.lessons || []))];
  return lessons.filter(lesson => !lesson.locked && lesson.progress?.version > 0)
    .sort((a, b) => String(b.progress.updated_at || '').localeCompare(String(a.progress.updated_at || ''))).slice(0, 5);
}
export function currentProject(projects = []) {
  return projects.find(project => project.run && project.progress?.percent < 100) || projects.find(project => project.run) || null;
}
// Personal product records are independent of course/project learning progress.
export function currentProductAchievement(items = []) {
  return items.filter(item => item.type === 'product' && !item.deletedAt)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}
export function phaseState(phase, ownedIds = []) {
  const items = (phase?.items || []).filter(item => ownedIds.includes(item.pack_id) && !item.locked);
  if (!items.length) return 'pending';
  if (items.every(item => item.progress === 'completed')) return 'completed';
  return items.some(item => item.progress) ? 'started' : 'ready';
}
export function watchPercent(lesson) {
  if (lesson.progress?.completed_at) return 100;
  const time = Number(lesson.progress?.video_time), duration = Number(lesson.progress?.video_duration);
  return duration > 0 && Number.isFinite(time) && Number.isFinite(duration) ? Math.min(100, Math.max(0, Math.round(time / duration * 100))) : 0;
}

// Catalog metadata may offer a preview, but it must never become an owned course.
export function workbenchSelection(library = [], entry = {}, recent = null) {
  const owned = library.find(c => c.id === recent?.id) || library.find(c => c.progressPercent > 0 && c.progressPercent < 100) || library.find(c => c.progressPercent < 100) || library[0];
  const course = owned || (entry.courses || []).find(c => c.id === entry.defaultCourseId) || null;
  const lessons = (entry.lessons || []).filter(l => l.kind !== 'project' && l.owner_id === course?.id);
  const readable = lessons.filter(l => !l.locked && (owned || l.is_preview));
  const lesson = [...readable].filter(l => l.progress?.version > 0 && !l.progress.completed_at)
    .sort((a,b) => String(b.progress.updated_at || '').localeCompare(String(a.progress.updated_at || '')))[0]
    || readable.find(l => !l.progress?.completed_at) || readable[0] || null;
  const completed = lessons.filter(l => l.progress?.completed_at).length;
  return {course, lesson, lessons, owned:Boolean(owned), completed, total:lessons.length,
    started:Boolean(lesson?.progress?.version > 0),
    finished:Boolean(lessons.length && completed === lessons.length),
    percent:lessons.length ? Math.round(completed / lessons.length * 100) : Math.min(100,Math.max(0,Number(owned?.progressPercent)||0))};
}

export function workbenchPhaseState(lessons, phase, currentLesson) {
  const items = lessons.filter(l => l.phase === phase);
  if (!items.length) return 'unconfigured';
  if (items.every(l => l.progress?.completed_at)) return 'completed';
  if (items.some(l => l.id === currentLesson?.id)) return currentLesson.progress?.version > 0 ? 'started' : 'current';
  if (items.some(l => l.progress?.version > 0)) return 'started';
  return 'pending';
}

export function sidebarCourseAccess(offer, model) {
  if (!model || model.error || (model.loading && !model.user)) return 'checking';
  if (!model.user) return 'purchase';
  if (['admin','editor'].includes(model.user.role)) return 'management';
  return offer?.productId && offer.slug && (model.library || []).some(c => c.slug === offer.slug) ? 'unlocked' : 'purchase';
}
