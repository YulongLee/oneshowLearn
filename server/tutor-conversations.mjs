import {Router} from 'express';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAuth,hasVerifiedLogin} from './auth.mjs';
import {rateLimit} from './account-security.mjs';
import {courseAccess} from './learning-model.mjs';
import {courseAIService} from './course-ai-service.mjs';
import {tutorDocuments} from './tutor-retrieval.mjs';
import {webAnswerIssue} from './ai-web-search.mjs';

const root='/learning/ai/conversations';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status,tutorError:true});};
const parse=(schema,value)=>{const result=schema.safeParse(value);if(!result.success)fail(400,'提交格式不正确');return result.data;};
const now=()=>new Date().toISOString();
const own=(id,user)=>{const item=row('SELECT * FROM tutor_conversations WHERE id=? AND user_id=?',[id,user.id]);if(!item)fail(404,'对话不存在或不属于当前账号');return item;};
const bump=id=>run('UPDATE tutor_conversations SET version=version+1,updated_at=? WHERE id=?',[now(),id]);
const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
function recoverExpired(id){
  const changed=run("UPDATE tutor_turns SET status='failed',error='上次回答被中断，请重试。问题已保存。',updated_at=? WHERE conversation_id=? AND status='pending' AND updated_at<?",[now(),id,new Date(Date.now()-120000).toISOString()]);
  if(changed.changes)bump(id);
}
// Saved citations never bypass current publication/entitlement checks.
function detail(id,user){
  own(id,user);recoverExpired(id);
  const turns=rows('SELECT * FROM tutor_turns WHERE conversation_id=? ORDER BY created_at,rowid',[id]);
  let docs;
  return {conversation:own(id,user),turns:turns.map(t=>{
    let result=t.result_json?JSON.parse(t.result_json):null;
    if(t.mode==='web'&&result?.sources?.length&&webAnswerIssue(result.answer))
      result={answer:'这条旧回答存在明显的引用问题，暂不展示原回答和来源。请重新提问以获取新的回答。',mode:t.mode,sources:[],grounded:false,unavailable:true};
    if(t.mode!=='web'&&result?.sources?.length){
      docs ||= tutorDocuments(user).docs;
      if(result.sources.some(s=>!docs.some(d=>d.placementId===s.placementId&&d.contentId===s.contentId&&d.slideId===s.slideId&&d.materialId===s.materialId&&d.text.slice(s.offset,s.offset+1000)===s.excerpt)))
        result={answer:'这条回答引用的资料已变更、下架或当前账号已无访问权限，暂不展示原回答。请基于现有资料重新提问。',mode:t.mode,sources:[],grounded:false,unavailable:true};
    }
    return {id:t.id,question:t.question,mode:t.mode,courseId:t.course_id,includeProduct:Boolean(t.include_product),status:t.status,result,error:t.error,createdAt:t.created_at};
  })};
}
function historyFor(turns,mode,courseId){
  const history=[];let length=0;
  for(const t of [...turns].reverse()){
    if(t.mode!==mode||t.courseId!==courseId)break;
    if(t.status!=='complete')continue;
    if(t.result?.unavailable)break;
    const pair=[{role:'user',content:t.question},{role:'assistant',content:t.result.answer}];
    const size=pair.reduce((n,m)=>n+m.content.length,0);
    if(history.length+2>8||length+size>36000)break;
    history.unshift(...pair);length+=size;
  }
  return history;
}
async function generate(user,conversationId,turn,course,history){
  let result,error;
  try{
    result=await courseAIService.tutor({user,question:turn.question,mode:turn.mode,course,includeProduct:turn.includeProduct,history});
    const latest=row('SELECT id,status,email_verified,token_version FROM users WHERE id=?',[user.id]);
    if(!latest||latest.status!=='active'||!hasVerifiedLogin(latest)||Number(latest.token_version)!==Number(user.token_version))fail(401,'登录状态已变化，请重新登录后重试');
  }catch(e){error=e.status&&e.status<500?e.message:'AI 回答暂未完成，请稍后重试。问题已保存。';}
  tx(()=>{
    const changed=run("UPDATE tutor_turns SET status=?,result_json=?,error=?,updated_at=? WHERE id=? AND conversation_id=? AND status='pending' AND attempt=?",[error?'failed':'complete',error?null:JSON.stringify(result),error||null,now(),turn.id,conversationId,turn.attempt]);
    if(changed.changes)bump(conversationId);
  });
}
export function tutorConversationRouter(){
  const router=Router();
  router.use(root,requireAuth,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get(root,(req,res)=>{
    const offset=parse(z.coerce.number().int().min(0).max(100000).default(0),req.query.offset);
    const items=rows('SELECT id,title,version,created_at,updated_at FROM tutor_conversations WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 51 OFFSET ?',[req.user.id,offset]);
    res.json({items:items.slice(0,50),nextOffset:items.length>50?offset+50:null});
  });
  router.post(root,(req,res)=>{
    const d=parse(z.object({id:z.string().uuid()}).strict(),req.body);
    const existing=row('SELECT * FROM tutor_conversations WHERE id=?',[d.id]);
    if(existing){own(d.id,req.user);return res.json(detail(d.id,req.user));}
    rateLimit('tutor-conversation-create',String(req.user.id),20,60);
    run('INSERT INTO tutor_conversations(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',[d.id,req.user.id,'新对话',now(),now()]);
    res.status(201).json(detail(d.id,req.user));
  });
  router.get(root+'/:id',(req,res)=>res.json(detail(req.params.id,req.user)));
  router.post(root+'/:id/turns',(req,res)=>{
    const conversation=own(req.params.id,req.user);recoverExpired(conversation.id);
    const d=parse(z.object({id:z.string().uuid(),question:z.string().trim().min(1).max(4000),mode:z.enum(['knowledge','general','web']),courseId:z.number().int().positive().nullable().default(null),includeProduct:z.boolean().default(false),retry:z.boolean().default(false)}).strict(),req.body);
    if(d.mode==='web'&&(d.courseId||d.includeProduct))fail(400,'联网回答不附带私人课程或产品资料');
    const existing=row('SELECT * FROM tutor_turns WHERE id=?',[d.id]);
    if(existing){
      if(existing.conversation_id!==conversation.id||existing.question!==d.question||existing.mode!==d.mode||existing.course_id!==d.courseId||Boolean(existing.include_product)!==d.includeProduct)fail(409,'请求编号已使用，请刷新后重试');
      if(existing.status!=='failed'||!d.retry)return res.status(existing.status==='pending'?202:200).json(detail(conversation.id,req.user));
    }
    if(String(req.headers['if-match'])!==String(own(conversation.id,req.user).version))fail(409,'对话已在其他页面更新，请刷新对话后重试。草稿已保留。');
    if(row("SELECT 1 FROM tutor_turns WHERE conversation_id=? AND status='pending'",[conversation.id]))fail(409,'此对话正在回答，请等待完成');
    if(!existing&&row('SELECT COUNT(*) n FROM tutor_turns WHERE conversation_id=?',[conversation.id]).n>=100)fail(409,'此对话已达 100 轮，请开启新对话；旧记录仍会保留。');
    const course=d.courseId?row("SELECT p.id,p.title,p.description FROM project_packs p JOIN learning_paths l ON l.id=p.path_id AND l.status='published' WHERE p.id=? AND p.status='published'",[d.courseId]):null;
    if(d.courseId&&(!course||!courseAccess(req.user,d.courseId)))fail(403,'没有所选课程的学习权限');
    rateLimit('tutor-retrieval-minute',String(req.user.id),20,60);
    const history=historyFor(detail(conversation.id,req.user).turns,d.mode,d.courseId);
    tx(()=>{
      if(existing)run("UPDATE tutor_turns SET status='pending',error=NULL,attempt=attempt+1,updated_at=? WHERE id=?",[now(),d.id]);
      else run("INSERT INTO tutor_turns(id,conversation_id,question,mode,course_id,include_product,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)",[d.id,conversation.id,d.question,d.mode,d.courseId,Number(d.includeProduct),now(),now()]);
      if(conversation.title==='新对话')run('UPDATE tutor_conversations SET title=? WHERE id=?',[d.question.replace(/\s+/g,' ').slice(0,60),conversation.id]);
      bump(conversation.id);
    });
    // The durable pending question is acknowledged before generation; navigation never cancels saving.
    res.status(202).json(detail(conversation.id,req.user));
    generate(req.user,conversation.id,{...d,attempt:existing?existing.attempt+1:1},course,history).catch(()=>{console.error('Tutor reply persistence failed; pending question retained');});
  });
  router.post(root+'/:id/turns/:turnId/stop',(req,res)=>{
    own(req.params.id,req.user);
    tx(()=>{const changed=run("UPDATE tutor_turns SET status='failed',error='已停止回答；问题已保存，可稍后重试。已发出的模型调用可能计入用量。',updated_at=? WHERE id=? AND conversation_id=? AND status='pending'",[now(),req.params.turnId,req.params.id]);if(changed.changes)bump(req.params.id);});
    res.json(detail(req.params.id,req.user));
  });
  router.use((e,_req,res,next)=>e.tutorError?res.status(e.status).json({error:e.message}):next(e));
  return router;
}
