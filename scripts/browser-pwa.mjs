import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {APP_VERSION} from '../src/version.js';
let phase='old';const old=new Map(),errors=[];
const nextVersion=APP_VERSION+'-test';
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const path=['/','/list/'].includes(pathname)?'index.html':['/update','/update/'].includes(pathname)?'update/index.html':pathname.slice(1);
 if(!/^(index.html|update\/index.html|sw.js|manifest.webmanifest|src\/[\w/.-]+|assets\/[\w.-]+)$/.test(path))throw Error();
 let content;
 if(phase!=='old'){
  content=await readFile(path);
  if(phase==='next'&&['sw.js','src/version.js','manifest.webmanifest'].includes(path))content=Buffer.from(content.toString().replaceAll(APP_VERSION,nextVersion));
 }else{
  if(!old.has(path))old.set(path,execFileSync('git',['-c','safe.directory='+process.cwd(),'show','7c86310:'+path],{stdio:['ignore','pipe','pipe']}));
  content=old.get(path);
 }
 res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.webmanifest')?'application/manifest+json':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'text/html','Cache-Control':path==='sw.js'?'no-cache':'max-age=3600'});res.end(content);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
async function oldPage(){
 phase='old';const context=await browser.newContext({viewport:{width:375,height:812}}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();
 assert.equal(await page.locator('#version').textContent(),'v0.2.1');
 await page.getByRole('button',{name:'リストを作る',exact:true}).first().click();await page.getByLabel('タイトル',{exact:true}).fill('更新しても残す記録');
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 const raw=await page.evaluate(()=>localStorage.getItem('tempalist:data'));
 return {context,page,raw};
}
try{
 let {context,page,raw}=await oldPage();phase='current';
 await page.evaluate(async()=>{window.testReg=await navigator.serviceWorker.ready;await window.testReg.update();});
 await page.waitForFunction(()=>Boolean(window.testReg.waiting));
 const cached=await page.evaluate(async version=>(await (await caches.open('tempalist-shell-'+version)).match('/src/version.js')).text(),APP_VERSION);
 assert.ok(cached.includes(`APP_VERSION = '${APP_VERSION}'`),'new SW must not precache stale HTTP assets');
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('button',{name:'新しいバージョンに更新',exact:true}).click();
 await page.waitForFunction(version=>document.querySelector('#version')?.textContent==='v'+version,APP_VERSION);
 assert.equal(await page.evaluate(()=>localStorage.getItem('tempalist:data')),raw);
 assert.equal(await page.getByRole('button',{name:'更新を確認する',exact:true}).isVisible(),true);
 assert.match(await page.locator('[data-install-help]').textContent(),/ホーム画面に追加/);
 // A browser-supplied prompt is offered but never invoked without a click.
 await page.evaluate(()=>{
  const event=new Event('beforeinstallprompt',{cancelable:true});window.installCalls=0;
  event.prompt=async()=>{window.installCalls++;};event.userChoice=Promise.resolve({outcome:'dismissed'});window.installEvent=event;dispatchEvent(event);
 });
 await page.locator('#pwa-install').waitFor();assert.equal(await page.evaluate(()=>window.installCalls),0);
 await page.getByRole('link',{name:'リスト',exact:true}).click();
 await page.getByRole('link',{name:'設定',exact:true}).click();
 assert.match(await page.locator('[data-install-help]').textContent(),/ホーム画面に追加/);
 assert.equal(await page.getByRole('button',{name:'アプリをインストール',exact:true}).isVisible(),true);
 await page.locator('#pwa-install [data-pwa-action=install]').click();
 assert.equal(await page.evaluate(()=>window.installCalls),1);assert.equal(await page.locator('#pwa-install').isVisible(),false);
 // A later update is visible on the checklist, and unsaved remarks block reload.
 await page.getByRole('link',{name:'リスト',exact:true}).click();await page.getByRole('textbox',{name:'リスト全体の備考'}).fill('更新前に保存する備考');
 phase='next';await page.evaluate(async()=>{window.testReg=await navigator.serviceWorker.ready;await window.testReg.update();});
 await page.locator('#pwa-update').waitFor();await page.locator('#pwa-update [data-pwa-action=update]').click();
 await page.locator('#pwa-update').filter({hasText:'入力を保存'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'リスト全体の備考'}).inputValue(),'更新前に保存する備考');
 await page.getByRole('button',{name:'備考を保存',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].remarks==='更新前に保存する備考');
 await page.locator('#pwa-update [data-pwa-action=update]').click();
 await page.waitForFunction(version=>document.querySelector('#version')?.textContent==='v'+version,nextVersion);
 assert.equal(await page.getByRole('textbox',{name:'リスト全体の備考'}).inputValue(),'更新前に保存する備考');
 await context.setOffline(true);await page.reload();assert.equal(await page.getByRole('textbox',{name:'リスト全体の備考'}).inputValue(),'更新前に保存する備考');
 await context.close();
 // A separate recovery route remains accessible even with v0.2.1's cache-first worker.
 ({context,page,raw}=await oldPage());phase='current';
 await page.goto(origin+'/update/');await page.getByRole('button',{name:'更新を確認・適用する',exact:true}).click();
 await page.locator('#update-status').filter({hasText:'完了しました'}).waitFor();
 await page.getByRole('link',{name:'アプリへ戻る',exact:true}).click();
 await page.waitForFunction(version=>document.querySelector('#version')?.textContent==='v'+version,APP_VERSION);
 assert.equal(await page.evaluate(()=>localStorage.getItem('tempalist:data')),raw);
 assert.deepEqual(errors,[]);await context.close();
 console.log('PWA: real v0.2.1 upgrade with stale HTTP cache, saved-data retention, install promotion, visible update banner, unsaved-input guard, offline reload and dedicated recovery route: OK');
}finally{await browser.close();server.close();}
