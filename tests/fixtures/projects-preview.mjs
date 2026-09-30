// Disposable visual-test catalog. Never connects to local development or production data.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
if(process.env.PROJECTS_QA_PREVIEW!=='1'||process.env.NODE_ENV==='production')throw new Error('This fixture requires PROJECTS_QA_PREVIEW=1 in a non-production environment');
const temp=mkdtempSync(path.join(tmpdir(),'oneshowlearn-projects-visual-'));
Object.assign(process.env,{NODE_ENV:'test',API_PORT:'18829',DATABASE_PATH:path.join(temp,'qa.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'projects-visual-only',APP_ORIGIN:'http://127.0.0.1:4187'});
const {run}=await import('../../server/db.mjs');
const {createApp}=await import('../../server/index.mjs');
const user=Number(run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'learner',1)",['projects-qa@example.com',bcrypt.hashSync('Projects-Visual-QA-2026',4),'界面测试账号']).lastInsertRowid);
const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','AI 产品开发','published')").lastInsertRowid);
const titles=['AI SaaS 完整项目','微信小程序项目','AI 移动 App 项目','AI 工具网站','桌面客户端项目','AI Agent 项目','AI 内容自动化项目','AI 记账 App'];
const subtitles=['从 0 到 1 开发一个可收款的 AI SaaS 产品','开发并上线一个实用的微信小程序','从 0 到 1 发布到 App Store / Google Play','用 AI 快速搭建一个在线工具网站','开发并发布一个桌面应用（macOS/Windows）','构建一个真正有用的 AI Agent','从内容生产到自动发布的完整流程','开发一个 AI 记账的移动应用'];
for(let i=0;i<titles.length;i++){
  const pack=Number(run("INSERT INTO project_packs(path_id,slug,title,subtitle,description,deliverable,estimated_minutes,status,is_featured) VALUES(?,?,?,?,?,?,?,'published',?)",[pathId,`qa-project-${i+1}`,titles[i],subtitles[i],'仅用于隔离界面测试，不是真实发布课程。','完成一份实践作品与总结',120+i*60,i===0?1:0]).lastInsertRowid);
  if(i<4)run("INSERT INTO entitlements(user_id,pack_id,status,starts_at) VALUES(?,?,'active','2000-01-01')",[user,pack]);
  for(let j=0;j<4;j++){
    const step=Number(run("INSERT INTO project_steps(pack_id,title,status,sort_order) VALUES(?,?,'published',?)",[pack,['需求与规划','搭建项目','完成核心功能','测试与发布'][j],j]).lastInsertRowid);
    const content=Number(run("INSERT INTO content_items(step_id,title,type,body,status,is_preview) VALUES(?,?,?,?,'published',?)",[step,`${titles[i]} · ${['项目准备文档','开发 Prompt','核心代码','上线检查清单'][j]}`,['document','prompt','code','checklist'][j],'这是隔离测试环境中的资料。\n\n用于验证阅读、权限控制与进度保存。\n不会改动真实课程和学习记录。',j===0?1:0]).lastInsertRowid);
    if((i===0&&j<3)||(i===1&&j===0)||i===2)run('INSERT INTO progress(user_id,content_item_id,status) VALUES(?,?,?)',[user,content,i===1?'started':'completed']);
  }
}
createApp().listen(18829,'127.0.0.1',()=>console.log(`Isolated projects QA on 18829; temporary DB: ${temp}`));
