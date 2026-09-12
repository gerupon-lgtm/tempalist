import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {buildChecklistLink} from '../src/checklist-link.js';
import {APP_VERSION} from '../src/version.js';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812}}),page=await context.newPage();
await context.grantPermissions(['notifications']);
let fail=true,hold=null,held=null;
const deviceId='11111111-1111-4111-8111-111111111111';
await context.addInitScript(()=>{
 Object.defineProperty(Notification,'permission',{get:()=> 'granted'});
 Notification.requestPermission=async()=> 'granted';
 const value={endpoint:'https://push.example/PRIVATE_ENDPOINT',expirationTime:null,keys:{p256dh:'BA'+'A'.repeat(85),auth:'A'.repeat(22)}};
 const sub={toJSON:()=>value,unsubscribe:async()=>true};
 PushManager.prototype.getSubscription=async()=>sub;PushManager.prototype.subscribe=async()=>sub;
});
await context.route('https://api.atoqueue.sikumilab.com/v2/**',async route=>{
 const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON();
 if(r.method()==='GET')return route.fulfill({json:{publicKey:'BA'+'A'.repeat(85)}});
 if(r.method()==='POST')return route.fulfill({status:201,json:{appId:'tempalist',protocolVersion:2,deviceId,deviceSecret:'PRIVATE_SECRET',createdAt:new Date().toISOString()}});
 if(hold){held?.();await hold;}
 if(fail)return route.fulfill({status:503,headers:{'Retry-After':'3600'},json:{error:{code:'INTERNAL_ERROR',message:'PRIVATE_ERROR'}}});
 return route.fulfill({status:201,json:{reminderId:path.split('/').at(-1),status:'pending',scheduledAt:body.scheduledAt,repeatCadence:null,updatedAt:new Date().toISOString()}});
});
async function report(){
 await page.getByRole('button',{name:'通知の診断情報',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-copy-diagnostics]')?.disabled===false);
 const value=JSON.parse(await page.locator('[data-diagnostic-report]').inputValue());
 await page.getByRole('button',{name:'閉じる',exact:true}).click();return value;
}
try{
 await page.clock.install();
 await page.goto(buildChecklistLink({schemaVersion:1,kind:'checklist-create',source:'atoqueue',requestId:'22222222-2222-4222-8222-222222222222',title:'PRIVATE_TITLE',items:[{sourceTaskId:'PRIVATE_TASK',label:'PRIVATE_CONTENT'}]},origin));
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'通知を設定',exact:true}).click();await page.getByLabel('このリストの通知を受け取る').check();
 const date=await page.evaluate(()=>{const d=new Date(Date.now()+3*86400000);return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;});
 await page.locator('#dialog [name=date]').fill(date);await page.locator('#dialog [name=time]').fill('1500');
 await page.getByRole('button',{name:'保存する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.match(await page.locator('#toast').textContent(),/未同期の処理があります/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].notificationEnabled),true);
 await page.getByRole('link',{name:'設定',exact:true}).click();
 const failed=await report();assert.equal(failed.version,APP_VERSION);assert.equal(failed.pending,3);
 assert.equal(failed.events.filter(e=>e.event==='failed').length,3);
 assert.equal(failed.events.filter(e=>e.event==='accepted').length,0);
 assert.equal(failed.browser.receiverVersion,APP_VERSION);assert.equal(failed.browser.subscriptionMatchesLocal,true);assert.equal(failed.browser.pushHistoryAvailable,true);
 assert.doesNotMatch(JSON.stringify(failed),/PRIVATE|deviceId|deviceSecret|endpoint|p256dh|sourceTaskId/);
 await page.reload();await page.getByRole('button',{name:'通知の診断情報',exact:true}).waitFor();
 assert.equal((await report()).events.filter(e=>e.event==='failed').length,3);
 fail=false;await page.getByRole('button',{name:'通知の同期を再試行',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-action=retry-notifications]')?.disabled===false);
 const accepted=await report();assert.equal(accepted.pending,0);assert.equal(accepted.events.filter(e=>e.event==='accepted').length,3);
 assert.deepEqual(accepted.reservations.map(r=>r.reminderId),failed.reservations.map(r=>r.reminderId));
 assert.doesNotMatch(JSON.stringify(accepted),/PRIVATE|deviceId|deviceSecret|endpoint|p256dh/);
 await page.getByRole('button',{name:'通知の表示テスト',exact:true}).click();
 await page.locator('[data-display-test-result]').filter({hasText:/表示要求/}).waitFor();
 const shown=await report();assert.equal(shown.browser.pushEvents.at(-1).source,'local-test');assert.ok(['display-accepted','display-failed'].includes(shown.browser.pushEvents.at(-1).event));
 // Clipboard completion must not change a replacement modal.
 await page.getByRole('button',{name:'通知の診断情報',exact:true}).click();
 await page.evaluate(()=>{navigator.clipboard.writeText=()=>new Promise(resolve=>{window.resolveDiagnosticCopy=resolve;});});
 await page.getByRole('button',{name:'診断情報をコピー',exact:true}).click();await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('button',{name:'通知の診断情報',exact:true}).click();
 await page.evaluate(()=>window.resolveDiagnosticCopy());
 assert.doesNotMatch(await page.locator('[data-copy-result]').textContent(),/コピーしました/);
 await page.getByRole('button',{name:'閉じる',exact:true}).click();
 // A slow API must not hold the save dialog forever or falsely report completion.
 let release;hold=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{held=resolve;});
 await page.getByRole('link',{name:'リスト',exact:true}).click();await page.getByRole('button',{name:'通知を設定',exact:true}).click();
 await page.locator('#dialog [name=time]').fill('1600');
 await page.getByRole('button',{name:'保存する',exact:true}).click();await started;
 assert.equal(await page.locator('[data-dialog-cancel]').isDisabled(),true);
 await page.clock.fastForward(10001);await page.locator('#dialog').waitFor({state:'hidden'});
 assert.match(await page.locator('#toast').textContent(),/確認が続いています/);
 hold=null;release();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:notification')).outbox.length===0);
 console.log('Diagnostics: save failure shown without losing list, secret-free history survives reload, retry acknowledged with stable reservation IDs: OK');
}finally{await browser.close();}
