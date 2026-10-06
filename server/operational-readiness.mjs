import {Router} from 'express';
import {row,rows} from './db.mjs';
import {requireOwner} from './auth.mjs';
import {placement} from './learning-model.mjs';
import {publicService} from './service-routes.mjs';
import {communityGroupReady} from './community-assets.mjs';
import {publishedLessonEvidence} from './course-ai-service.mjs';
import {listPage} from './list-page.mjs';
export function operationalReadinessRouter(){
 const router=Router();
 router.get('/admin/readiness',requireOwner,(req,res)=>{
  const {offset}=listPage(req.query);
  const published=`FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id AND l.status='published' WHERE p.status='published' AND (
   EXISTS(SELECT 1 FROM project_steps s JOIN project_packs c ON c.id=s.pack_id AND c.status='published' JOIN learning_paths lp ON lp.id=c.path_id AND lp.status='published' WHERE s.id=p.chapter_id AND s.status='published') OR
   EXISTS(SELECT 1 FROM practice_project_stages s JOIN practice_projects pr ON pr.id=s.project_id AND pr.status='published' WHERE s.id=p.stage_id AND s.status='published'))`;
  const ids=rows(`SELECT p.id ${published} ORDER BY p.id LIMIT 20 OFFSET ?`,[offset]);
  const items=ids.map(r=>placement(r.id)).filter(Boolean).map(p=>({id:p.id,title:p.title,hasVideo:Boolean(p.config.videoAssetId),hasCourseware:Boolean(p.config.pptAssetId),hasSubtitle:Boolean(p.config.subtitleAssetId),hasRetrievableText:publishedLessonEvidence(p).sources.length>0,demo:Boolean(p.config.isDemoMedia)}));
  const service=publicService(),community=row("SELECT published_json FROM community_records WHERE kind='settings' AND archived=0")?.published_json,group=community?JSON.parse(community):null;
  res.set('Cache-Control','private, no-store').json({items,total:row(`SELECT COUNT(*) n ${published}`).n,offset,service:{published:service.published,operatorReady:Boolean(service.settings.operatorName),contactReady:Boolean(service.settings.contactEmail||service.settings.contactWechat)},groupReady:Boolean(group&&communityGroupReady(group)),officialArticles:row("SELECT COUNT(*) n FROM community_records WHERE kind='article' AND archived=0 AND published_json IS NOT NULL").n,metrics:{registeredAccounts:row("SELECT COUNT(*) n FROM users WHERE role='learner'").n,verifiedEmailAccounts:row("SELECT COUNT(*) n FROM users WHERE role='learner' AND email_verified=1").n,paidBuyers:row("SELECT COUNT(DISTINCT user_id) n FROM orders WHERE status='paid'").n,learningAccounts:row('SELECT COUNT(DISTINCT user_id) n FROM learning_progress').n,paidOrderAmountCents:row("SELECT COALESCE(SUM(amount_cents),0) n FROM orders WHERE status='paid'").n,recordedRefundCents:row('SELECT COALESCE(SUM(amount_cents),0) n FROM manual_refund_records').n},limitations:['素材存在不代表播放验收通过；文字存在不保证引用质量，正式发布前仍需逐节检查。','注册、付费、学习为独立真实累计数量，不是同一批次转化率。手机号验证不计入邮箱验证数。','未收集私人问题、笔记或浏览行为；真实用户性能、错误与回访漏斗尚无采集数据。','自动视频转录及 PPT/PDF 解析未接入，需同步准备发布的文字资料。']});
 });return router;
}
