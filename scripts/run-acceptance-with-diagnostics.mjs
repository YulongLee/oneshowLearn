// CI-only visibility into provider-free test failures; no retries or masking.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function acceptanceFailureEvidence(result) {
 const tail=(value,lines,limit)=>String(value||'').replace(/[A-Za-z0-9+/=]{80,}/g,'[long fixture value omitted]').split('\n').slice(-lines).join('\n').slice(-limit);
 return ['Child exit status='+result.status+' signal='+(result.signal||'none')+' code='+(result.error?.code||'none'),'Original stderr (tail):',tail(result.stderr,60,3600)||'(empty)','Last stdout:',tail(result.stdout,12,1000)||'(empty)'].join('\n').slice(0,5000);
}
export function buildFailureEvidence(result) {
 const clean=value=>String(value||'').replace(/[A-Za-z0-9+/=]{80,}/g,'[long fixture value omitted]');
 const tail=(value,lines,limit)=>clean(value).split('\n').slice(-lines).join('\n').slice(-limit);
 const directed=(value,limit)=>{
  const lines=clean(value).split('\n'),rank=line=>/\bnot ok(?:\s+\d+)?\b|\bAssertionError\b/.test(line)?0:/\bnpm (?:ERR!|error)\b/.test(line)?1:/\bERROR(?:[ :]|$)/.test(line)?2:3;
  const anchors=lines.map((line,index)=>({index,rank:rank(line)})).filter(item=>item.rank<3).sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,4),selected=new Set();
  for(const {index} of anchors)for(let at=Math.max(0,index-2);at<=Math.min(lines.length-1,index+10);at++)selected.add(at);
  if(!anchors.length)return '(no matching failure line in captured output)';
  // Put the strongest original failure lines before their bounded context so
  // long progress lines cannot crowd the actual assertion out of the annotation.
  const failures=anchors.map(({index})=>lines[index].slice(0,240)).join('\n'),context=[...selected].sort((a,b)=>a-b).map(index=>lines[index].slice(0,180)).join('\n');
  return (failures+'\nNearby original lines:\n'+context).slice(0,limit);
 };
 return [('Child exit status='+result.status+' signal='+(result.signal||'none')+' code='+(result.error?.code||'none')).slice(0,240),'Original stderr (tail):',tail(result.stderr,40,1400)||'(empty)','Build failure context from original stderr:',directed(result.stderr,1200),'Build failure context from original stdout:',directed(result.stdout,1800),'Last stdout:',tail(result.stdout,8,200)||'(empty)'].join('\n').slice(0,5000);
}
export function runAcceptance(args=process.argv.slice(2)) {
const [command,...extra]=args;
if(!['check:dependencies','test','test:browser','test:deployment','build'].includes(command)||
 (['test:deployment','build'].includes(command) ? extra.length!==2||extra[0]!=='--release'||!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(extra[1]) : extra.length!==0))throw Error('Choose check:dependencies, test, test:browser, test:deployment --release NAME or build --release NAME');
const npmArgs=command==='build'?['run','ops','--','build',...extra]:['run',command,...(extra.length?['--',...extra]:[])];
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',npmArgs,{encoding:'utf8',maxBuffer:20*1024*1024});
const text=(result.stdout||'')+(result.stderr||'');process.stdout.write(text);
if(result.error||result.status!==0||command==='build'&&result.signal) {
 const evidence=command==='build'?buildFailureEvidence(result):acceptanceFailureEvidence(result);
 if(process.env.GITHUB_ACTIONS==='true')console.log('::error title='+command+' acceptance failure::'+evidence.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
 process.exit(result.status||1);
}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)runAcceptance();
