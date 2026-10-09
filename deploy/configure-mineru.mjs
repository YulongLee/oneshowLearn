// Private stdin only; never place a credential in argv, source, staging or output.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,statSync,chownSync,chmodSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
export function mineruEnvironment(text,key){
 assert.ok(typeof key==='string'&&/^[A-Za-z0-9._-]{16,512}$/.test(key),'Invalid MinerU token format');
 const old=parseEnv(text);assert.ok(!old.MINERU_API_KEY||old.MINERU_API_KEY===key,'Existing MinerU credential differs; stop for review');
 const base=text.replace(/^[ \t]*(?:export[ \t]+)?MINERU_API_KEY[ \t]*=.*(?:\r?\n|$)/gm,'');
 const next=old.MINERU_API_KEY===key?text:base+'\n# MinerU document parsing — private server credential\nMINERU_API_KEY='+JSON.stringify(key)+'\n';
 const settings=parseEnv(next);for(const [name,value] of Object.entries(old))if(name!=='MINERU_API_KEY')assert.ok(settings[name]===value,'Existing setting preserved: '+name);
 assert.ok(settings.MINERU_API_KEY===key,'MinerU credential installation validation failed');return next;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.getuid(),0);const target='/etc/oneshowlearn/oneshowlearn.env',text=readFileSync(target,'utf8');
 assert.equal(createHash('sha256').update(text).digest('hex'),process.argv[2],'Environment changed since release snapshot');
 const stat=statSync(target);assert.ok(stat.isFile()&&!(stat.mode&0o007));
 const next=mineruEnvironment(text,readFileSync(0,'utf8').trim()),temporary=target+'.mineru-'+process.pid;
 try{writeFileSync(temporary,next,{mode:stat.mode&0o777,flag:'wx'});chownSync(temporary,stat.uid,stat.gid);chmodSync(temporary,stat.mode&0o777);renameSync(temporary,target);}finally{try{unlinkSync(temporary);}catch{}}
 console.log('MinerU credential installed privately; other settings and file ownership preserved');
}
