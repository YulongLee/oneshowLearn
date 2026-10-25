// Runs only in the disposable, network-disabled Linux compatibility container.
// This is not a production probe and contains no configuration or credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runtimeTree,digestObject} from './security-dependency-policy.mjs';
import {createHash} from 'node:crypto';

const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export function inspectSecurityRuntime(){
  assert.equal(process.platform,'linux');
  assert.equal(process.arch,'x64');
  assert.equal(process.version,'v22.14.0','Verify on the existing production Node version, not the build Node');
  assert.equal(process.cwd(),'/candidate');
  const command=[process.execPath,'--test','tests/dependency-security.test.mjs'];
  const child=spawnSync(command[0],command.slice(1),{
    cwd:'/candidate',encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,
    env:{PATH:process.env.PATH,NODE_ENV:'test',TZ:'UTC'},
  });
  process.stdout.write(child.stdout||'');process.stderr.write(child.stderr||'');
  assert.equal(child.error,undefined,'The compatibility test must actually execute');
  assert.equal(child.signal,null);assert.equal(child.status,0,'All dependency compatibility tests must pass');
  // Tests and verification helpers are image-only evidence, never runtime files.
  const tree=Object.fromEntries(Object.entries(runtimeTree('/candidate')).filter(([name])=>
    ['package.json','package-lock.json','node_modules'].includes(name)||name.startsWith('node_modules/')));
  assert.ok(tree['package.json']&&tree['package-lock.json']&&tree.node_modules);
  const report={
    format:'oneshowlearn-security-runtime-report-v1',platform:process.platform,arch:process.arch,
    nodeVersion:process.version,nodeSha256:hash(process.execPath),
    packageSha256:hash('/candidate/package.json'),lockSha256:hash('/candidate/package-lock.json'),
    runtimeTreeSha256:digestObject(tree),runtimeTree:tree,
    test:{command,status:child.status,signal:child.signal},
  };
  console.log('SECURITY_RUNTIME_REPORT '+JSON.stringify(report));
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{assert.equal(process.argv.length,2);inspectSecurityRuntime();}
  catch(error){console.error(error?.stack||String(error));process.exitCode=1;}
}
