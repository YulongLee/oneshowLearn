import {describePublicRoute,PRIVATE_ROBOTS} from '../server/public-seo-model.mjs';
export default {
  async fetch(request, env) {
    const url=new URL(request.url),route=describePublicRoute(url.pathname+url.search);
    const read=['GET','HEAD'].includes(request.method);
    // Indexed publishing requires the same public-document backend, not a stale price snapshot.
    if(read&&route.kind!=='excluded'&&env.PUBLIC_DOCUMENTS?.fetch){
      const headers=new Headers(request.headers);headers.delete('authorization');headers.delete('cookie');
      return env.PUBLIC_DOCUMENTS.fetch(new Request(request,{headers}));
    }
    if(read&&['robots.txt','sitemap.xml','llms.txt'].includes(route.kind))return new Response('Public document backend unavailable\n',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Retry-After':'60','X-Robots-Tag':PRIVATE_ROBOTS}});
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (route.kind==='excluded'||!read||!acceptsHtml) {
      return response;
    }
    // Static-only previews are deliberately not an alternative indexed publishing mode.
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    const shell=response.status===404?await env.ASSETS.fetch(new Request(indexUrl,request)):response;
    return new Response(shell.body,{status:route.kind==='missing'?404:shell.status,headers:{...Object.fromEntries(shell.headers),'X-Robots-Tag':PRIVATE_ROBOTS,'Cache-Control':'no-store'}});
  },
};
