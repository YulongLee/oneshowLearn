export function offerCurriculum(pack, lessons = []) {
  if (lessons.length) {
    const groups = new Map();
    for (const lesson of lessons) {
      const key = lesson.chapter_id;
      if (!groups.has(key)) groups.set(key, {id:key, title:lesson.chapter, items:[]});
      groups.get(key).items.push({...lesson, href:`/learn/${encodeURIComponent(pack.slug)}/lessons/${lesson.id}`});
    }
    return [...groups.values()];
  }
  return (pack.steps || []).map(step => ({id:step.id, title:step.title, items:(step.contents || []).map(item => ({...item, href:`/learn/${encodeURIComponent(pack.slug)}`}))}));
}
export function offerPrice(pack) {
  const value = pack?.product_price_cents ?? pack?.price_cents;
  return Number.isInteger(value) && value >= 0 ? value : null;
}
export const offerMoney = cents => cents === null ? '价格待配置' : new Intl.NumberFormat('zh-CN', {style:'currency', currency:'CNY', maximumFractionDigits: cents % 100 ? 2 : 0}).format(cents / 100);
