// Isolated UI verification; never uses the workspace or production database.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {importOpcCurriculum} from '../deploy/import-opc-curriculum.mjs';
const dir=process.argv[2];assert.match(dir,/^\/tmp\/oneshowlearn-curriculum-[a-zA-Z0-9]+$/);
assert.ok(!existsSync(`${dir}/preview.db`),'Use a new isolated preview');
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:`${dir}/preview.db`,UPLOAD_DIR:`${dir}/uploads`,JWT_SECRET:'isolated-curriculum-preview-only',APP_ORIGIN:'http://127.0.0.1:4181',API_PORT:'8793'});
const {run}=await import('../server/db.mjs');const {createApp}=await import('../server/index.mjs');
const email='curriculum-preview@example.com',password='Preview-Only-2026';
run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'admin',1)",[email,bcrypt.hashSync(password,4),'课程预览']);
run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','AI 产品从 0 到 1','published')");
const server=createApp().listen(8793,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const data=JSON.parse(readFileSync(new URL('../docs/curriculum/ai-opc-20261001.json',import.meta.url)));
await importOpcCurriculum({base:'http://127.0.0.1:8793/api',email,password,data,journalPath:`${dir}/manifest.json`,publish:true,media:{videoPath:`${dir}/demo.mp4`,pptPath:new URL('../artifacts/course-template/output/OneShowLearn-录课通用模板.pptx',import.meta.url),slides:Array.from({length:14},(_,i)=>new URL(`../artifacts/course-template/.build/render/${String(i+1).padStart(2,'0')}.png`,import.meta.url))}});
console.log('Isolated curriculum preview ready on API 8793; no existing data modified.');
