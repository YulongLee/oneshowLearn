// Presentation only: permissions and actual retrieval scope remain server-side.
export function tutorStudyPosition(courseId, entry = {}) {
  if (!courseId) return null;
  const lessons = (entry.lessons || []).filter(l => l.kind === 'course' && String(l.owner_id) === String(courseId) && !l.locked);
  const recent = lessons.filter(l => l.progress?.version > 0).sort((a,b) => String(b.progress.updated_at || '').localeCompare(String(a.progress.updated_at || '')))[0];
  const lesson = recent || lessons.find(l => !l.progress?.completed_at) || lessons[0];
  if (!lesson) return null;
  const chapter = (entry.chapters || []).find(c => c.id === lesson.chapter_id && String(c.pack_id) === String(courseId));
  return {lesson, chapter, recent:Boolean(recent)};
}
const phaseQuestions = {
  1:['OPC 和自由职业有什么区别？','怎样判断一个产品想法值得做？'],
  2:['如何把需求拆成可开发的 MVP？','帮我梳理产品开发的下一步'],
  3:['产品上线前需要检查哪些事项？','帮我梳理上线检查步骤'],
  4:['一次性购买和订阅有什么区别？','怎样验证产品的商业化方案？'],
  5:['如何判断产品增长是否有效？','帮我梳理用户反馈的验证步骤'],
};
export function tutorStarterQuestions(position) {
  const [explain,practice] = phaseQuestions[position?.lesson?.phase] || ['如何理解课程中的核心概念？','怎样把课程知识用到自己的产品？'];
  const subject = position?.chapter?.title || position?.lesson?.title;
  const context = subject ? `我正在学习“${subject}”。` : '';
  const grounded = question => `${context}${question}请依据当前范围内可访问的已发布文字资料回答，并注明来源；资料没有涉及时请明确说明。`;
  return [
    {title:'解释课程难点',description:explain,question:grounded(explain),mode:'knowledge',icon:'book'},
    {title:'整理学习重点',description:subject?'梳理本章的核心知识':'梳理当前课程的核心知识',question:grounded(subject?'请梳理这一章的核心知识和容易混淆的概念。':'请先询问我想整理哪一章，再梳理学习重点。'),mode:'knowledge',icon:'note'},
    {title:'指导产品验证',description:practice,question:grounded(practice),mode:'knowledge',icon:'idea'},
    {title:'排查开发问题',description:'描述报错，逐步找到原因',question:'请帮我排查开发问题，先问我技术栈、完整报错、复现步骤和已经尝试的方法。不要假设你已经看过或执行过我的代码。',mode:'general',icon:'code'},
  ];
}
export function tutorScopeCopy(mode, course, courseId) {
  if (mode === 'web') return {label:'当前回答模式',title:'公开网络搜索',note:'仅发送问题与联网对话，不附带私人课程或产品资料。'};
  if (mode === 'general') return {label:'当前回答模式',title:'通用建议',note:'基于你描述的问题提供建议，不作为课程资料结论。'};
  if (courseId && !course) return {label:'当前学习范围',title:'历史课程 · 当前不可选',note:'原对话记录保留，请选择可访问课程或全部资料后再提问。'};
  return {label:'当前学习范围',title:course?.title || '全部可访问资料',note:course?'检索本课程可访问的已发布文字资料，不限于最近学习章节。':'检索可访问的课程与项目文字资料，不会自动读取私人笔记。'};
}
export function tutorRecentConversations(items = [], activeId = '') {return items.filter(item => item.id && item.id !== activeId).slice(0,2);}
export function tutorConversationDate(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ','T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit'}).format(date);
}
