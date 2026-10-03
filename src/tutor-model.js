export const TUTOR_NOTE_PREFIX = '[AI 导师提问] ';
export const MAX_QUESTION_LENGTH = 4000;

// Leave IME confirmation and newline shortcuts to the textarea. keyCode 229
// also covers browsers that clear isComposing before the confirmation keydown.
export function handleTutorComposerKeyDown(event, send, composing = false) {
  const native = event.nativeEvent || event;
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || composing
    || event.isComposing || native.isComposing || native.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat && !native.repeat) send();
}

// Suggested questions, not CMS content or pre-written course answers.
export const TUTOR_FAQ = [
  {id:'course',title:'课程与资料',mode:'knowledge',questions:[
    {id:'needs',title:'如何明确产品需求和目标用户？',question:'课程资料中，如何明确产品需求和目标用户？请引用相关课件或资料。'},
    {id:'mvp',title:'如何确定第一个 MVP 的范围？',question:'课程资料中，如何确定第一个 MVP 的范围？请列出有资料依据的要点。'},
    {id:'validate',title:'做出产品后，应该如何验证？',question:'课程或项目资料中，做出产品后应该如何验证？请给出资料中的步骤并注明来源。'},
  ]},
  {id:'project',title:'项目开发',mode:'knowledge',questions:[
    {id:'codex',title:'如何用 Codex 开始开发项目？',question:'项目资料中，如何用 Codex 开始开发项目？有哪些可参考的 Prompt？请注明来源。'},
    {id:'deploy',title:'部署上线前需要检查什么？',question:'课程或项目资料中，部署上线前需要做哪些检查？请仅依据已发布资料回答。'},
    {id:'payment',title:'支付功能应该如何接入？',question:'课程或项目资料中，支付功能的接入流程是什么？缺少的内容请明确说明。'},
  ]},
  {id:'general',title:'思路与排错',mode:'general',questions:[
    {id:'debug',title:'代码报错了，如何开始排查？',question:'代码报错时应该如何开始排查？请先告诉我需要提供哪些报错信息、复现步骤和相关代码，不要假设你已经看过我的代码。'},
    {id:'idea',title:'如何把想法变成可执行的计划？',question:'我想把一个产品想法变成可执行的计划，请先问我三个关键问题来明确目标，不要替我假设项目背景。'},
    {id:'plan',title:'帮我安排一周的学习计划',question:'请帮我安排一周的 AI 产品开发学习计划。请先询问我的基础、目标和每天可投入时间。'},
  ]},
];

export function tutorHistory(messages, mode, courseId) {
  const history=[];let length=0;
  for(const message of [...messages].reverse()) {
    if(message.mode!==mode||message.courseId!==courseId)break;
    if(history.length>=8||length+message.content.length>36000)break;
    history.unshift({role:message.role,content:message.content});length+=message.content.length;
  }
  return history;
}

export function selectedLearningContext(library = [], recent, selectedId) {
  return library.find(pack => String(pack.id) === String(selectedId))
    || library.find(pack => pack.id === recent?.id) || library[0] || null;
}

export function tutorQuestions(notes = []) {
  return notes.filter(note => !note.deletedAt && note.title.startsWith(TUTOR_NOTE_PREFIX))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function questionNote(question, pack, product, id, updatedAt) {
  const text = question.trim();
  if (!text || text.length > MAX_QUESTION_LENGTH) throw new Error('请填写 1–4000 字的问题。');
  return {
    id,
    title: `${TUTOR_NOTE_PREFIX}${text.replace(/\s+/g, ' ').slice(0, 90)}`,
body: `${text}\n\n—— 提问时的上下文 ——\n课程：${pack?.title || '未选择课程'}\n学习进度：${pack ? `${pack.progressPercent || 0}%` : '暂无记录'}\n产品：${product?.name || '尚未创建'}\n\n状态：已记录问题，本次未调用 AI 或生成回答。`,
    updatedAt,
  };
}
