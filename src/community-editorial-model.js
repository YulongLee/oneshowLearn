import {safeResourceUrl} from './opc-model.js';
export function communityArticles(items,{category='all',topic='',query='',sort='latest'}={}){
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(i=>(category==='all'||i.category===category)&&(!topic||i.topic===topic)&&terms.every(term=>`${i.title||''} ${i.summary||''} ${i.topic||''}`.toLowerCase().includes(term))).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||(sort==='recommended'?Number(Boolean(b.recommended))-Number(Boolean(a.recommended)):0)||String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))||b.id-a.id);
}
export function communityFeatured(items){return communityArticles(items,{sort:'recommended'})[0]||null;}
export function safeCommunityLink(value=''){return /^\/(?!\/)[^\s\\]*$/.test(value)?value:safeResourceUrl(value);}
export function safeCommunityImage(value=''){
 const url=String(value);
 if(/^\/assets\/[\w./-]+$/.test(url)&&!url.includes('..'))return url;
 if(/^\/api\/materials\/[1-9]\d*\?ticket=[A-Za-z0-9_.-]+$/.test(url))return url;
 return /^https:\/\//.test(url)?safeResourceUrl(url):'';
}
export function groupAudience(settings){return settings.groupAudience==='signed-in'?'已登录学员可查看':'有效课程权益学员专属';}
export function groupMessage(settings){
 if(settings.groupExpired)return '二维码已到期，官方更新后将重新开放。';
 if(!settings.groupReady)return '官方正在准备入群方式，配置完成后会在这里展示。';
 if(!settings.groupAccessible)return settings.groupAudience==='signed-in'?'请登录学习账号后查看入群方式。':'请使用拥有有效课程权益的账号查看；如有疑问，可联系官方核对权益。';
 return '请按官方入群说明操作；扫码不代表已自动完成入群核验。';
}
