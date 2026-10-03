export function discoveryProgress(items = []) {
  return items.reduce((counts, item) => {
    const percent = Number(item.progress?.percent || 0);
    counts[percent >= 100 ? 'completed' : percent > 0 ? 'started' : 'pending']++;
    return counts;
  }, {started:0, completed:0, pending:0});
}

export function projectDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '待配置';
  return minutes < 60 ? `${minutes} 分钟` : `${Math.round(minutes / 60 * 10) / 10} 小时`;
}

export function currentProject(items = []) {
  return items.find(item => item.run && Number(item.progress?.percent || 0) < 100)
    || items.find(item => item.run) || null;
}

export function projectLearningSummary(project) {
  const lessons = (project?.stages || []).flatMap(stage => stage.lessons || []);
  const completed = lessons.filter(lesson => lesson.progress?.completed_at).length;
  const percent = lessons.length ? Math.round(completed / lessons.length * 100) : 0;
  const next = lessons.find(lesson => !lesson.locked && !lesson.progress?.completed_at)
    || lessons.find(lesson => !lesson.locked) || null;
  return {total:lessons.length, completed, percent, next};
}
