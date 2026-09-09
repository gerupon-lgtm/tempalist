import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, APP_NAME, APP_ID } from '../src/version.js';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url)));
if (pkg.version !== APP_VERSION || manifest.version !== APP_VERSION || manifest.name !== APP_NAME || manifest.id !== `/${APP_ID}`) throw new Error('Version or app identity mismatch');
for (const name of await readdir(new URL('../src/', import.meta.url))) if (name.endsWith('.js')) execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/' + name, import.meta.url))], {stdio:'inherit'});
console.log('JavaScript syntax, version and application identity: OK');
