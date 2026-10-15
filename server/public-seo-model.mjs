// Shared, data-free route and metadata rules. Never derives identity from request headers.
export const PUBLIC_ORIGIN='https://oneshowlearn.com';
export const INDEX_ROBOTS='index, follow, max-image-preview:large';
export const PRIVATE_ROBOTS='noindex, nofollow';
export function trustedPublicOrigin(value=PUBLIC_ORIGIN){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Public origin must be a trusted HTTPS root');
  return u.origin;
}
export const publicCoursePath=slug=>'/course-offer?course='+encodeURIComponent(slug);
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const privatePages=new Map(Object.entries({
  '/app':'学习工作台','/login':'登录','/register':'注册','/forgot-password':'找回密码','/account':'设置中心',
  '/membership':'课程与价格','/tutor':'AI 导师','/tools':'AI 导师','/notes':'学习笔记','/favorites':'我的收藏','/achievements':'我的成果',
  '/community':'学习社区','/support':'帮助与售后','/plan':'学习计划','/certificates':'课程证书',
  '/paths':'学习路径','/opc':'AI OPC 学习路线','/projects':'实战项目','/resources':'资源中心','/courses':'学习课程',
  '/legal/terms':'用户协议','/legal/privacy':'隐私说明','/legal/purchase':'购买说明'
}));
const privateDynamic=/^\/(?:admin(?:\/[a-z0-9-]+)?|opc\/(?:phase\/[1-5]|lessons\/\d+)|paths\/[a-z0-9-]+|packs\/[a-z0-9-]+(?:\/content\/\d+)?|projects\/[a-z0-9-]+(?:\/(?:content\/\d+|workspace))?|learn\/[a-z0-9-]+(?:\/lessons\/\d+)?|certificates\/\d+)$/;
export function describePublicRoute(input,origin=PUBLIC_ORIGIN){
  origin=trustedPublicOrigin(origin);
  const raw=String(input||'/');
  // Reject encoded path separators/dot segments; don't canonicalize malformed paths into real pages.
  const path=raw.split(/[?#]/,1)[0];
  if(raw.length>4096||!raw.startsWith('/')||raw.startsWith('//')||/[\\\r\n\0]/.test(raw)||/%(?![a-f\d]{2})|%2f|%5c|%2e|%25/i.test(path)||/(?:^|\/)\.{1,2}(?:\/|$)/.test(path))return {kind:'missing',status:404,indexable:false,origin,title:'页面未找到 · OneShowLearn'};
  const u=new URL(raw,origin),pathname=u.pathname.replace(/\/$/,'')||'/';
  if(/^\/(?:api|uploads|assets)(?:\/|$)/.test(pathname)||/\.(?:js|css|map|png|jpe?g|webp|svg|ico|woff2?|pdf|pptx?|mp4|zip)$/i.test(pathname))return {kind:'excluded',origin};
  if(['/robots.txt','/sitemap.xml','/llms.txt'].includes(pathname))return {kind:pathname.slice(1),status:200,indexable:false,origin};
  if(pathname==='/')return {kind:'home',status:200,indexable:true,origin,canonical:origin+'/',title:'OneShowLearn｜AI 产品实战学习与 AI OPC 课程',description:'OneShowLearn 由 OneShowAiLab 出品，围绕产品机会、AI 开发、上线、商业化与运营增长，系统学习把想法变成产品的方法。'};
  if(pathname==='/course-offer'){
    const slugs=u.searchParams.getAll('course'),slug=slugs[0]||null;
    if(slugs.length>1||slug!==null&&(!slugPattern.test(slug)||slug.length>100))return {kind:'missing',status:404,indexable:false,origin,title:'课程未找到 · OneShowLearn'};
    // Payment-return pages stay private regardless of the valid course dimension.
    const paymentReturn=[...u.searchParams.keys()].some(k=>/order|payment|return|checkout|trade|payer|token|code/i.test(k));
    return {kind:'course',slug,status:200,indexable:!paymentReturn,origin,title:'课程介绍与目录 · OneShowLearn',description:'查看已发布课程目录、试听入口、当前价格和学习服务。',...(slug?{canonical:origin+publicCoursePath(slug)}:{})};
  }
  const name=privatePages.get(pathname);
  if(name||privateDynamic.test(pathname))return {kind:'private',status:200,indexable:false,origin,title:(name||'学习空间')+' · OneShowLearn',description:'OneShowLearn 个人学习空间。'};
  return {kind:'missing',status:404,indexable:false,origin,title:'页面未找到 · OneShowLearn',description:'查找课程介绍或返回 OneShowLearn 首页。'};
}
export const plainText=(value,max=180)=>String(value||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export const safeJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function documentMetadata(route,data,assets={}){
  const meta={...route,robots:route.indexable?INDEX_ROBOTS:PRIVATE_ROBOTS};
  if(route.kind==='course'&&!data?.course?.pack){meta.indexable=false;meta.robots=PRIVATE_ROBOTS;}
  if(route.kind==='course'&&data?.slug){
    meta.canonical=route.origin+publicCoursePath(data.slug);
    meta.title=plainText(data.course?.pack?.title,95)+'｜课程介绍与目录 · OneShowLearn';
    // The title/description refer to the visible catalogue, not undisclosed paid material.
    meta.description=plainText(`${data.course?.pack?.title||'课程'}：查看已发布章节与试听入口，学习服务和价格以当前页面为准。${data.course?.lessons?.some(l=>l.is_demo_media)?'当前演示内容与正式交付状态见课程说明。':''}`);
  }
  if(!meta.indexable){delete meta.canonical;return meta;}
  if(/^\/assets\/[\w.-]+\.(?:webp|png|jpe?g)$/.test(assets.image||''))meta.image=route.origin+assets.image;
  const org=route.origin+'/#organization',website=route.origin+'/#website',person=route.origin+'/#instructor-cody';
  const graph=[{'@type':'Organization','@id':org,name:'OneShowAiLab',url:route.origin+'/',...(/^\/assets\/[\w.-]+\.svg$/.test(assets.logo||'')?{logo:route.origin+assets.logo}:{})},
    {'@type':'WebSite','@id':website,name:'OneShowLearn',url:route.origin+'/',inLanguage:'zh-CN',publisher:{'@id':org}},
    {'@type':'WebPage','@id':meta.canonical+'#webpage',url:meta.canonical,name:meta.title,description:meta.description,inLanguage:'zh-CN',isPartOf:{'@id':website}}];
  if(route.kind==='home')graph.push({'@type':'Person','@id':person,name:'Cody老师',description:'OneShowAiLab 创始人，10 年以上 AI 算法行业经验，大模型算法专家。'});
  if(route.kind==='course'&&data?.course?.pack){
    const course={'@type':'Course','@id':meta.canonical+'#course',url:meta.canonical,name:plainText(data.course.pack.title,160),description:meta.description,provider:{'@id':org},inLanguage:'zh-CN'};
    const offer=data.offer,pack=data.course.pack;
    if(offer?.slug===data.slug&&offer.productId===pack.product_id&&Number.isSafeInteger(offer.priceCents)&&offer.priceCents>0)course.offers={'@type':'Offer',url:meta.canonical,price:(offer.priceCents/100).toFixed(2),priceCurrency:'CNY'};
    graph.push(course,{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'OneShowLearn',item:route.origin+'/'},{'@type':'ListItem',position:2,name:course.name,item:meta.canonical}]});
  }
  meta.schema={'@context':'https://schema.org','@graph':graph};return meta;
}
export function metadataHtml(meta){
  const esc=escapeHtml;
  return `<meta name="public-origin" content="${esc(meta.origin)}"/><title>${esc(meta.title)}</title><meta name="description" content="${esc(meta.description||'OneShowLearn AI 产品实战学习平台。')}"/><meta name="robots" content="${esc(meta.robots)}"/>`+
    (meta.canonical?`<link rel="canonical" href="${esc(meta.canonical)}"/><meta property="og:type" content="website"/><meta property="og:locale" content="zh_CN"/><meta property="og:site_name" content="OneShowLearn"/><meta property="og:title" content="${esc(meta.title)}"/><meta property="og:description" content="${esc(meta.description)}"/><meta property="og:url" content="${esc(meta.canonical)}"/><meta name="twitter:card" content="summary"/><meta name="twitter:title" content="${esc(meta.title)}"/><meta name="twitter:description" content="${esc(meta.description)}"/>`:'')+
    (meta.image?`<meta name="public-share-image" content="${esc(meta.image)}"/><meta property="og:image" content="${esc(meta.image)}"/><meta name="twitter:image" content="${esc(meta.image)}"/>`:'')+
    (meta.schema?`<script id="public-schema" type="application/ld+json">${safeJson(meta.schema)}</script>`:'');
}
