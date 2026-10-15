import {spawnSync} from 'node:child_process';
// Account-menu acceptance is part of account-refinement; every suite uses only isolated fixtures.
// Existing API/failure suites explicitly use CSR shells; public-seo separately tests actual SSR/no-JS documents.
const checks=['commercial','account-refinement','workbench','course-refinement','project-catalog','tutor-studio','resource-library','community-editorial','notes-library','favorites-library','favorite-integration','achievement-library','homepage-commercial','functional-hardening','performance','commercial-completion','public-seo'];
for(const name of checks){const result=spawnSync(process.execPath,[`scripts/check-${name}-ui.mjs`,...(name==='account-refinement'?['--menu']:[])],{stdio:'inherit'});if(result.error||result.status!==0){console.error(`Error: isolated ${name} browser suite failed (status=${result.status}, signal=${result.signal||'none'}, code=${result.error?.code||'none'})`);process.exit(1);}}
