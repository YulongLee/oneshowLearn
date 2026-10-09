import {Router} from 'express';
import {row,rows} from './db.mjs';
import {requireOwner} from './auth.mjs';
import {placement} from './learning-model.mjs';
import {publicService} from './service-routes.mjs';
import {communityGroupReady} from './community-assets.mjs';
import {publishedLessonEvidence} from './course-ai-service.mjs';
import {listPage} from './list-page.mjs';
import {commercialSettings} from './commercial-analytics.mjs';
import {certificateCourseStates} from './course-certificates.mjs';
import {createMinerU} from './mineru-provider.mjs';
export function operationalReadinessRouter({provider}={}){
 const router=Router();
 router.get('/admin/readiness',requireOwner,(req,res)=>{
  const {offset}=listPage(req.query);
  const published=`FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id AND l.status='published' WHERE p.status='published' AND (
   EXISTS(SELECT 1 FROM project_steps s JOIN project_packs c ON c.id=s.pack_id AND c.status='published' JOIN learning_paths lp ON lp.id=c.path_id AND lp.status='published' WHERE s.id=p.chapter_id AND s.status='published') OR
   EXISTS(SELECT 1 FROM practice_project_stages s JOIN practice_projects pr ON pr.id=s.project_id AND pr.status='published' WHERE s.id=p.stage_id AND s.status='published'))`;
  const ids=rows(`SELECT p.id ${published} ORDER BY p.id LIMIT 20 OFFSET ?`,[offset]);
  const items=ids.map(r=>placement(r.id)).filter(Boolean).map(p=>({id:p.id,title:p.title,hasVideo:Boolean(p.config.videoAssetId),hasCourseware:Boolean(p.config.pptAssetId),hasSubtitle:Boolean(p.config.subtitleAssetId),hasRetrievableText:publishedLessonEvidence(p).sources.length>0,demo:Boolean(p.config.isDemoMedia)}));
  const service=publicService(),community=row("SELECT published_json FROM community_records WHERE kind='settings' AND archived=0")?.published_json,group=community?JSON.parse(community):null;
  const settings=commercialSettings();
  // Construction checks credentials only; never call a provider during a readiness GET.
  const capabilities={parser:{configured:Boolean(provider===undefined?createMinerU():provider),enabled:Boolean(settings.parser_enabled),jobs:row('SELECT COUNT(*) n FROM document_parse_jobs').n},telemetry:{enabled:Boolean(settings.telemetry_enabled),events:row('SELECT COUNT(*) n FROM telemetry_events').n},certificates:{courses:certificateCourseStates(),issued:row('SELECT COUNT(*) n FROM course_certificates').n}};
  res.set('Cache-Control','private, no-store').json({items,total:row(`SELECT COUNT(*) n ${published}`).n,offset,capabilities,service:{published:service.published,operatorReady:Boolean(service.settings.operatorName),contactReady:Boolean(service.settings.contactEmail||service.settings.contactWechat)},groupReady:Boolean(group&&communityGroupReady(group)),officialArticles:row("SELECT COUNT(*) n FROM community_records WHERE kind='article' AND archived=0 AND published_json IS NOT NULL").n,metrics:{registeredAccounts:row("SELECT COUNT(*) n FROM users WHERE role='learner'").n,verifiedEmailAccounts:row("SELECT COUNT(*) n FROM users WHERE role='learner' AND email_verified=1").n,paidBuyers:row("SELECT COUNT(DISTINCT user_id) n FROM orders WHERE status='paid'").n,learningAccounts:row('SELECT COUNT(DISTINCT user_id) n FROM learning_progress').n,paidOrderAmountCents:row("SELECT COALESCE(SUM(amount_cents),0) n FROM orders WHERE status='paid'").n,recordedRefundCents:row('SELECT COALESCE(SUM(amount_cents),0) n FROM manual_refund_records').n},limitations:['正式发布前逐节检查视频播放、字幕、课件及文字引用质量；配置检查不能代替内容验收。','注册、付费、学习为独立真实累计数量，不是同一批次转化率。手机号验证不计入邮箱验证数。',settings.telemetry_enabled?'已启用隐私限定统计；只有实际采集记录才能用于分析，私人问题与笔记不采集。':'隐私限定统计已开发，当前未启用；私人问题与笔记不采集。','MinerU 支持经同意的文档解析，结果须审核后发布；视频转录仍需另行准备文字资料。']});
 });return router;
}
