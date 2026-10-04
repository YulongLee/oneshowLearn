import {courseLearningPath} from './course-reader-model.js';

// Retain public catalogue fields only, never a learner's progress or private state.
export function sidebarCatalogue(entry={}) {
  return {
    courses:(entry.courses||[]).map(({id,slug,title})=>({id,slug,title})),
    lessons:(entry.lessons||[]).map(({id,kind,owner_id,chapter_id,is_preview})=>({id,kind,owner_id,chapter_id,is_preview}))
  };
}
export function sidebarOfferSummary(offer,catalogue={}) {
  const course=offer?.productId&&(catalogue.courses||[]).find(c=>c.slug===offer.slug);
  const lessons=course?(catalogue.lessons||[]).filter(l=>l.kind==='course'&&l.owner_id===course.id):[];
  const previews=lessons.filter(l=>l.is_preview&&Number.isSafeInteger(l.id)&&l.id>0);
  return {
    title:offer?.slug==='ai-opc-product-company'?'AI OPC 完整课程':course?.title||'完整课程',
    chapters:new Set(lessons.map(l=>l.chapter_id).filter(Boolean)).size,
    lessons:lessons.length,
    previews:previews.length,
    previewPath:previews.length?`${courseLearningPath(course.slug)}/lessons/${previews[0].id}`:null
  };
}
