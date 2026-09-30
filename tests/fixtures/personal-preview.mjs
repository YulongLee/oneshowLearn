// Opt-in, disposable QA data; resources-preview always selects a new temporary DB.
if(process.env.RESOURCES_QA_PREVIEW!=='1'||process.env.NODE_ENV==='production')throw new Error('Isolated QA opt-in required');
await import('./resources-preview.mjs');
const {run,row,rows}=await import('../../server/db.mjs');
const {randomUUID}=await import('node:crypto');
const user=row("SELECT id FROM users WHERE email='resource-qa@example.com'");
const now=new Date().toISOString();
const titles=['用 Codex 开发一个 Web 项目的完整流程','AI 产品定价策略思考','微信小程序上线避坑指南','AI 面试助手竞品分析','OneShowTools 产品需求草案','SEO 优化实践笔记','灵感记录：健康饮食 App','服务器部署踩坑记录'];
const tags=[['AI 开发','Codex','Web 开发'],['商业化','定价'],['小程序','上线'],['产品分析','竞品'],['产品','PRD'],['SEO','增长'],['灵感','App'],['部署','运维']];
const body='> 核心结论：清晰的需求、合适的技术栈与结构化的开发指令，帮助你完成一个可验证的产品原型。\n\n## 1. 项目需求定义\n先明确产品的核心功能和目标用户，编写详细的 PRD。\n- [x] 确定产品定位和目标用户\n- [x] 梳理核心功能列表\n- [x] 设计页面流程和交互\n- [ ] 编写 PRD 文档\n\n## 2. 技术栈选择\n根据项目需求选择适合的技术栈：\n```\n前端：React + TypeScript\n后端：FastAPI + Python\n数据库：PostgreSQL\n部署：Docker\n```\n\n## 3. 使用 Codex 开发\n编写清晰的开发指令，让 AI 理解你的需求：\n```\n请帮我开发一个项目，包含用户登录、数据存储和基础的增删改查。\n提供完整的项目结构和部署说明。\n```\n\n仅用于隔离环境测试，不是真实课程资料。';
const notes=titles.map((title,i)=>({id:randomUUID(),title,body:body.replace('项目需求定义',`${i+1}. 实践目标`),tags:tags[i],starred:i<3,createdAt:now,updatedAt:now}));
const achievements=[['面试助手 · AI 产品原型','product','launched',['React','FastAPI','Qwen']],['Nourish · 健康饮食管理 App','product','building',['SwiftUI','Vision','iOS']],['AI 产品 PRD 模板','work','building',['PRD','产品设计','模板']],['OneShowTools 工具平台','code','building',['Next.js','TypeScript']],['AI 面试助手评测报告','document','building',['调研','分析报告','PDF']],['我的学习总结','document','building',['AI OPC','阶段一']]].map(([title,type,stage,tags])=>({id:randomUUID(),title,type,stage,tags,description:'仅用于隔离测试：记录项目的目标、实现过程与实践收获。不会出现在真实账号或正式环境中。',url:'',createdAt:now,updatedAt:now}));
const state={tasks:[],checkIns:[],notes,favorites:[1],resourceFavorites:rows('SELECT id FROM content_items LIMIT 8').map(r=>({id:r.id,savedAt:now})),achievements};
run('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)',[user.id,JSON.stringify(state)]);
run("INSERT INTO progress(user_id,content_item_id,status) VALUES(?,1,'started')",[user.id]);
