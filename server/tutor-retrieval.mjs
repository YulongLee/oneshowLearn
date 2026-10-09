import {row, rows} from './db.mjs';
import {placement, canReadPlacement, stageAccessIssue, courseAccess} from './learning-model.mjs';
import {isCourseOverview} from './tutor-intent.mjs';

import {TUTOR_INSUFFICIENT} from './tutor-grounding.mjs';
export {TUTOR_INSUFFICIENT} from './tutor-grounding.mjs';

// Live CMS text only: no public file URLs are fetched and no user notes are indexed.
// Re-evaluate publication, entitlement and project stage access on every query.
export function tutorDocuments(user, courseId = null) {
  const docs = [];
  let partial = false, remaining = 5000000;
  const add = (doc) => {
    if (!doc.text?.trim()) return;
    if (docs.length >= 5000 || remaining <= 0) { partial = true; return; }
    const text = doc.text.slice(0,remaining);
    if(text.length<doc.text.length)partial=true;
    remaining-=text.length;docs.push({...doc,text});
  };
  for (const candidate of rows("SELECT id FROM lesson_placements WHERE status='published' ORDER BY id")) {
    const p = placement(candidate.id);
    if (!canReadPlacement(user, p) || stageAccessIssue(user, p)) continue;
    if (courseId && (p.kind !== 'course' || p.owner_id !== courseId)) continue;
    const base = {placementId: p.id, lessonTitle: p.title, ownerTitle: p.owner_title,
      href: p.kind === 'course' ? `/learn/${encodeURIComponent(p.owner_slug)}/lessons/${p.id}` : `/projects/${encodeURIComponent(p.owner_slug)}/workspace/${p.id}`};
    if(!p.config.isDemoMedia)p.config.slides.forEach((s, i) => add({...base, key: `p${p.id}:s${s.id}`, label: `${p.owner_title} · ${p.title} · 课件第 ${i+1} 页`, page: i+1, slideId: s.id, text: s.text}));
    const materials = rows(`SELECT m.library_id id,m.role,l.title,l.body,r.title revision_title,r.body revision_body,r.version
      FROM lesson_materials m JOIN content_library l ON l.id=m.library_id AND l.status='published'
      LEFT JOIN lesson_prompt_versions v ON v.placement_id=m.placement_id AND v.library_id=m.library_id
      LEFT JOIN prompt_revisions r ON r.id=v.revision_id
      WHERE m.placement_id=? ORDER BY m.sort_order,m.library_id`, [p.id]);
    for (const m of materials) {
      const pinned = m.role === 'prompt' && m.version;
      add({...base, key: `p${p.id}:m${m.id}`, materialId: m.id,
        label: `${p.owner_title} · ${p.title} · ${pinned ? m.revision_title : m.title}${pinned ? `（Prompt v${m.version}）` : ''}`,
        text: pinned ? m.revision_body : m.body});
    }
  }
  // Include the existing document-first course library, without widening permissions.
  const access = new Map();
  for (const item of rows(`SELECT ci.id,ci.is_preview,pp.id pack_id,pp.slug,pp.title pack_title
    FROM published_content_items ci JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published'
    JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published'
    JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
    WHERE ci.status='published' ${courseId ? 'AND pp.id=?' : ''} ORDER BY ci.id`, courseId ? [courseId] : [])) {
    if (!access.has(item.pack_id)) access.set(item.pack_id, courseAccess(user, item.pack_id));
    if (!item.is_preview && !access.get(item.pack_id)) continue;
    const content = row('SELECT title,body FROM published_content_items WHERE id=?', [item.id]);
    add({key: `c${item.id}`, contentId: item.id, ownerTitle: item.pack_title,
      label: `${item.pack_title} · ${content.title}`, text: content.body, href: `/learn/${encodeURIComponent(item.slug)}`});
  }
  return {docs, partial};
}

const stop = new Set(['the','a','is','to','of','and','in','it','this','that','please','如何','什么','怎么','这个','那个','帮我','请问','一下','哪些','可以','是否','为什么','资料','课程','学习','总结','解释']);
export function retrievalTerms(text) {
  const tokens = [];
  const cleaned = text.toLowerCase().replace(/请帮我|告诉我|请问|如何|怎么|什么|这个|那个|一下|是否|为什么|可以/g, ' ');
  for (const word of cleaned.match(/[a-z0-9_+.#-]{2,}|[\p{Script=Han}]+/gu) || []) {
    if (/\p{Script=Han}/u.test(word)) {
      for (let i=0; i<word.length-1; i++) if (!stop.has(word.slice(i,i+2))) tokens.push(word.slice(i,i+2));
    } else if (!stop.has(word)) tokens.push(word);
  }
  return tokens;
}

export function rankTutorDocuments(docs, question, history = [], selectedCourse = false) {
  // Use only a previous user question for explicit follow-ups, never assistant text.
  const followup = /^(那|它|这一步|这个步骤|继续|再详细|上述|上面|其中)/.test(question.trim());
  const previous = followup ? [...history].reverse().find(m => m.role === 'user')?.content.slice(0,1200) || '' : '';
  const terms = [...new Set(retrievalTerms(`${previous} ${question}`))].slice(0,128);
  const chunks = []; let partial = false;
  for (const doc of docs) {
    for (let offset=0; offset<doc.text.length; offset+=850) {
      if (chunks.length >= 12000) { partial = true; break; }
      const text = doc.text.slice(offset, offset+1000);
      const words = retrievalTerms(text), counts = new Map();
      words.forEach(t => counts.set(t, (counts.get(t)||0)+1));
      chunks.push({...doc, text, offset, counts, length: words.length, titleTerms: new Set(retrievalTerms(doc.label))});
      if (offset+1000 >= doc.text.length) break;
    }
    if (chunks.length >= 12000) { partial = true; break; }
  }
  const avg = chunks.reduce((sum,c) => sum+c.length,0) / (chunks.length||1) || 1;
  const df = new Map(terms.map(term => [term, chunks.filter(c => c.counts.has(term)).length]));
  for (const c of chunks) c.score = terms.reduce((score,term) => {
    const tf = c.counts.get(term)||0, idf = Math.log(1+(chunks.length-(df.get(term)||0)+.5)/((df.get(term)||0)+.5));
    return score + (tf ? idf * tf * 2.2 / (tf+1.2*(.25+.75*c.length/avg)) : 0) + (c.titleTerms.has(term) ? .4 : 0);
  },0);
  const overview = selectedCourse && isCourseOverview(question);
  const ranked = chunks.filter(c => c.score>0 || overview).sort((a,b) => b.score-a.score);
  const selected = [], docCount = new Map(), texts = new Set();
  // An overview first represents distinct documents, then uses second chunks.
  // Topic queries retain their original score order and two-chunk allowance.
  for (const allowance of overview?[1,2]:[2]) for (const chunk of ranked) {
    if (selected.length>=8) break;
    if ((docCount.get(chunk.key)||0)>=allowance || texts.has(chunk.text)) continue;
    texts.add(chunk.text); docCount.set(chunk.key,(docCount.get(chunk.key)||0)+1);
    const {counts,length,titleTerms,score,...source} = chunk;
    selected.push({...source,id:`S${selected.length+1}`});
    if (selected.length>=8) break;
  }
  // A bounded overview must not imply that every document was represented.
  partial ||= Boolean(overview && docCount.size < docs.length);
  return {sources:selected, retrieval:{method:overview?'course-overview':'keyword-bm25',documents:docs.length,chunks:chunks.length,matched:ranked.length,included:selected.length,partial}};
}

export function retrieveTutorEvidence(user, question, history, courseId) {
  const {docs,partial} = tutorDocuments(user,courseId);
  const result = rankTutorDocuments(docs,question,history,Boolean(courseId));
  result.retrieval.partial ||= partial;
  return result;
}

export function verifyTutorAnswer(answer, sources) {
  const ids = [...new Set([...answer.matchAll(/\[S\d+(?:\s*[,，]\s*S\d+)*\]/g)].flatMap(m => m[0].match(/S\d+/g)))];
  if (!ids.length || ids.some(id => !sources.some(s => s.id === id)) || answer.trim() === TUTOR_INSUFFICIENT)
    return {answer:TUTOR_INSUFFICIENT,sources:[],grounded:false};
  return {answer,grounded:true,sources:ids.map(id => {
    const {text,key,...source}=sources.find(s => s.id===id);
    return {...source,excerpt:text};
  })};
}
