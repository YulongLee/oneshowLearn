// First-party, bounded, best-effort metrics. No search, message, stack, token or account identifiers.
let enabled=false,queue=[],session='',started=false,observers=[],timer;
const initialRoute=typeof location==='undefined'?'':location.pathname;
const route=()=>location.pathname;
function add(kind,metric,value){if(!enabled||typeof navigator==='undefined'||navigator.doNotTrack==='1')return;const path=kind==='performance'?initialRoute:route();if(!/^\/(?:$|app$|login$|register$|resources$|tutor$|paths$|opc(?:$|\/course\/[^/]+$)|community$|notes$|favorites$|achievements$|account$|course-offer$|learn\/[^/]+\/lessons\/\d+$|projects(?:\/[^/]+(?:\/workspace)?)?$)/.test(path))return;queue.push({id:crypto.randomUUID(),session,kind,route:path,...(metric?{metric}:{}),...(value!==undefined?{value}:{})});if(queue.length>20)queue.shift();}
function flush(){if(!queue.length)return;const items=queue;queue=[];fetch('/api/telemetry/events',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({items}),keepalive:true,signal:AbortSignal.timeout(10000)}).catch(()=>{});}
export function recordRoute(){add('view');}
export function recordApiFailure(){add('error','api');}
export function startTelemetry(){
 if(started)return;started=true;
 fetch('/api/telemetry/config',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(c=>{
  if(!c?.enabled||navigator.doNotTrack==='1')return;
  enabled=true;session=crypto.randomUUID();recordRoute();
  let lcp=0,inp=0,cls=0,windowCLS=0,firstShift=0,lastShift=0;
  const observe=(type,callback)=>{try{const o=new PerformanceObserver(list=>callback(list.getEntries()));o.observe({type,buffered:true,...(type==='event'?{durationThreshold:40}:{})});observers.push(o);}catch{}};
  observe('largest-contentful-paint',es=>{for(const e of es)lcp=e.startTime;});
  // Browser event duration approximation; admin explicitly labels INP as sampled interaction latency.
  observe('event',es=>{for(const e of es)if(e.interactionId)inp=Math.max(inp,e.duration);});
  observe('layout-shift',es=>{for(const e of es)if(!e.hadRecentInput){if(e.startTime-lastShift>1000||e.startTime-firstShift>5000){firstShift=e.startTime;windowCLS=0;}windowCLS+=e.value;lastShift=e.startTime;cls=Math.max(cls,windowCLS);}});
  const navigation=performance.getEntriesByType('navigation')[0];if(navigation?.duration)add('performance','navigation',navigation.duration);
  const report=()=>{if(lcp)add('performance','LCP',lcp);if(inp)add('performance','INP',inp);add('performance','CLS',cls);const nav=performance.getEntriesByType('navigation')[0];if(nav?.duration)add('performance','navigation',nav.duration);flush();};
  window.addEventListener('error',e=>add('error',e.target===window?'runtime':'asset'),true);
  window.addEventListener('unhandledrejection',()=>add('error','promise'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')report();});window.addEventListener('pagehide',report);
  timer=setInterval(flush,15000);
 }).catch(()=>{});
}
