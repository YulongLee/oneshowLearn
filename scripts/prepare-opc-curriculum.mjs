import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const chapters=[
 ['产品与机会','找到一个值得做的 AI 产品','做什么？','Idea + 用户 + 需求验证 + 竞品 + 定位 + 商业模式 + MVP + PRD + 原型'],
 ['AI 产品开发','用 AI Coding 做出真正可运行的 MVP','怎么做？','GitHub + 前端 + 后端 + 数据库 + AI + 用户系统 + 可运行 MVP'],
 ['上线与合规','把 MVP 变成真正存在于互联网的产品','怎么上线？','域名 + HTTPS + 服务器 + 生产环境 + 合规材料 + 正式上线'],
 ['收款与商业化','让产品完成第一笔真实收入','怎么赚钱？','Pricing + 支付 + 订单 + 会员 + 权益 + 商业数据 + 第一笔收入'],
 ['运营与增长','获得第一批真实用户','用户从哪里来？','第一批用户 + SEO + 内容矩阵 + 增长漏斗 + 数据分析 + AI 自动化增长系统'],
];
export function parseCurriculum(source) {
 const data={schemaVersion:1,sourceSha256:createHash('sha256').update(source).digest('hex'),slug:'ai-opc-product-company',title:'AI OPC｜一个人的 AI 产品公司',positioning:'从 0 到 1，借助 AI 独立完成一个真实 AI 产品。',graduationGoal:'拥有一个真正上线、可以收钱、并获得真实用户的 AI 产品。',notice:'课程大纲已更新，视频、PPT、Demo、实操材料及模板/Prompt 将陆续补充。当前页面为课程规划，不代表完整教学内容已经交付，也不保证学习者的收入或获客结果。',teachingTemplate:['课程目标','核心知识','Demo','实操','作业','模板/Prompt','阶段成果','下一章'],chapters:chapters.map(([title,goal,question,outcome],i)=>({number:i+1,title,goal,question,outcome,sections:[]}))};
 let section,group='';
 for(const raw of source.split(/\r?\n/)) {
  const line=raw.trim();const heading=/^([1-5])\.(\d+) (.+)$/.exec(line);
  if(heading){section={number:`${heading[1]}.${heading[2]}`,title:heading[3],topics:[],context:''};data.chapters[Number(heading[1])-1].sections.push(section);group='';continue;}
  if(!section)continue;
  const numbered=/^\* (([1-5]\.\d+)\.\d+) (.+)$/.exec(line);
  if(numbered){assert.equal(numbered[2],section.number);section.topics.push({number:numbered[1],title:numbered[3]});continue;}
  if(section.number==='5.6'){
   if(line==='国内：'||line==='海外：')group=line.slice(0,-1);
   else if(line.startsWith('* ')&&group)section.topics.push({number:'',title:line.slice(2),group});
   if(line==='根据目标用户选择渠道。')section.context='根据目标用户选择渠道，不要求每个平台都做。';
  }
  if(section.number==='2.2'&&line.startsWith('Requirement →'))section.context=line;
  if(section.number==='5.2'&&line.startsWith('Impression →'))section.context=line;
 }
 assert.deepEqual(data.chapters.map(c=>c.sections.length),[7,10,7,7,9]);
 for(const c of data.chapters)c.sections.forEach((s,i)=>{assert.equal(s.number,`${c.number}.${i+1}`);assert.ok(s.topics.length>0);});
 data.counts={chapters:5,sections:40,numberedTopics:data.chapters.flatMap(c=>c.sections).flatMap(s=>s.topics).filter(t=>t.number).length,channelEntries:data.chapters[4].sections[5].topics.length};
 return data;
}
export function sectionBody(data,chapter,section){
 return `# ${section.number} ${section.title}\n\n> ${data.notice}\n\n## 本章目标\n\n${chapter.goal}\n\n核心问题：${chapter.question}\n\n## 本节知识点\n\n${section.context?`${section.context}\n\n`:''}${section.topics.map(t=>`- ${t.number?`${t.number} `:t.group?`${t.group} · `:''}${t.title}`).join('\n')}\n\n## 阶段成果\n\n${chapter.outcome}\n\n## 后续教学材料\n\n视频、PPT、Demo、实操说明、作业与模板/Prompt 待补充。\n\n统一教学结构：${data.teachingTemplate.join(' → ')}`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=readFileSync(process.argv[2],'utf8');const data=parseCurriculum(source);
 mkdirSync('docs/curriculum',{recursive:true});writeFileSync('docs/curriculum/ai-opc-20261001.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data.counts));
}
