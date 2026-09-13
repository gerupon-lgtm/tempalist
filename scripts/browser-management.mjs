import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,timezoneId:'Asia/Tokyo'});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Page error:',error.message);});
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const button=(name)=>page.getByRole('button',{name,exact:true});
const closed=()=>page.locator('#dialog').waitFor({state:'hidden'});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
async function route(path){await page.goto(origin+'/#/'+path);await page.waitForFunction(()=>document.querySelector('main h1'));}
async function newManagement(name,templateId){
 await route('management');await button('管理リストを作る').click();
 await page.getByLabel('テンプレート',{exact:true}).selectOption(templateId);await page.getByLabel('管理リスト名',{exact:true}).fill(name);
 await button('作成する').click();await closed();await page.getByRole('heading',{name,exact:true}).waitFor();
 return (await saved()).managementLists.at(-1);
}
async function waitNeed(listId,itemId,enabled){await page.waitForFunction(({listId,itemId,enabled})=>JSON.parse(localStorage.getItem('tempalist:data')).managementLists.find(list=>list.id===listId).items.find(item=>item.id===itemId).needsAction===enabled,{listId,itemId,enabled});}
try{
 await page.goto(origin);await page.getByRole('link',{name:'テンプレート',exact:true}).click();await button('新しく作る').click();
 await page.getByLabel('テンプレート名',{exact:true}).fill('共用日用品');await page.getByLabel('項目（1行に1項目）').fill('洗剤\n猫の餌');
 await page.getByLabel('作成するリストの並び順をロックする').check();await button('作成する').click();await closed();
 const template=(await saved()).templates.at(-1);
 const home=await newManagement('自宅の日用品',template.id),lab=await newManagement('研究室',template.id);
 assert.equal(lab.orderLocked,true);assert.equal(await page.locator('[data-management-action=up]').count(),0);
 await route('management/'+home.id);await page.getByRole('checkbox',{name:'洗剤を要対応にする',exact:true}).check();await waitNeed(home.id,home.items[0].id,true);
 await route('management/'+lab.id);await page.getByRole('checkbox',{name:'洗剤を要対応にする',exact:true}).check();await waitNeed(lab.id,lab.items[0].id,true);
 await route('actions');assert.equal(await page.locator('[data-management-check=complete]').count(),2);
 await page.getByRole('checkbox',{name:'自宅の日用品の洗剤を対応済みにする',exact:true}).click();await waitNeed(home.id,home.items[0].id,false);
 await button('元に戻す').waitFor();assert.equal(await page.locator('[data-management-check=complete]').count(),1);
 await button('元に戻す').click();await waitNeed(home.id,home.items[0].id,true);assert.equal((await saved()).managementLists[0].items[0].lastCompletedAt,null);
 await page.getByRole('checkbox',{name:'自宅の日用品の洗剤を対応済みにする',exact:true}).click();await waitNeed(home.id,home.items[0].id,false);
 const last=(await saved()).managementLists[0].items[0].lastCompletedAt;assert.ok(last);await page.reload();await page.getByRole('heading',{name:'対応リスト',exact:true}).waitFor();
 assert.equal(await button('元に戻す').count(),0);assert.equal(await page.locator('[data-management-check=complete]').count(),1);
 await route('management/'+home.id);assert.ok((await page.locator('.management-last').first().textContent()).includes('前回対応：'));assert.ok(!(await page.locator('.management-last').first().textContent()).includes('未記録'));
 await page.getByRole('checkbox',{name:'洗剤を要対応にする',exact:true}).check();await waitNeed(home.id,home.items[0].id,true);
 await page.getByRole('checkbox',{name:'洗剤を要対応にする',exact:true}).uncheck();await waitNeed(home.id,home.items[0].id,false);assert.equal((await saved()).managementLists[0].items[0].lastCompletedAt,last);
 // Same-list duplicate prevention and correction without losing the form.
 await button('項目を追加').click();await page.getByLabel('項目名',{exact:true}).fill(' 洗剤 ');await button('保存する').click();await page.getByRole('alert').filter({hasText:'同じ名前'}).waitFor();
 assert.equal((await saved()).managementLists[0].items.length,2);await page.getByLabel('項目名',{exact:true}).fill('電池');await button('保存する').click();await closed();
 await page.getByRole('switch',{name:'並び順ロック'}).click();await page.locator('[data-management-action=up]').first().waitFor();
 await page.locator('[data-item="'+home.items[1].id+'"] [data-management-action=up]').click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tempalist:data')).managementLists[0].items[0].id===id,home.items[1].id);
 // Edit names on both sides without losing the relation.
 await route('management/'+lab.id);await button('編集').click();await page.getByLabel('管理リスト名',{exact:true}).fill('実験室');await button('保存する').click();await closed();
 await page.locator('[data-item="'+lab.items[0].id+'"] summary').click();await page.locator('[data-item="'+lab.items[0].id+'"] [data-management-action=edit-item]').click();
 await page.getByLabel('項目名',{exact:true}).fill('食器用洗剤');await button('保存する').click();await closed();await route('actions');await page.getByRole('checkbox',{name:'実験室の食器用洗剤を対応済みにする',exact:true}).waitFor();
 // Backup includes management; import uses new identities while preserving dates and pending flags.
 await route('settings');const [download]=await Promise.all([page.waitForEvent('download'),button('JSONを書き出す').click()]);const backup=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(backup.schemaVersion,2);assert.equal(backup.managementLists.length,2);assert.equal(backup.managementLists[0].items.find(item=>item.id===home.items[0].id).lastCompletedAt,last);
 const copy=await context.newPage();await copy.goto(origin+'/#/settings');
 await copy.locator('#import-file').setInputFiles({name:'management-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await copy.getByText(/管理リスト 2件を追加/).waitFor();await copy.getByRole('button',{name:'追加する',exact:true}).click();await copy.locator('#dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).managementLists.length===4);
 const restored=(await saved()).managementLists[2];assert.notEqual(restored.id,home.id);assert.equal(restored.items.find(item=>item.label==='洗剤').lastCompletedAt,last);
 // A concurrent edit must not overwrite a newer item from a stale dialog.
 await route('management/'+lab.id);await page.locator('[data-item="'+lab.items[0].id+'"] summary').click();await page.locator('[data-item="'+lab.items[0].id+'"] [data-management-action=edit-item]').click();await page.getByLabel('項目名',{exact:true}).fill('古い変更');
 await copy.goto(origin+'/#/actions');await copy.getByRole('checkbox',{name:'実験室の食器用洗剤を対応済みにする',exact:true}).first().click();await waitNeed(lab.id,lab.items[0].id,false);
 await button('保存する').click();await page.getByRole('alert').filter({hasText:'別の画面'}).waitFor();assert.equal((await saved()).managementLists[1].items[0].label,'食器用洗剤');
 await button('キャンセル').click();await button('入力を破棄して閉じる').click();await closed();
 // Deleting a pending source removes its action without touching the other lists.
 await page.getByRole('checkbox',{name:'食器用洗剤を要対応にする',exact:true}).check();await waitNeed(lab.id,lab.items[0].id,true);
 await button('管理リストを削除').click();await button('削除する').click();await closed();await page.waitForFunction(id=>!JSON.parse(localStorage.getItem('tempalist:data')).managementLists.some(list=>list.id===id),lab.id);
 await route('actions');assert.equal(await page.locator('[data-list="'+lab.id+'"]').count(),0);
 for(const width of [320,375,412,768]){await page.setViewportSize({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('[data-nav]').count(),4);}
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'artifacts/management-actions-mobile.png',fullPage:true});
 // Cached management screens continue working offline.
 await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'対応リスト',exact:true}).waitFor();
 await page.locator('[data-management-check=complete]').first().click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).managementLists.every(list=>list.items.every(item=>!item.needsAction)));
 await context.setOffline(false);
 // Ordinary checklists and Atoqueue import still operate after the v2 migration.
 await route('template/'+template.id);await button('この型でリストを作る').click();await page.getByLabel('タイトル',{exact:true}).fill('通常リスト');await button('作成する').click();await closed();
 await page.locator('[data-check]').first().check();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0]?.items[0].checked===true);
 const managementBefore=JSON.stringify((await saved()).managementLists);
 const payload={schemaVersion:1,kind:'checklist-create',source:'atoqueue',requestId:crypto.randomUUID(),title:'あとキュー予定',items:[{sourceTaskId:'task-1',label:'買い物'}]};
 await page.goto(origin+'/#create='+Buffer.from(JSON.stringify(payload)).toString('base64url'));await page.getByRole('heading',{name:'あとキューからリストを作る',exact:true}).waitFor();await button('作成する').click();await closed();
 assert.equal((await saved()).checklists.at(-1).title,'あとキュー予定');assert.equal(JSON.stringify((await saved()).managementLists),managementBefore);
 // Imported names remain text even in destructive confirmation dialogs.
 const hostile=await newManagement('名前 <img src=x>', '');
 await button('項目を追加').click();await page.getByLabel('項目名',{exact:true}).fill('項目 <img src=x>');await button('保存する').click();await closed();
 await page.locator('.item-menu summary').click();await page.locator('[data-management-action=delete-item]').click();assert.equal(await page.locator('#dialog img').count(),0);assert.ok((await page.locator('#dialog').textContent()).includes('項目 <img src=x>'));await button('削除する').click();await closed();
 await button('管理リストを削除').click();assert.equal(await page.locator('#dialog img').count(),0);assert.ok((await page.locator('#dialog').textContent()).includes(hostile.name));
 await copy.evaluate(()=>{void navigator.locks.request('tempalist:data',()=>new Promise(resolve=>{window.releaseManagementLock=resolve;}));});await copy.waitForFunction(()=>typeof window.releaseManagementLock==='function');
 await button('削除する').click();assert.equal(await button('キャンセル').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(el=>el.open),true);
 await copy.evaluate(()=>window.releaseManagementLock());await closed();assert.equal((await saved()).managementLists.some(list=>list.id===hostile.id),false);
 // Duplicate templates remain usable for normal checklists but cannot create management lists.
 await route('templates');await button('新しく作る').click();await page.getByLabel('テンプレート名',{exact:true}).fill('重複テンプレート');await page.getByLabel('項目（1行に1項目）').fill('牛乳\n 牛乳 ');await button('作成する').click();await closed();
 const duplicateTemplate=(await saved()).templates.at(-1),count=(await saved()).managementLists.length;
 await route('management');await button('管理リストを作る').click();await page.getByLabel('テンプレート',{exact:true}).selectOption(duplicateTemplate.id);await page.locator('[data-template-warning]').filter({hasText:'同じ名前'}).waitFor();
 await button('作成する').click();await page.getByRole('alert').filter({hasText:'同じ名前'}).waitFor();assert.equal((await saved()).managementLists.length,count);
 await button('キャンセル').click();await button('入力を破棄して閉じる').click();await closed();
 assert.deepEqual(errors,[]);console.log('Management browser: templates, shared actions, completion/undo, duplicates, persistence, reordering, names, v2 backup/import, stale edit, deletion, 4-tab layout: OK');
}catch(error){console.error('Route:',page.url());console.error(await page.locator('#toast').textContent());console.error(await page.locator('#dialog').innerHTML());await page.screenshot({path:'artifacts/management-failure.png'});throw error;}finally{await browser.close();}
