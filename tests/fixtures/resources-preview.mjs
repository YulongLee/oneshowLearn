// Disposable visual fixture only; never opens or populates the real database.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
if(process.env.RESOURCES_QA_PREVIEW!=='1'||process.env.NODE_ENV==='production')throw new Error('Isolated QA opt-in required');
const temp=mkdtempSync(path.join(tmpdir(),'oneshowlearn-resources-visual-'));
Object.assign(process.env,{NODE_ENV:'test',API_PORT:'18839',DATABASE_PATH:path.join(temp,'qa.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'resources-visual-test-only',APP_ORIGIN:'http://127.0.0.1:4188'});
const {run}=await import('../../server/db.mjs');
const {createApp}=await import('../../server/index.mjs');
run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'admin',1)",['resource-qa@example.com',bcrypt.hashSync('Resource-Visual-QA-2026',4),'资源测试账号']);
const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','AI 产品开发','published')").lastInsertRowid);
const packId=Number(run("INSERT INTO project_packs(path_id,slug,title,status,is_featured) VALUES(?,'qa-resources','[仅测试] AI OPC','published',1)",[pathId]).lastInsertRowid);
const definitions=[
 ['产品需求文档（PRD）模板','template','适用于 AI 产品的完整 PRD 模板，包含市场分析、功能列表、技术方案等。'],
 ['Codex 开发指令大全','prompt','从需求分析到代码生成，整理常用 Codex 指令和最佳实践。'],
 ['支付接入指南','document','学习微信支付、支付宝、Stripe 等支付渠道的接入流程和示例。'],
 ['部署上线完整指南','document','从服务器购买到域名解析、HTTPS 配置、Docker 部署的完整教程。'],
 ['React + FastAPI 项目模板','code','从一个可运行的项目开始。'],
 ['小程序 App 上架检查清单','checklist','提交应用前的逐项检查。'],
 ['AI 产品工具选型清单','document','比较开发与设计工具。'],
 ['SEO 增长案例复盘','document','学习真实案例的研究方法。'],
 ['Prompt RAG Agent 数据分析','prompt','更多资源标签测试。'],
];
for(let i=0;i<definitions.length;i++){
 const [title,type,summary]=definitions[i];
 const stepId=Number(run("INSERT INTO project_steps(pack_id,title,summary,status) VALUES(?,?,?,'published')",[packId,title,summary]).lastInsertRowid);
 const date=`2026-09-${String(26-i).padStart(2,'0')} 10:00:00`;
 run("INSERT INTO content_items(step_id,title,type,body,status,is_preview,created_at,updated_at) VALUES(?,?,?,?,'published',?,?,?)",[stepId,title,type,`仅用于隔离环境的界面测试，不是真实课程资料。\n\n${title}\n\n一、实践目标\n${summary}\n\n二、检查清单\n确认需求范围，记录实践过程，整理可复用的项目成果。`,i===0?1:0,date,date]);
}
createApp().listen(18839,'127.0.0.1',()=>console.log(`Isolated resource QA on18839; temporaryDB: ${temp}`));
