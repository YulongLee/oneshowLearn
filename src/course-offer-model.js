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

// Rights come from the active server offer, never a course title or a displayed price.
export function offerScope(pack, offer) {
  const includesProjects = Boolean(pack?.product_id && offer?.productId === pack.product_id && offer.includesPublishedProjects === true);
  return {
    includesProjects,
    course: '单次购买所选课程，不自动续费。用购买账号学习已发布的视频、课件与配套资料。',
    projects: includesProjects
      ? '完整课程一次购买，包含平台已发布的配套实战项目与授权学习资料。'
      : '所选课程的实战项目范围，请查看对应课程及购买与服务说明。',
    support: 'AI 导师按页面提示的功能与额度使用；会员群入口与加入方式在学习社区查看。',
  };
}
