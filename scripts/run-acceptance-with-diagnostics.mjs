// CI-only visibility into provider-free test failures; no retries or masking.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function acceptanceFailureEvidence(result) {
 const tail=(value,lines,limit)=>String(value||'').replace(/[A-Za-z0-9+/=]{80,}/g,'[long fixture value omitted]').split('\n').slice(-lines).join('\n').slice(-limit);
 return ['Child exit status='+result.status+' signal='+(result.signal||'none')+' code='+(result.error?.code||'none'),'Original stderr (tail):',tail(result.stderr,60,3600)||'(empty)','Last stdout:',tail(result.stdout,12,1000)||'(empty)'].join('\n').slice(0,5000);
}
export function runAcceptance(args=process.argv.slice(2)) {
const [command,...extra]=args;
if(!['check:dependencies','test','test:browser','test:deployment'].includes(command)||
 (command==='test:deployment' ? extra.length!==2||extra[0]!=='--release'||!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(extra[1]) : extra.length!==0))throw Error('Choose check:dependencies, test, test:browser or test:deployment --release NAME');
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',command,...(extra.length?['--',...extra]:[])],{encoding:'utf8',maxBuffer:20*1024*1024});
const text=(result.stdout||'')+(result.stderr||'');process.stdout.write(text);
if(result.error||result.status!==0) {
 const evidence=acceptanceFailureEvidence(result);
 if(process.env.GITHUB_ACTIONS==='true')console.log('::error title='+command+' acceptance failure::'+evidence.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
 process.exit(result.status||1);
}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)runAcceptance();
