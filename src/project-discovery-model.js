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
