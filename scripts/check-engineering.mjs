import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8')),lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const canonical=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
if(canonical(pkg.dependencies)!==canonical(lock.packages[''].dependencies)||canonical(pkg.devDependencies)!==canonical(lock.packages[''].devDependencies))throw Error('Dependency lock mismatch');
for(const dir of ['server','scripts','deploy/portable'])for(const file of readdirSync(dir).filter(n=>n.endsWith('.mjs'))){const result=spawnSync(process.execPath,['--check',dir+'/'+file],{encoding:'utf8'});if(result.status!==0)throw Error('Syntax check failed: '+dir+'/'+file);}
for(const file of ['deploy/check-engineering-release.mjs','deploy/update-engineering.sh']){const shell=file.endsWith('.sh'),result=spawnSync(shell?'bash':process.execPath,[shell?'-n':'--check',file],{encoding:'utf8'});if(result.status!==0)throw Error('Release syntax check failed: '+file);}
for(const dir of ['scripts','deploy'])for(const name of readdirSync(dir).filter(n=>n.endsWith('.mjs'))){const source=readFileSync(dir+'/'+name,'utf8');if(/createRequire\(['"]\/Users\//.test(source))throw Error('Non-portable browser dependency: '+name);}
const diff=spawnSync('git',['diff','--check'],{encoding:'utf8'});if(diff.status!==0)throw Error('Whitespace verification failed');
console.log('Engineering syntax, lockfile and browser dependency portability checks passed');
