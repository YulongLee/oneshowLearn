import {renderToString} from 'react-dom/server';
import {Suspense} from 'react';
import {PublicHomepage} from './PublicHomepage.jsx';
import CourseOffer from './CourseOffer.jsx';
import hero from './assets/oneshowlearn-hero-optimized.webp';
import symbol from './assets/oneshowlearn-symbol.svg?no-inline';

export const publicShareImage=hero;
export const publicLogo=symbol;

// Only the anonymous public bootstrap is passed here; no learner model or token.
export function renderPublicPage(bootstrap) {
  if(bootstrap?.kind==='home')return renderToString(<Suspense fallback={<p role="status">正在加载页面…</p>}><PublicHomepage navigate={()=>{}} initialData={bootstrap}/></Suspense>);
  if(bootstrap?.kind==='course')return renderToString(<CourseOffer model={{user:null,refresh(){}}} navigate={()=>{}} initialData={bootstrap}/>);
  throw new Error('Unsupported public rendering kind');
}
