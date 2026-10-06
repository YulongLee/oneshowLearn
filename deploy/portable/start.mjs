import {spawn} from 'node:child_process';
import {validateEnvironment} from './environment.mjs';
validateEnvironment(process.env);
const {DatabaseSync}=await import('node:sqlite');
const db=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:true});
try {for(const table of ['users','payment_checkouts','tutor_turns','manual_refund_records'])db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();}finally{db.close();}
const child=spawn(process.execPath,['server/index.mjs'],{stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',(code,signal)=>process.exit(code??(signal?1:0)));
child.on('error',()=>{console.error('Application process failed to start');process.exit(1);});
