import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
test('strict container inputs include every reviewed public asset without admitting private folders',()=>{
  const docker=readFileSync('Dockerfile','utf8'),ignore=readFileSync('.dockerignore','utf8'),manage=readFileSync('deploy/portable/manage.mjs','utf8');assert.match(docker,/COPY public\/assets \.\/public\/assets/);assert.ok(manage.includes("'src','public','server'"));
  for(const name of readdirSync('public/assets')){assert.match(name,/^[A-Za-z0-9_.-]+\.(?:png|webp|txt)$/);assert.ok(ignore.split('\n').includes('!public/assets/'+name),'Explicit reviewed input '+name);assert.ok(readFileSync('public/assets/'+name).equals(readFileSync('dist/client/assets/'+name)),'Every public input is preserved byte-for-byte in the release '+name);}
  assert.doesNotMatch(ignore,/!public\/\*|!public\/\*\*|!public\/assets\/\*/);
});
