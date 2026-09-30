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
