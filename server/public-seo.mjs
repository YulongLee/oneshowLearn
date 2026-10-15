import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {config} from './config.mjs';
import {loadPublicSeoData,listPublicSeoCourses} from './public-seo-data.mjs';
import {PUBLIC_ORIGIN,describePublicRoute,documentMetadata,metadataHtml,escapeHtml,safeJson,publicCoursePath,trustedPublicOrigin} from './public-seo-model.mjs';

export function robotsText(origin){return `User-agent: *\nDisallow: /api/\nDisallow: /uploads/\n\nSitemap: ${origin}/sitemap.xml\n`;}
export function sitemapXml(origin,courses){
  const urls=[origin+'/',...courses.map(c=>origin+publicCoursePath(c.slug))];
  // No guessed lastmod: catalogue timestamps include unpublised edits, and homepage code has no CMS publish timestamp.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(urls)].map(url=>`<url><loc>${escapeHtml(url)}</loc></url>`).join('')+'</urlset>\n';
}
export function llmsText(origin,courses){return `# OneShowLearn\n\n> OneShowAiLab 出品的 AI 产品实战学习平台。课程主理人为 Cody老师。\n\nAI OPC 学习路线围绕产品机会、AI 开发、上线、商业化与运营增长。以下是公开课程介绍与目录，价格、试听和内容交付状态以当前页面为准。\n\n## 公开入口\n\n- [OneShowLearn 首页](${origin}/): 平台、五阶段学习路线与讲师介绍。\n${courses.map(c=>`- [${String(c.name).replace(/[\[\]<>\r\n]/g,' ')}](${origin+publicCoursePath(c.slug)}): 已发布课程目录、试听入口与购买说明。`).join('\n')}\n\n本文件是公开导航摘要。个人账户、笔记、对话、订单和授权学习资料由平台访问权限管理。\n`;}
export function publicDocumentMiddleware(options={}){
  const origin=trustedPublicOrigin(options.origin||(/^https:\/\//.test(config.appUrl)?config.appUrl:PUBLIC_ORIGIN));
  const templatePath=options.templatePath||path.join(config.root,'dist/client/index.html');
  const renderPath=options.renderPath||path.join(config.root,'dist/render/public-render.mjs');
  const loadData=options.loadData||loadPublicSeoData,listCourses=options.listCourses||listPublicSeoCourses;
  // A process owns an immutable release. A new process is required for a new SSR/template pair.
  let shell,renderer,renderModule,manifest;
  const template=async()=>{if(!shell)shell=await readFile(templatePath,'utf8');return shell;};
  const render=async data=>{if(options.render)return options.render(data);if(!renderer){renderModule=await import(pathToFileURL(renderPath).href);renderer=renderModule.renderPublicPage;}return renderer(data);};
  const courseStyles=async()=>{
    if(options.render)return '';
    if(!manifest)manifest=JSON.parse(await readFile(path.join(path.dirname(templatePath),'.vite/manifest.json'),'utf8'));
    const css=new Set(),seen=new Set();
    const visit=key=>{if(seen.has(key))return;seen.add(key);const chunk=manifest[key];if(!chunk)return;for(const file of chunk.css||[])if(/^assets\/[\w.-]+\.css$/.test(file))css.add(file);for(const key of chunk.imports||[])visit(key);};
    const entry=Object.entries(manifest).find(([key,chunk])=>key==='src/CourseOffer.jsx'||chunk.name==='CourseOffer');
    if(!entry)throw Error('Course stylesheet manifest missing');
    visit(entry[0]);
    return [...css].map(file=>`<link rel="stylesheet" href="/${file}"/>`).join('');
  };
  return async(req,res,next)=>{
    if(!['GET','HEAD'].includes(req.method))return next();
    const route=describePublicRoute(req.originalUrl,origin);
    if(route.kind==='excluded')return next();
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':route.indexable?'index, follow':'noindex, nofollow'});
    try{
      if(route.kind==='robots.txt')return res.type('text/plain').send(robotsText(origin));
      if(route.kind==='sitemap.xml')return res.type('application/xml').send(sitemapXml(origin,await listCourses()));
      if(route.kind==='llms.txt')return res.type('text/plain').send(llmsText(origin,await listCourses()));
      const raw=await template();
      if(!/<div id="root"><\/div>/.test(raw))throw Error('SEO template must be an unrendered client shell');
      let data=null,body='';
      if(route.indexable&&(route.kind==='home'||route.kind==='course')){data=await loadData(route);body=await render(data);}
      const meta=documentMetadata(route,data,{image:renderModule?.publicShareImage,logo:renderModule?.publicLogo});
      res.set('X-Robots-Tag',meta.robots);
      const extraStyles=data?.kind==='course'?await courseStyles():'';
      const head=raw.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\s+name="(?:description|robots)"[^>]*>/gi,'').replace('</head>',metadataHtml(meta)+extraStyles+'</head>');
      const bootstrap=data?`<script id="public-bootstrap" type="application/json">${safeJson({...data,path:route.kind==='home'?'/':publicCoursePath(data.slug),origin})}</script>`:'';
      return res.status(route.status).type('html').send(head.replace('<div id="root"></div>',`<div id="root">${body}</div>${bootstrap}`));
    }catch(error){
      const status=error.status===404?404:503;
      res.set({'X-Robots-Tag':'noindex, nofollow',...(status===503?{'Retry-After':'60'}:{})});
      // Do not fall back to stale/unauthorized catalogue data or leak the caught error.
      return res.status(status).type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>${status===404?'课程未找到':'页面暂时无法读取'} · OneShowLearn</title></head><body><main><h1>${status===404?'课程未找到':'页面暂时无法读取'}</h1><p>${status===404?'可返回首页查看已发布课程。':'请稍后重试，学习资料与账户记录保持原有访问权限。'}</p><a href="/">返回 OneShowLearn 首页</a></main></body></html>`);
    }
  };
}
