import {row,rows,run} from './db.mjs';
import {hasVerifiedLogin} from './auth.mjs';
import {randomUUID} from 'node:crypto';
import {createAliyunProvider} from './ai-provider.mjs';
import {aiRuntime} from './ai-configuration.mjs';
import {currentTimeAnswer,modelIdentityAnswer} from './ai-web-search.mjs';
import {rateLimit} from './account-security.mjs';
import {courseEvidence,verifyCourseAnswer} from './course-ai-grounding.mjs';
import {retrieveTutorEvidence,tutorDocuments,verifyTutorAnswer,TUTOR_INSUFFICIENT} from './tutor-retrieval.mjs';
import {placement,canReadPlacement,stageAccessIssue} from './learning-model.mjs';

function authorizedLesson(user,id){
  const current=row('SELECT id,role,status,email_verified,token_version FROM users WHERE id=?',[user.id]);
  if(!current||current.status!=='active'||!hasVerifiedLogin(current)||Number(current.token_version)!==Number(user.token_version))throw Object.assign(new Error('登录状态已变化，请重新登录后提问。'),{status:401});
  const lesson=placement(id);
  if(!lesson||!canReadPlacement(current,lesson))throw Object.assign(new Error('课时或学习权限已变化，请重新载入后核对。'),{status:403});
  const issue=stageAccessIssue(current,lesson);
  if(issue)throw Object.assign(new Error(issue.message),{status:issue.status});
  return lesson;
}
export function publishedLessonEvidence(lesson,slideId=null){
  const materials=rows(`SELECT m.library_id id,m.role,l.title,l.body,r.title revisionTitle,r.body revisionBody,r.version promptVersion
    FROM lesson_materials m JOIN content_library l ON l.id=m.library_id
    LEFT JOIN lesson_prompt_versions v ON v.placement_id=m.placement_id AND v.library_id=m.library_id
    LEFT JOIN prompt_revisions r ON r.id=v.revision_id
    WHERE m.placement_id=? AND l.status='published' ORDER BY m.sort_order,m.library_id`,[lesson.id]).map(m=>m.role==='prompt'&&m.promptVersion?{...m,title:m.revisionTitle,body:m.revisionBody}:m);
  return courseEvidence(lesson,materials,slideId);
}
function lessonContext(user,lesson,slideId){
  const evidence=publishedLessonEvidence(lesson,slideId);
  let noteBudget=8000;
  const notes=rows('SELECT title,body,video_time,slide_id FROM learning_notes WHERE user_id=? AND placement_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 20',[user.id,lesson.id]).map(n=>{const body=plainNote(n.body).slice(0,Math.max(0,Math.min(2000,noteBudget)));noteBudget-=body.length;return {...n,body};}).filter(n=>n.body.trim());
  return {grounding:'course-only',owner:{kind:lesson.kind,id:lesson.owner_id,title:lesson.owner_title},chapter:lesson.chapter_title,stageId:lesson.stage_id,lesson:{id:lesson.id,title:lesson.title},...evidence,notes};
}
// Provider-neutral boundary. A deployment adapter must implement generate({action,
// question,context,signal}). No model secret or arbitrary context is accepted from clients.
let adapterOverride;
function connection(diagnostic=false) {
  const settings=aiRuntime();
  let provider=adapterOverride;
  if(adapterOverride===undefined)try{provider=createAliyunProvider(diagnostic?{...settings,enabled:true,maxTokens:32}:settings);}catch{settings.keyError='模型接口配置无效，请管理员检查。';provider=null;}
  return {settings,provider};
}
const inFlight=new Set();
async function generateForUser(user,request,diagnostic=false) {
  const {settings,provider}=connection(diagnostic);
  if(!provider)throw Object.assign(new Error('AI 服务暂不可用，请联系管理员检查服务开关和模型配置。'),{status:503});
  if(!diagnostic&&!settings.features[request.action])throw Object.assign(new Error('此 AI 功能已由管理员暂停，其他学习功能不受影响。'),{status:403});
  if(request.action==='web'&&!provider.webSearch)throw Object.assign(new Error('当前模型暂未接入联网搜索，请管理员选择支持的模型。'),{status:503,code:'web_unsupported'});
  if(inFlight.has(user.id)||inFlight.size>=4)throw Object.assign(new Error('已有 AI 请求正在处理，请稍后再试。'),{status:429});
  rateLimit('learning-ai-minute',String(user.id),10,60);
  try{rateLimit('learning-ai-day',String(user.id),settings.dailyLimit,86400);}catch(e){if(e.status===429)e.message='已达到本账号 24 小时 AI 调用上限，请额度恢复后再试。';throw e;}
  try{rateLimit('learning-ai-global','all',settings.globalLimit,86400);}catch(e){if(e.status===429)e.message='平台 AI 调用预算暂已用完，请稍后再试或联系管理员。';throw e;}
  const id=randomUUID(),started=Date.now();let usage={input:null,output:null},webResult;
  run("INSERT INTO ai_usage(id,user_id,action,model,config_version,status) VALUES(?,?,?,?,?,'pending')",[id,user.id,diagnostic?'connection_test':request.action,settings.model,settings.version]);
  inFlight.add(user.id);
  try {
    const answer=await provider.generate({...request,signal:AbortSignal.timeout(settings.timeout),onUsage:value=>{usage=value;},onWebResult:value=>{webResult=value;}});
    if(typeof answer!=='string'||!answer.trim()||answer.length>20000)throw Object.assign(new Error('模型未返回有效文本，请稍后重试。'),{status:502});
    if(request.action==='web'&&!webResult?.sources?.length)throw Object.assign(new Error('联网来源未返回，无法确认搜索结果，请稍后重试。'),{status:422,code:'web_search_failed'});
    run("UPDATE ai_usage SET status='success',duration_ms=?,input_tokens=?,output_tokens=? WHERE id=?",[Date.now()-started,usage.input,usage.output,id]);
    return request.action==='web'?webResult:answer;
  }catch(e){
    const code=['provider_auth','provider_quota','timeout','provider_response','network','web_search_failed','web_unsupported'].includes(e.code)?e.code:e.status===429?'provider_quota':e.status===504?'timeout':'provider_error';
    run("UPDATE ai_usage SET status='failed',duration_ms=?,error_code=? WHERE id=?",[Date.now()-started,code,id]);
    throw e;
  }finally{inFlight.delete(user.id);}
}
export const courseAIService={
  capabilities:()=>{const {settings,provider}=connection();return {available:Boolean(provider),provider:provider?.provider||'',model:provider?.model||'',dailyLimit:settings.dailyLimit,features:Object.fromEntries(Object.entries(settings.features).map(([key,value])=>[key,Boolean(provider)&&value&&(key!=='web'||Boolean(provider.webSearch)&&settings.features.tutor)])),webReason:!provider?.webSearch?'当前模型暂不支持已接入的联网搜索。':!settings.features.web?'管理员已暂停联网回答。':'',reason:provider?'':'AI 服务未启用或配置不可用；课程笔记和项目操作不受影响。'};},
  configure(adapter){if(adapter!==null&&adapter!==undefined&&typeof adapter.generate!=='function')throw Error('AI adapter must implement generate');adapterOverride=adapter;},
  async testConnection(user){await generateForUser(user,{action:'ask',question:'接口连接测试，请只回复：连接成功。',context:{}},true);return {ok:true};},
  async tutor({user,question,history=[],course=null,includeProduct=false,mode='knowledge'}) {
    const {settings,provider}=connection();
    if(!provider)throw Object.assign(new Error('AI 服务暂不可用，请联系管理员检查服务开关和模型配置。'),{status:503});
    if(!settings.features.tutor)throw Object.assign(new Error('AI 导师已由管理员暂停。'),{status:403});
    if(mode==='web'){
      if(course||includeProduct)throw Object.assign(new Error('联网回答不附带私人课程或产品资料，请关闭附加资料后再试。'),{status:400});
      if(!settings.features.web)throw Object.assign(new Error('联网回答已由管理员暂停。'),{status:403});
      if(!provider.webSearch)throw Object.assign(new Error('当前模型暂未接入联网搜索。'),{status:503});
      const direct=modelIdentityAnswer(question,settings)||currentTimeAnswer(question);if(direct)return {...direct,mode};
      return {...await generateForUser(user,{action:'web',question,history}),mode,grounded:true};
    }
    const identity=modelIdentityAnswer(question,settings);if(identity)return {...identity,mode};
    if(mode==='general'){const clock=currentTimeAnswer(question);if(clock)return {...clock,mode};}
    let product=null;
    if(includeProduct){const data=JSON.parse(row('SELECT state_json FROM opc_products WHERE user_id=?',[user.id])?.state_json||'{}');product={name:data.name||'',type:data.type||'',description:(data.description||'').slice(0,3000),phase:data.phase};}
    const context={course:course?{title:course.title,description:(course.description||'').slice(0,3000)}:null,product};
    if(mode==='general')return {answer:await generateForUser(user,{action:'tutor',question,history,context}),mode,sources:[],grounded:false};
    const evidence=retrieveTutorEvidence(user,question,history,course?.id);
    if(!evidence.sources.length)return {answer:TUTOR_INSUFFICIENT,mode,sources:[],grounded:false,retrieval:evidence.retrieval};
    const answer=await generateForUser(user,{action:'tutor',question,history,context:{...context,grounding:'tutor-retrieval',sources:evidence.sources}});
    // A response may arrive after an entitlement or CMS publication was changed.
    const latestUser=row('SELECT id,role,status,email_verified,token_version FROM users WHERE id=?',[user.id]);
    if(!latestUser||latestUser.status!=='active'||!hasVerifiedLogin(latestUser)||Number(latestUser.token_version)!==Number(user.token_version))
      throw Object.assign(new Error('登录状态已变化，请重新登录后提问。'),{status:401});
    const current=new Map(tutorDocuments(latestUser,course?.id).docs.map(d=>[d.key,d]));
    if(evidence.sources.some(s=>current.get(s.key)?.text.slice(s.offset,s.offset+1000)!==s.text))
      throw Object.assign(new Error('资料或访问权限在回答期间发生变化，请重新提问。'),{status:409});
    return {...verifyTutorAnswer(answer,evidence.sources),mode,retrieval:evidence.retrieval};
  },
  async generate({user,lesson,action,question,slideId=null}){
    if(!connection().provider)throw Object.assign(new Error('AI 服务暂不可用，请联系管理员检查配置。'),{status:503});
    const context=lessonContext(user,authorizedLesson(user,lesson.id),slideId);
    if(!context.sources.length)throw Object.assign(new Error('当前课时没有可读的课件文字或已发布资料正文，暂不能进行 AI 答疑或整理。请管理员在课时编排中补充课件页文字或关联文字稿；仅有视频、图片、PPT/PDF 附件不会被自动解析。'),{status:422});
    if(action==='notes'&&!context.notes.length)throw Object.assign(new Error('本课时还没有已保存的笔记。请先记录并保存笔记，再进行 AI 整理。'),{status:422});
    const contextSnapshot=JSON.stringify(context);
    const answer=await generateForUser(user,{action,question:action==='ask'?question:'',context});
    if(JSON.stringify(lessonContext(user,authorizedLesson(user,lesson.id),slideId))!==contextSnapshot)throw Object.assign(new Error('资料或笔记在回答期间发生变化，请核对后重新提问。'),{status:409});
    if(typeof answer!=='string'||!answer.trim()||answer.length>50000)throw Object.assign(new Error('AI 服务返回了无效内容，请稍后重试'),{status:502});
    return {...verifyCourseAnswer(answer,context.sources),coverage:context.coverage,contextLessonId:lesson.id};
  }
};
export function plainNote(body){try{const d=JSON.parse(body);if(d.type==='doc'){const walk=n=>[n.text||'',...(n.content||[]).map(walk)].join(' ');return walk(d);}}catch{}return body;}
