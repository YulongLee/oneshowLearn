// CI-only visibility into provider-free test failures; no retries or masking.
import {spawnSync} from 'node:child_process';
const command=process.argv[2];
const extra=process.argv.slice(3);
if(!['test','test:browser','test:deployment'].includes(command)||
 (command==='test:deployment' ? extra.length!==2||extra[0]!=='--release'||!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(extra[1]) : extra.length!==0))throw Error('Choose test, test:browser or test:deployment --release NAME');
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',command,...(extra.length?['--',...extra]:[])],{encoding:'utf8',maxBuffer:20*1024*1024});
const text=(result.stdout||'')+(result.stderr||'');process.stdout.write(text);
if(result.error||result.status!==0) {
 const lines=text.split('\n');
 const index=lines.findIndex(s=>/not ok|✖|ENOENT|AssertionError|Error:|locator\.|browserType\./.test(s));
 const evidence=lines.slice(Math.max(0,index),Math.max(0,index)+36).join('\n').slice(0,5000).replace(/[A-Za-z0-9+/=]{80,}/g,'[long fixture value omitted]');
 if(process.env.GITHUB_ACTIONS==='true')console.log('::error title='+command+' acceptance failure::'+evidence.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
 process.exit(result.status||1);
}
