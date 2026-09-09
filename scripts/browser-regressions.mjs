import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},timezoneId:'Asia/Tokyo'});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text());});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
const button=name=>page.getByRole('button',{name,exact:true});
async function dialogDone(){await page.locator('#dialog').waitFor({state:'hidden'});}
try{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('link',{name:'テンプレート',exact:true}).click();
 assert.equal((await saved()).templates.length,5);
 assert.equal((await saved()).templates.reduce((n,t)=>n+t.items.length,0),37);
 await button('新しく作る').click();
 await page.getByLabel('テンプレート名',{exact:true}).fill('50項目の確認');
 await page.getByLabel('項目（1行に1項目）',{exact:true}).fill(Array.from({length:50},(_,i)=>`確認 ${i+1}`).join('\n'));
 await button('作成する').click();await dialogDone();
 await page.getByRole('heading',{name:'50項目の確認',exact:true}).waitFor();
 await page.locator('[data-index="0"] summary').click();await page.locator('[data-index="0"]').getByRole('button',{name:'編集',exact:true}).click();
 await page.getByLabel('メモ',{exact:true}).fill('安全に使うための補足');await button('保存する').click();await dialogDone();
 await page.locator('[data-index="0"] summary').click();await page.locator('[data-index="0"]').getByRole('button',{name:'下へ',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-index="0"] .item-label')?.textContent==='確認 2');
 await page.reload();assert.equal(await page.locator('[data-index="1"] .item-note').textContent(),'安全に使うための補足');
 // Actual pointer drag, autoscroll near the viewport bottom, and cancellation.
 const handle=page.locator('[data-index="0"] .drag-handle');await handle.scrollIntoViewIfNeeded();
 let box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 const startScroll=await page.evaluate(()=>scrollY);await page.mouse.move(335,805,{steps:8});
 await page.waitForFunction(start=>scrollY>start+100,startScroll);
 await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.dragging'));
 // Drag visuals end before the Web Locks save resolves; assert the durable result.
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).templates.at(-1).items[0].label!=='確認 2');
 const dragState=await saved();assert.notEqual(dragState.templates.at(-1).items[0].label,'確認 2');
 const stopped=await page.evaluate(()=>scrollY);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scrollY),stopped);
 await page.evaluate(()=>scrollTo(0,0));
 await button('この型でリストを作る').click();
 await page.getByLabel('期限の日付',{exact:true}).fill('20260910');await page.getByLabel('時刻',{exact:true}).focus();
 assert.equal(await page.getByLabel('期限の日付',{exact:true}).inputValue(),'2026/09/10');
 await button('作成する').click();await dialogDone();
 await page.getByRole('checkbox').first().waitFor();
 assert.equal((await saved()).checklists[0].dueAt,'2026-09-10T00:00:00.000Z');
 assert.equal((await saved()).checklists[0].notificationEnabled,false);
 assert.equal(await page.getByRole('checkbox').count(),50);
 const currentId=(await saved()).checklists[0].id;
 await button('完了を確定する').click();await page.getByText('50項目が未チェックです。',{exact:false}).waitFor();
 await button('このまま確定する').click();await dialogDone();
 await page.getByRole('link',{name:/50項目の確認/}).click();
 assert.equal(await page.getByRole('checkbox').first().isDisabled(),true);
 // A quota failure must keep the entry form, and keep must never silently delete.
 await page.evaluate(()=>{
  const data=JSON.parse(localStorage.getItem('tempalist:data'));data.settings.completedRetention='keep';localStorage.setItem('tempalist:data',JSON.stringify(data));
  const original=Storage.prototype.setItem;window.testQuota=true;
  Storage.prototype.setItem=function(key,value){if(key==='tempalist:data'&&window.testQuota){const old=this.getItem(key)||'';if(value.length>=old.length)throw new DOMException('full','QuotaExceededError');window.testQuota=false;}return original.call(this,key,value);};
 });
 await page.getByRole('link',{name:'リスト',exact:true}).click();await button('リストを作る').first().click();
 await page.getByLabel('タイトル',{exact:true}).fill('入力を保持する');
 await button('作成する').click();await page.locator('#capacity-dialog').waitFor();
 assert.equal(await page.locator('#capacity-dialog input:checked').count(),0);
 await page.locator('#capacity-dialog').getByRole('button',{name:'キャンセル',exact:true}).click();
 assert.equal(await page.getByLabel('タイトル',{exact:true}).inputValue(),'入力を保持する');
 assert.equal((await saved()).checklists.length,1);
 await button('作成する').click();await page.locator('#capacity-dialog input').check();
 await page.locator('#capacity-dialog').getByRole('button',{name:'選択した1件を削除',exact:true}).click();await page.locator('#capacity-dialog').waitFor({state:'detached'});
 await button('作成する').click();await dialogDone();
 await page.getByRole('heading',{name:'入力を保持する',exact:true}).waitFor();
 assert.equal((await saved()).checklists.length,1);assert.notEqual((await saved()).checklists[0].id,currentId);
 // Cross-tab changes to the entity cannot be overwritten by an old edit form.
 await button('編集').click();await page.getByLabel('タイトル',{exact:true}).fill('古い編集');
 const other=await context.newPage();await other.goto(page.url());
 await other.getByRole('button',{name:'編集',exact:true}).click();await other.getByLabel('タイトル',{exact:true}).fill('別画面の変更');
 await other.getByRole('button',{name:'保存する',exact:true}).click();await other.locator('#dialog').waitFor({state:'hidden'});
 await button('保存する').click();await page.locator('#dialog .form-error').filter({hasText:'別の画面で更新'}).waitFor();
 assert.equal((await saved()).checklists[0].title,'別画面の変更');assert.equal(await page.getByLabel('タイトル',{exact:true}).inputValue(),'古い編集');
 await button('キャンセル').click();await button('編集を続ける').click();assert.equal(await page.getByLabel('タイトル',{exact:true}).inputValue(),'古い編集');
 await button('キャンセル').click();await button('入力を破棄して閉じる').click();await other.close();
 // A hostile-looking shared name remains text; importing a share always creates draft.
 const share=await page.evaluate(async()=>{const {shareTemplate}=await import('/src/transfer.js');return shareTemplate({name:'<img src=x onerror=alert(1)>',items:[{label:'試料を確認',note:'メモ'}]},location.origin);});
 await page.goto(share.url);await button('下書きに追加').click();await dialogDone();
 await page.getByRole('heading',{name:'<img src=x onerror=alert(1)>',exact:true}).waitFor();
 assert.equal((await saved()).templates.at(-1).status,'draft');assert.equal(await page.locator('main img').count(),0);
 // Downloaded backup is portable and cannot contain notification credentials.
 await page.evaluate(()=>localStorage.setItem('tempalist:notification:device','{"deviceSecret":"must-not-export"}'));
 await page.getByRole('link',{name:'設定',exact:true}).click();
 const downloaded=page.waitForEvent('download');await button('JSONを書き出す').click();
 const file=await downloaded,stream=await file.createReadStream();let raw='';for await(const chunk of stream)raw+=chunk.toString();
 assert.equal(raw.includes('must-not-export'),false);
 const before=await saved();
 for(let i=0;i<2;i++){
  await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await button('追加する').click();await dialogDone();await page.getByRole('link',{name:'設定',exact:true}).click();
 }
 const after=await saved();assert.equal(after.templates.length,before.templates.length*3);assert.equal(after.checklists.length,before.checklists.length*3);assert.equal(after.settings.completedRetention,'keep');
 assert.equal(new Set(after.templates.map(t=>t.id)).size,after.templates.length);
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'artifacts/settings-dark-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Browser regressions: 50 items, edits/reorder/autoscroll, deadlines, lock, quota/cancel/retry, stale edits, shared XSS/draft, backup/repeated import, dark/reduced motion: OK');
}finally{await browser.close();}
