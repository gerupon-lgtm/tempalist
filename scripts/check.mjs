import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, APP_NAME, APP_ID } from '../src/version.js';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url)));
if (pkg.version !== APP_VERSION || manifest.version !== APP_VERSION || manifest.name !== APP_NAME || manifest.id !== `/${APP_ID}`) throw new Error('Version or app identity mismatch');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
if(!sw.includes(`const VERSION='${APP_VERSION}';`))throw new Error('Service Worker version mismatch');
execFileSync(process.execPath,['--check',fileURLToPath(new URL('../sw.js',import.meta.url))],{stdio:'inherit'});
for (const name of await readdir(new URL('../src/', import.meta.url),{recursive:true})) if (name.endsWith('.js')) {
  const normalized=name.replaceAll('\\','/');
  if(!sw.includes(`'/src/${normalized}'`))throw new Error(`Service Worker shell missing: ${normalized}`);
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/' + normalized, import.meta.url))], {stdio:'inherit'});
}
console.log('JavaScript syntax, version and application identity: OK');
