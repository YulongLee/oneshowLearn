// Isolated, disposable visual QA environment. Never imports or changes the user's database.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
if (process.env.OPC_QA_PREVIEW !== '1' || process.env.NODE_ENV === 'production') throw new Error('Set OPC_QA_PREVIEW=1 for the isolated local test fixture only');
const temp = mkdtempSync(path.join(tmpdir(),'oneshowlearn-opc-visual-'));
Object.assign(process.env,{NODE_ENV:'test',API_PORT:'18819',DATABASE_PATH:path.join(temp,'qa.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'opc-visual-qa-only',APP_ORIGIN:'http://127.0.0.1:4186'});
const {run} = await import('../../server/db.mjs');
const {emptyProduct} = await import('../../src/opc-model.js');
const {createApp} = await import('../../server/index.mjs');
const owner=Number(run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'admin',1)",['opc-qa@example.com',bcrypt.hashSync('OPC-Visual-QA-2026',4),'界面测试账号']).lastInsertRowid);
const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','AI 产品开发','published')").lastInsertRowid);
const packId=Number(run("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'qa-opc','[仅测试] AI OPC 课程','published')",[pathId]).lastInsertRowid);
const titles=['AI Coding 基础','给 Codex 写好需求','开发 Web 产品（实战）','开发微信小程序','开发移动 App','开发桌面客户端','AI 能力接入','测试与 Debug','部署你的 MVP'];
const summaries=['Cursor、Codex、Claude Code 有什么区别？如何选择？','如何让 AI 正确理解你的 PRD，生成高质量代码','用 React + FastAPI + PostgreSQL 开发一个完整的 Web 应用','从 0 到 1 开发并发布微信小程序','用 SwiftUI / React Native 快速构建 App','Electron + AI 能力，打造桌面生产力工具','LLM / RAG / Agent / ASR / TTS 实践','用 AI 进行测试、问题定位与优化','服务器、域名、HTTPS、自动部署'];
for (let phase=1;phase<=5;phase++) {
  const count=phase===2?9:1;
  for (let i=0;i<count;i++) {
    const chapter=Number(run("INSERT INTO project_steps(pack_id,title,summary,status,sort_order) VALUES(?,?,?,'published',?)",[packId,phase===2?titles[i]:`阶段 ${phase} 测试章节`,phase===2?summaries[i]:'仅用于隔离环境验证',i]).lastInsertRowid);
    run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,?)',[chapter,phase]);
    const item=Number(run("INSERT INTO content_items(step_id,title,type,body,duration_seconds,status,is_preview) VALUES(?,?,?,?,?,'published',?)",[chapter,phase===2?titles[i]:`阶段 ${phase} 测试资料`,['document','prompt','code','template','video','document','code','checklist','download'][i],`仅测试资料，不是真实课程。\n\n${phase===2?titles[i]:'阶段目标'}\n\n这段内容用于验证 CMS 读取、内容阅读、学习完成状态、账号隔离与页面排版。\n完成验证不会修改本地正式开发数据库。`,[18,24,32,28,30,25,28,22,20][i]*60,i===0?1:0]).lastInsertRowid);
    if (phase===1 || (phase===2 && i<3)) run("INSERT INTO progress(user_id,content_item_id,status) VALUES(?,?,?)",[owner,item,(phase===1||i<2)?'completed':'started']);
  }
}
const p={...emptyProduct(),name:'示例产品（仅测试）',type:'AI 工具网站',phase:2,description:'用 AI 提供实用的在线工具，提升个人和团队的生产力。'};
p.milestones[0]='done';p.milestones[1]='done';p.milestones[2]='done';p.milestones[3]='doing';p.milestones[4]='doing';
run('INSERT INTO opc_products(user_id,state_json) VALUES(?,?)',[owner,JSON.stringify(p)]);
createApp().listen(18819,'127.0.0.1',()=>console.log(`Isolated OPC QA on 18819; temporary DB: ${temp}`));
