import { Router } from 'express';
import { requireAuth } from './auth.mjs';
import { rateLimit } from './account-security.mjs';
import { adminAiConfig, aiUsage, aiSaveSchema, saveAiConfig } from './ai-configuration.mjs';
import { courseAIService } from './course-ai-service.mjs';

export function aiAdminRouter() {
  const router=Router();
  router.use('/admin/ai',requireAuth,(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(req.user.role!=='admin')return res.status(403).json({error:'只有管理员可以管理 AI 服务。'});
    next();
  });
  router.get('/admin/ai',(_req,res)=>res.json(adminAiConfig()));
  router.put('/admin/ai',(req,res)=>{
    const version=req.headers['if-match'];
    if(!/^\d+$/.test(version||''))return res.status(428).json({error:'缺少配置版本，请重新加载。'});
    const parsed=aiSaveSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'配置无效，请检查模型、密钥、功能开关及额度范围。'});
    try{res.json(saveAiConfig(req.user,Number(version),parsed.data));}catch(e){res.status(e.status||500).json({error:e.status?e.message:'保存失败，请稍后重试。'});}
  });
  router.get('/admin/ai/usage',(req,res)=>{
    const offset=Number(req.query.offset||0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return res.status(400).json({error:'分页参数无效'});
    res.json(aiUsage(offset));
  });
  router.post('/admin/ai/test',async(req,res)=>{
    if(Object.keys(req.body||{}).some(key=>key!=='version'))return res.status(400).json({error:'只允许测试已保存的配置'});
    if(!Number.isInteger(req.body?.version)||req.body.version!==adminAiConfig().version)return res.status(409).json({error:'配置版本已变化，请重新加载后测试。'});
    rateLimit('ai-admin-test',String(req.user.id),2,60);
    const started=Date.now();
    try{await courseAIService.testConnection(req.user);res.json({ok:true,durationMs:Date.now()-started,message:'已收到模型真实回复。测试未启用或改变任何功能开关。'});}
    catch(e){res.status(e.status||502).json({error:e.status?e.message:'连接测试失败，请检查模型配置。'});}
  });
  return router;
}
