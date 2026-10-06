import {spawnSync} from 'node:child_process';
// Account-menu acceptance is part of account-refinement; every suite uses only isolated fixtures.
const checks=['commercial','account-refinement','workbench','course-refinement','project-catalog','tutor-studio','resource-library','community-editorial','notes-library','favorites-library','favorite-integration','achievement-library','homepage-commercial','functional-hardening','performance'];
for(const name of checks){const result=spawnSync(process.execPath,[`scripts/check-${name}-ui.mjs`,...(name==='account-refinement'?['--menu']:[])],{stdio:'inherit'});if(result.error||result.status!==0)process.exit(1);}
