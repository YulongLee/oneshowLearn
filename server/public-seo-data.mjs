import {row,rows} from './db.mjs';
import {SITE_DEFAULTS,currentPublicCopy} from './site-defaults.mjs';
import {HOME_CARDS} from './homepage-cards.mjs';
import {publicPaymentOffer} from './payment-configuration.mjs';

// Search documents are always an anonymous, published-only projection. This
// module accepts a route descriptor, never a request, user, cookie or token.
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const imageExtension=/\.(?:png|jpe?g|webp|gif|svg)$/i;
const routePattern=/^\/(?:login|register|app|membership|opc(?:\/phase\/[1-5])?|paths(?:\/[a-z0-9-]+)?|packs\/[a-z0-9-]+|projects(?:\/[a-z0-9-]+)?|resources|courses|notes|favorites|plan|tutor|community)$/;
const notFound=()=>Object.assign(new Error('公开课程不存在或尚未发布'),{status:404});
const text=(value,fallback='')=>typeof value==='string'?value:fallback;
const ids=value=>Array.isArray(value)?[...new Set(value.filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,40):[];
const route=(value,fallback)=>typeof value==='string'&&routePattern.test(value)?value:fallback;

// Covers are public decoration, not a way to expose signed/private attachments.
// Deliberately omit credentialed/query-bearing URLs rather than serializing a
// token into crawlable HTML. No URL in this module is fetched by the server.
export function publicSeoImage(value) {
  if(typeof value!=='string'||value.length>2000)return '';
  if(/^\/assets\/[\w/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(value)&&!value.includes('..'))return value;
  try {
    const url=new URL(value),pathname=decodeURIComponent(url.pathname),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
      (url.port&&url.port!=='443')||!imageExtension.test(pathname)||
      /(?:^|\/)\.\.(?:\/|$)|^\/(?:api|uploads)(?:\/|$)/i.test(pathname)||
      host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
      /^\d+(?:\.\d+){3}$/.test(host)||host.includes(':'))return '';
    return url.href;
  }catch{return '';}
}

const catalogueSql=`SELECT pp.id,pp.slug,pp.title,pp.subtitle,pp.description,pp.deliverable,
  pp.cover_url,pp.estimated_minutes,pp.price_cents,pp.currency,pp.status,pp.is_featured,
  pp.updated_at,lp.id path_id,lp.slug path_slug,lp.title path_title,
  p.id product_id,p.price_cents product_price_cents
  FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
  LEFT JOIN products p ON p.pack_id=pp.id AND p.status='active'
  WHERE pp.status='published' ORDER BY pp.is_featured DESC,pp.sort_order,pp.id`;
function publicCourses(){return rows(catalogueSql).filter(course=>slugPattern.test(course.slug)&&course.slug.length<=100)
  .map(course=>({...course,cover_url:publicSeoImage(course.cover_url)}));}
function courseSummary(course) {
  return {id:course.id,slug:course.slug,title:course.title,subtitle:course.subtitle,
    cover_url:course.cover_url,deliverable:course.deliverable,estimated_minutes:course.estimated_minutes,
    contentCount:row(`SELECT COUNT(*) n FROM published_content_items i
      JOIN project_steps s ON s.id=i.step_id AND s.status='published'
      WHERE s.pack_id=? AND i.status='published'`,[course.id]).n};
}
function publicLessons(packId=null) {
  return rows(`SELECT p.id,l.title,l.subtitle,p.chapter_id,p.is_preview,
    s.title chapter,pp.id owner_id,pp.slug owner_slug,pp.title owner_title,m.phase,
    json_extract(l.config,'$.isDemoMedia') is_demo_media,
    json_extract(l.config,'$.durationSeconds') duration_seconds
    FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id AND l.status='published'
    JOIN project_steps s ON s.id=p.chapter_id AND s.status='published'
    JOIN project_packs pp ON pp.id=s.pack_id AND pp.status='published'
    JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
    LEFT JOIN opc_stage_steps m ON m.step_id=s.id
    WHERE p.status='published' AND (? IS NULL OR pp.id=?)
    ORDER BY pp.sort_order,pp.id,s.sort_order,s.id,p.sort_order,p.id`,[packId,packId]).map(lesson=>({
      id:lesson.id,title:lesson.title,subtitle:lesson.subtitle,chapter_id:lesson.chapter_id,
      chapter:lesson.chapter,owner_id:lesson.owner_id,owner_slug:lesson.owner_slug,
      owner_title:lesson.owner_title,kind:'course',phase:lesson.phase,
      is_preview:Boolean(lesson.is_preview),locked:!lesson.is_preview,
      is_demo_media:Boolean(lesson.is_demo_media),
      duration_seconds:Number.isSafeInteger(lesson.duration_seconds)&&lesson.duration_seconds>=0?lesson.duration_seconds:0,
    }));
}
function publicEntry(catalog) {
  const courses=catalog.map(course=>({id:course.id,slug:course.slug,title:course.title,subtitle:course.subtitle,
    cover_url:course.cover_url,legacyCount:courseSummary(course).contentCount}));
  const chapters=rows(`SELECT s.id,s.pack_id,s.title,m.phase FROM project_steps s
    JOIN project_packs pp ON pp.id=s.pack_id AND pp.status='published'
    JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
    LEFT JOIN opc_stage_steps m ON m.step_id=s.id WHERE s.status='published'
    ORDER BY pp.sort_order,pp.id,s.sort_order,s.id`).map(chapter=>({...chapter}));
  const selected=row('SELECT course_id FROM learning_entry_settings WHERE id=1')?.course_id;
  return {courses,chapters,lessons:publicLessons(),defaultCourseId:courses.some(c=>c.id===selected)?selected:null};
}
function publicProject(project,catalog) {
  if(!slugPattern.test(project.slug)||project.slug.length>100)return null;
  const linked=rows('SELECT pack_id FROM practice_project_courses WHERE project_id=? ORDER BY sort_order,pack_id',[project.id])
    .map(link=>catalog.find(course=>course.id===link.pack_id)).filter(Boolean).map(courseSummary);
  if(!linked.length)return null;
  const tags=JSON.parse(project.tags);
  return {id:project.id,slug:project.slug,title:project.title,description:project.description,
    cover_url:publicSeoImage(project.cover_url),category:project.category,
    tags:Array.isArray(tags)?tags.filter(tag=>typeof tag==='string').slice(0,8):[],
    deliverable:project.deliverable,status:'published',courses:linked,courseIds:linked.map(course=>course.id)};
}
function publicSite(catalog) {
  const saved=row("SELECT published_json FROM site_pages WHERE key='public'");
  const published=currentPublicCopy(saved?.published_json?JSON.parse(saved.published_json):SITE_DEFAULTS.public);
  const defaults=SITE_DEFAULTS.public,site={};
  for(const key of ['eyebrow','title','description','ctaLabel','secondaryLabel','footerTitle','footerDescription'])
    site[key]=text(published[key],defaults[key]);
  site.image=publicSeoImage(published.image);
  site.ctaPath=route(published.ctaPath,defaults.ctaPath);
  site.secondaryPath=route(published.secondaryPath,defaults.secondaryPath);
  const courseIds=ids(published.courseIds),projectIds=ids(published.projectIds);
  site.courses=(courseIds.length?courseIds.map(id=>catalog.find(course=>course.id===id)).filter(Boolean):catalog.slice(0,4)).map(courseSummary);
  site.courseIds=site.courses.map(course=>course.id);
  const columns='id,slug,title,description,cover_url,category,tags,deliverable';
  const candidates=projectIds.length?projectIds.map(id=>row(`SELECT ${columns} FROM practice_projects WHERE id=? AND status='published'`,[id])).filter(Boolean):
    rows(`SELECT ${columns} FROM practice_projects p WHERE p.status='published' AND EXISTS(
      SELECT 1 FROM practice_project_courses pc JOIN project_packs pp ON pp.id=pc.pack_id AND pp.status='published'
      JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published' WHERE pc.project_id=p.id)
      ORDER BY p.sort_order,p.id LIMIT 4`);
  site.projects=candidates.map(project=>publicProject(project,catalog)).filter(Boolean);
  site.projectIds=site.projects.map(project=>project.id);
  const cards=Array.isArray(published.hotCourseCards)?published.hotCourseCards:HOME_CARDS;
  site.hotCourseCards=cards.slice(0,4).map(card=>{
    const course=Number.isSafeInteger(card.courseId)?catalog.find(course=>course.id===card.courseId):null;
    const summary=course?courseSummary(course):null;
    return {tag:text(card.tag),title:text(card.title),description:text(card.description),
      image:publicSeoImage(card.image),courseId:course?.id??null,
      course:summary?{id:summary.id,slug:summary.slug,contentCount:summary.contentCount}:null};
  });
  return site;
}
function publicCourse(course) {
  const steps=rows("SELECT id,title,summary FROM project_steps WHERE pack_id=? AND status='published' ORDER BY sort_order,id",[course.id])
    .map(step=>({...step,contents:rows("SELECT id,title,type,is_preview FROM published_content_items WHERE step_id=? AND status='published' ORDER BY sort_order,id",[step.id])
      .map(item=>({...item,locked:!item.is_preview}))}));
  return {pack:{...course,entitled:false,steps},lessons:publicLessons(course.id)};
}
function publicOffer(){
  const offer=publicPaymentOffer();
  return {productId:offer.productId,slug:offer.slug,priceCents:offer.priceCents,
    originalPriceCents:offer.originalPriceCents,includesPublishedProjects:offer.includesPublishedProjects,
    channels:offer.channels.map(channel=>({id:channel.id,label:channel.label,available:channel.available}))};
}

export function loadPublicSeoData(descriptor) {
  if(!descriptor||!['home','course'].includes(descriptor.kind))throw notFound();
  if(descriptor.kind==='course'&&descriptor.slug!=null&&
    (typeof descriptor.slug!=='string'||!slugPattern.test(descriptor.slug)||descriptor.slug.length>100))throw notFound();
  const catalog=publicCourses(),offer=publicOffer();
  if(descriptor.kind==='home')return {kind:'home',site:publicSite(catalog),offer,entry:publicEntry(catalog)};
  const offered=catalog.some(course=>course.slug===offer.slug)?offer.slug:null;
  const requested=descriptor.slug||offered||publicEntry(catalog).defaultCourseId;
  const course=typeof requested==='number'?catalog.find(course=>course.id===requested):
    requested?catalog.find(course=>course.slug===requested):catalog.find(course=>course.path_slug==='ai-product')||catalog[0];
  if(!course)throw notFound();
  return {kind:'course',catalog,offer,course:publicCourse(course),slug:course.slug};
}

export function listPublicSeoCourses() {
  return publicCourses().map(course=>({slug:course.slug,name:course.title,updatedAt:course.updated_at}));
}
