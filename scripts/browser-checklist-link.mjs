import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {buildChecklistLink} from '../src/checklist-link.js';
import {shareTemplate} from '../src/transfer.js';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
const payload={schemaVersion:1,kind:'checklist-create',source:'atoqueue',requestId:'11111111-1111-4111-8111-111111111111',title:'今日の買い物 🛒',items:[{sourceTaskId:'task-milk',label:'牛乳',note:'2本\n冷蔵'},{sourceTaskId:'task-battery',label:'電池 <script>bad()</script>',note:'単3を4本'}]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const ios=process.argv.includes('--ios');
const context=await browser.newContext({viewport:{width:375,height:812},...(ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',hasTouch:true}:{})}),page=await context.newPage(),errors=[],apiRequests=[];
context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
page.on('pageerror',error=>errors.push(error.message));
await context.route('https://api.atoqueue.sikumilab.com/**',route=>{apiRequests.push(route.request().url());return route.abort();});
const lists=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists);
const link=buildChecklistLink(payload,origin);
try{
 await page.goto(link);await page.getByRole('heading',{name:'あとキューからリストを作る',exact:true}).waitFor();
 assert.equal((await lists(page)).length,0);
 if(ios)assert.match(await page.locator('#dialog').textContent(),/iPhone・iPadの連携は動作確認中/);
 assert.equal(await page.locator('.checklist-link-preview li').count(),2);
 assert.equal(await page.locator('.checklist-link-preview script').count(),0);
 assert.match(await page.locator('.checklist-link-preview').textContent(),/2本\n冷蔵/);
 await page.getByLabel('リスト名',{exact:true}).fill('週末の買い物');
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/checklist-link-preview.png'});
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 const first=(await lists(page))[0];assert.equal(first.title,'週末の買い物');
 assert.deepEqual(first.items.map(i=>[i.label,i.sourceTaskId,i.checked,i.checkedAt]),payload.items.map(i=>[i.label,i.sourceTaskId,false,null]));
 assert.equal(first.notificationEnabled,false);assert.equal(first.dueAt,null);assert.equal(first.receivedFrom.requestId,payload.requestId);
 assert.equal(new URL(page.url()).hash,'#/checklist/'+first.id);
 await page.getByRole('checkbox').first().check();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].checked);
 await page.reload();assert.equal((await lists(page))[0].items[0].sourceTaskId,'task-milk');
 await page.goto(link);await page.getByRole('heading',{name:'週末の買い物',exact:true}).waitFor();
 assert.equal((await lists(page)).length,1);assert.equal((await lists(page))[0].items[0].checked,true);
 // A hot launch must not replace the current edit form or its input.
 await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByLabel('タイトル',{exact:true}).fill('保存前');
 const secondLink=buildChecklistLink({...payload,requestId:'22222222-2222-4222-8222-222222222222'},origin);
 await page.evaluate(url=>location.hash=new URL(url).hash,secondLink);
 await page.locator('#toast').filter({hasText:'入力を保存するか'}).waitFor();
 assert.equal(await page.getByLabel('タイトル',{exact:true}).inputValue(),'保存前');
 assert.equal(new URL(page.url()).hash,'#/checklist/'+first.id);
 await page.getByRole('button',{name:'キャンセル',exact:true}).click();await page.getByRole('button',{name:'入力を破棄して閉じる',exact:true}).click();
 // Concurrent previews are deduplicated when saved, using the current stored state.
 await page.evaluate(url=>location.hash=new URL(url).hash,secondLink);
 await page.getByRole('heading',{name:'あとキューからリストを作る',exact:true}).waitFor();
 const other=await context.newPage();await other.goto(secondLink);await other.getByRole('heading',{name:'あとキューからリストを作る',exact:true}).waitFor();
 await Promise.all([page.getByRole('button',{name:'作成する',exact:true}).click(),other.getByRole('button',{name:'作成する',exact:true}).click()]);
 await page.locator('#dialog').waitFor({state:'hidden'});await other.locator('#dialog').waitFor({state:'hidden'});
 assert.equal((await lists(page)).length,2);assert.equal(new URL(page.url()).hash,new URL(other.url()).hash);await other.close();
 // Cancellation and bad input never save a list.
 const thirdLink=buildChecklistLink({...payload,requestId:'33333333-3333-4333-8333-333333333333'},origin);
 await page.goto(thirdLink);await page.getByRole('button',{name:'キャンセル',exact:true}).click();
 assert.equal(new URL(page.url()).hash,'#/lists');assert.equal((await lists(page)).length,2);
 await page.goto(origin+'/#create=%%%');await page.locator('#toast').filter({hasText:'読み取れません'}).waitFor();assert.equal((await lists(page)).length,2);
 // Existing template links retain their draft-template import flow.
 const shared=shareTemplate({name:'従来の共有',items:[{label:'確認',note:''}]},origin);
 await page.goto(shared.url);await page.getByRole('heading',{name:'共有テンプレートの確認',exact:true}).waitFor();
 await page.getByRole('button',{name:'下書きに追加',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal((await lists(page)).length,2);
 // Saving waits for an atomic store lock; cancel/Escape must not pretend it was aborted.
 const queuedLink=buildChecklistLink({...payload,requestId:'44444444-4444-4444-8444-444444444444'},origin);
 await page.goto(queuedLink);await page.getByRole('button',{name:'作成する',exact:true}).waitFor();
 const holder=await context.newPage();await holder.goto(origin);await holder.getByRole('heading',{level:1}).waitFor();
 await holder.evaluate(()=>{void navigator.locks.request('tempalist:data',()=>new Promise(resolve=>{window.releaseDataLock=resolve;window.dataLockHeld=true;}));});
 await holder.waitForFunction(()=>window.dataLockHeld);
 await page.getByRole('button',{name:'作成する',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'キャンセル',exact:true}).isDisabled(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').isVisible(),true);
 await page.evaluate(url=>location.hash=new URL(url).hash,shared.url);
 await page.locator('#toast').filter({hasText:'保存中'}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'あとキューからリストを作る',exact:true}).isVisible(),true);
 await holder.evaluate(()=>window.releaseDataLock());await holder.close();
 await page.locator('#dialog').waitFor({state:'hidden'});assert.equal((await lists(page)).length,3);
 // Storage failures restore the preview controls and do not save a partial receipt.
 await page.goto(thirdLink);await page.getByRole('button',{name:'作成する',exact:true}).waitFor();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='tempalist:data')throw new Error('test write failure');return original.call(this,key,value);};});
 await page.getByRole('button',{name:'作成する',exact:true}).click();
 await page.locator('.form-error').filter({hasText:'保存できませんでした'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'キャンセル',exact:true}).isEnabled(),true);
 assert.equal((await lists(page)).length,3);await page.getByRole('button',{name:'キャンセル',exact:true}).click();
 assert.deepEqual(errors,[]);assert.deepEqual(apiRequests,[]);
 console.log('Checklist links: cold/hot launch, preview, UTF-8, escaped content, source IDs, checks/reload, retries, concurrent creation, draft guard, cancel, invalid payload and legacy sharing: OK');
}finally{await browser.close();}
