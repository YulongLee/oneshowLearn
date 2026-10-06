export const courseLearningPath = slug => `/learn/${encodeURIComponent(slug)}`;
export const courseOfferPath = slug => `/course-offer?course=${encodeURIComponent(slug)}`;
export function learningSlug(route) {
  const match = /^\/learn\/([^/]+)(?:\/lessons\/\d+)?\/?$/.exec(route);
  if (!match) return null;
  try { return decodeURIComponent(match[1]) === 'cursor' ? 'cursor-first-site' : decodeURIComponent(match[1]); }
  catch { return null; }
}
export function readingProgress(chapters = []) {
  const items = chapters.flatMap(chapter => chapter.items || []);
  const completed = items.filter(item => item.progress === 'completed').length;
  return {total:items.length, completed, percent:items.length ? Math.round(completed / items.length * 100) : 0};
}
export function nextReadingItem(chapters = []) {
  const items = chapters.flatMap(chapter => chapter.items || []).filter(item => !item.locked);
  return items.find(item => item.progress !== 'completed') || items[0] || null;
}
