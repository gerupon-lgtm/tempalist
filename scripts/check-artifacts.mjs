import {mkdtemp,mkdir,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {resolve,relative} from 'node:path';
await mkdir('artifacts',{recursive:true});
const temporary=await mkdtemp(resolve('artifacts/version-check-'));
for(const folder of ['src','scripts'])await mkdir(`${temporary}/${folder}`);
for(const file of ['package.json','manifest.webmanifest','src/version.js','scripts/check.mjs'])await cp(file,`${temporary}/${file}`);
const manifest=JSON.parse(await readFile(`${temporary}/manifest.webmanifest`,'utf8'));manifest.version='0.0.0-mismatch';
await writeFile(`${temporary}/manifest.webmanifest`,JSON.stringify(manifest));
const check=spawnSync(process.execPath,[`${temporary}/scripts/check.mjs`],{encoding:'utf8'});
assert.notEqual(check.status,0);assert.match(check.stderr,/Version or app identity mismatch/);
const packaged=await readdir('_site');
assert.deepEqual(packaged.sort(),['.nojekyll','CNAME','assets','index.html','list','manifest.webmanifest','src','sw.js'].sort());
assert.deepEqual(await readFile('sw.js'),await readFile('_site/sw.js'));
assert.equal(await readFile('_site/CNAME','utf8'),'tempalist.sikumilab.com\n');
assert.equal(await readFile('_site/index.html','utf8'),await readFile('_site/list/index.html','utf8'));
const sourceEntries=await readdir('src',{recursive:true,withFileTypes:true});
for(const entry of sourceEntries){
  if(!entry.isFile())continue;
  const source=resolve(entry.parentPath,entry.name);
  const destination=resolve('_site','src',relative(resolve('src'),source));
  assert.deepEqual(await readFile(source),await readFile(destination));
}
console.log('Version mismatch rejected; static package contains current app files only: OK');
