import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const button=name=>page.getByRole('button',{name,exact:true});
const closed=()=>page.locator('#dialog').waitFor({state:'hidden'});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
const slot=n=>page.getByRole('checkbox',{name:`枠${n}の使用`,exact:true});
async function route(path){await page.goto(origin+'/#/'+path);await page.getByRole('heading',{level:1}).waitFor();}
async function assign(n,name){await slot(n).click();await page.getByLabel('割り当て先',{exact:true}).fill(name);await button('使用する').click();await closed();}
async function edit(quantity){await button('編集').click();await page.getByLabel('保有数',{exact:true}).fill(String(quantity));await button('保存する').click();}
try{
 await route('management');await button('管理リストを作る').click();await page.getByLabel('管理の種類',{exact:true}).selectOption('allocation');
 assert.equal(await page.getByLabel('テンプレート',{exact:true}).isVisible(),false);
 await page.getByLabel('対象名',{exact:true}).fill('ソフトウェアA');await page.getByLabel('保有数',{exact:true}).fill('10');await button('作成する').click();await closed();await page.locator('.allocation-counts').waitFor();
 const id=(await saved()).allocationLists[0].id,path='allocation/'+id;assert.equal((await saved()).schemaVersion,4);assert.equal(await page.getByRole('checkbox').count(),10);
 // Cancel a start: neither occupancy nor any name is persisted.
 await slot(1).click();await button('キャンセル').click();await closed();assert.equal(await slot(1).isChecked(),false);
 for(let n=1;n<=7;n++)await assign(n,'担当'+n);
 await assign(10,'<img src=x onerror=alert(1)> 共用PC');
 assert.match(await page.locator('.allocation-counts').textContent(),/保有 10 ／ 使用中 8 ／ 空き 2/);assert.equal(await page.locator('.allocation-assignee img').count(),0);
 await page.reload();await page.locator('.allocation-counts').waitFor();assert.equal(await slot(10).isChecked(),true);
 await slot(1).click();await button('キャンセル').click();await closed();assert.equal(await slot(1).isChecked(),true);
 await slot(1).click();await button('解除する').click();await closed();assert.equal(await slot(1).isChecked(),false);assert.ok(!JSON.stringify((await saved()).allocationLists).includes('担当1'));
 await assign(1,'田中');
 await edit(7);await page.getByRole('alert').filter({hasText:'先に使用を解除'}).waitFor();assert.equal((await saved()).allocationLists[0].quantity,10);
 await page.getByLabel('保有数',{exact:true}).fill('8');await button('保存する').click();await closed();assert.equal(await page.getByRole('checkbox').count(),8);
 assert.equal((await saved()).allocationLists[0].assignments.length,8);assert.match(await page.locator('.allocation-counts').textContent(),/空き 0/);
 await edit(12);await closed();assert.equal(await page.getByRole('checkbox').count(),12);assert.match(await page.locator('.allocation-counts').textContent(),/空き 4/);
 await route('management');await page.locator(`a[href="#/${path}"]`).waitFor();assert.match(await page.locator(`a[href="#/${path}"]`).textContent(),/使用中 8/);
 await route('lists');assert.equal(await page.locator('main a[href="#/actions"]').count(),0);
 await route(path);
 for(const width of [320,375,412,768,1280]){await page.setViewportSize({width,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal((await button('編集').boundingBox()).height,44);}
 await page.setViewportSize({width:375,height:812});await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/allocation-mobile.png',fullPage:true});
 // Stale dialogs cannot overwrite another tab's current assignment or quantity.
 await button('編集').click();await page.getByLabel('保有数',{exact:true}).fill('20');
 const other=await context.newPage();await other.goto(origin+'/#/'+path);await other.getByRole('checkbox',{name:'枠9の使用',exact:true}).click();await other.getByLabel('割り当て先',{exact:true}).fill('別画面');await other.getByRole('button',{name:'使用する',exact:true}).click();await other.locator('#dialog').waitFor({state:'hidden'});
 await button('保存する').click();await page.getByRole('alert').filter({hasText:'別の画面'}).waitFor();assert.equal((await saved()).allocationLists[0].quantity,12);await button('キャンセル').click();await button('入力を破棄して閉じる').click();await closed();await other.close();
 // Large capacities remain usable without rendering or storing every vacant slot.
 await edit(1000);await closed();assert.equal(await page.getByRole('checkbox').count(),50);await button('次へ').click();await slot(51).waitFor();await assign(51,'営業部');assert.equal(await slot(51).isChecked(),true);
 await page.reload();await page.locator('.allocation-counts').waitFor();assert.equal(await page.getByRole('checkbox').count(),50);
 // Changing unrelated settings must not downgrade schema 4 or discard allocations.
 await route('settings');await button('通知時刻を変更').click();await page.getByLabel('通知時刻',{exact:true}).fill('1030');await button('保存する').click();await closed();assert.equal((await saved()).schemaVersion,4);
 const before=await saved(),download=page.waitForEvent('download');await button('JSONを書き出す').click();const file=await download,downloadPath=await file.path();
 await page.locator('#import-file').setInputFiles(downloadPath);await page.getByRole('dialog').filter({hasText:'利用枠管理 1件'}).waitFor();await button('追加する').click();await closed();assert.equal((await saved()).allocationLists.length,2);
 const after=await saved();assert.deepEqual(after.allocationLists[1].assignments,before.allocationLists[0].assignments);assert.notEqual(after.allocationLists[1].id,id);assert.equal(after.settings.expiryNotificationTime,'10:30');
 await route(path);await button('利用枠管理を削除').click();await button('キャンセル').click();await closed();assert.equal((await saved()).allocationLists.length,2);
 await button('利用枠管理を削除').click();await button('削除する').click();await closed();assert.equal((await saved()).allocationLists.length,1);
 await route('allocation/'+after.allocationLists[1].id);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await context.setOffline(true);await page.reload();await page.locator('.allocation-counts').waitFor();assert.match(await page.locator('.allocation-counts').textContent(),/保有 1000/);await context.setOffline(false);
 assert.deepEqual(errors,[]);
 console.log('Allocation: quantity creation, assignment/cancel/release, counts, safe shrink/increase, 5 widths, XSS, stale edits, pagination, schema retention, backup/import, delete, offline: OK');
}catch(error){console.error(error,page.url(),await page.locator('main').textContent({timeout:1000}).catch(()=>''));throw error;}finally{await browser.close();}
