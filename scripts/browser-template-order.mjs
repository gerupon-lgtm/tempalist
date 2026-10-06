import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
const names=status=>page.evaluate(status=>JSON.parse(localStorage.getItem('tempalist:data')).templates.filter(t=>t.status===status).map(t=>t.name),status);
const visible=()=>page.locator('.template-card-link h2').allTextContents();
const row=index=>page.locator(`.template-reorder-card[data-index="${index}"]`);
try{
 await page.goto(origin);
 await page.evaluate(async()=>{
  const d=await import('/src/domain.js');let state=d.emptyState();
  for(const [name,status] of [['食品','active'],['試作1','draft'],['日用品','active'],['旧版1','archived'],['猫用品','active'],['試作2','draft'],['旧版2','archived']])state=d.createTemplate(state,{name,status,items:[{label:name+'の項目',comment:'内容を保持'}]});
  state.supplySamplesAdded=true;localStorage.setItem('tempalist:data',JSON.stringify(state));
 });
 await page.goto(origin+'/#/templates');await page.reload();
 const original=(await saved()).templates;
 assert.deepEqual(await visible(),['食品','日用品','猫用品']);
 assert.equal(await row(0).getByRole('button',{name:'上へ',exact:true}).isDisabled(),true);
 assert.equal(await row(2).getByRole('button',{name:'下へ',exact:true}).isDisabled(),true);
 await row(0).getByRole('button',{name:'下へ',exact:true}).tap();
 await page.waitForFunction(()=>document.querySelector('.template-card-link h2')?.textContent==='日用品');
 assert.deepEqual(await names('active'),['日用品','食品','猫用品']);
 await page.reload();assert.deepEqual(await visible(),['日用品','食品','猫用品']);
 for(const [status,expected] of [['draft',['試作2','試作1']],['archived',['旧版2','旧版1']]]){
  await page.locator(`[data-action=template-tab][data-value=${status}]`).click();
  await row(1).getByRole('button',{name:'上へ',exact:true}).tap();
  await page.waitForFunction(name=>document.querySelector('.template-card-link h2')?.textContent===name,expected[0]);
  assert.deepEqual(await names(status),expected);
 }
 assert.deepEqual(await names('active'),['日用品','食品','猫用品']);
 await page.locator('[data-action=template-tab][data-value=active]').click();
 const cdp=await context.newCDPSession(page);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y}]});
 async function start(index=0){await row(index).scrollIntoViewIfNeeded();const box=await row(index).locator('.card-copy').boundingBox();const p={x:box.x+20,y:box.y+box.height/2};await touch('touchStart',p.x,p.y);return p;}
 console.log('Arrows and statuses passed');
 // Long press lifts the same translucent preview used for checklist items.
 let p=await start();await page.locator('.drag-preview').waitFor();
 const ghost=await page.locator('.drag-preview').boundingBox(),source=await row(0).boundingBox();assert.ok(Math.abs(ghost.x-source.x)<2&&Math.abs(ghost.y-source.y)<2);assert.equal(await page.locator('.drag-preview').evaluate(n=>getComputedStyle(n).position),'fixed');
 const target=await row(1).boundingBox();await touch('touchMove',p.x,target.y+target.height-10);
 assert.ok((await page.locator('.drag-preview').boundingBox()).y>ghost.y+30);
 assert.equal(await page.locator('[data-drop]').count(),1);
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/template-order-drag.png'});
 await touch('touchEnd');await page.waitForFunction(()=>document.querySelector('.template-card-link h2')?.textContent==='食品');
 assert.ok(page.url().endsWith('/templates'));assert.deepEqual(await visible(),['食品','日用品','猫用品']);
 // Stationary long press and cancellation never open the detail or change order.
 p=await start();await page.locator('.drag-preview').waitFor();await touch('touchEnd');await page.waitForTimeout(650);assert.ok(page.url().endsWith('/templates'));
 p=await start();await page.locator('.drag-preview').waitFor();await touch('touchMove',p.x,p.y+130);await touch('touchCancel');assert.equal(await page.locator('.drag-preview').count(),0);assert.deepEqual(await visible(),['食品','日用品','猫用品']);
 // Right control area is excluded from the long press.
 const controls=await row(0).locator('.row-controls').boundingBox();await touch('touchStart',controls.x+controls.width/2,controls.y+controls.height/2);await page.waitForTimeout(500);assert.equal(await page.locator('.drag-preview').count(),0);await touch('touchCancel');
 // A quick tap still opens the template; keyboard access is preserved too.
 await row(0).locator('a').tap();await page.waitForURL(/#\/template\//);
 await page.goto(origin+'/#/templates');await row(0).locator('a').focus();await page.keyboard.press('Enter');await page.waitForURL(/#\/template\//);
 await page.goto(origin+'/#/templates');
 for(const width of [320,375,412,768,1280]){
  await page.setViewportSize({width,height:900});
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.template-reorder-card .step-button')].map(n=>n.getBoundingClientRect().height)}));
  assert.equal(layout.overflow,false);assert.ok(layout.buttons.every(height=>height>=44));
 }
 await page.screenshot({path:'artifacts/template-order-desktop.png',fullPage:true});
 // Moving/releasing outside main during the pending press cancels the gesture.
 let outside=await row(0).locator('.card-copy').boundingBox();await page.mouse.move(outside.x+20,outside.y+10);await page.mouse.down();await page.mouse.move(5,5);await page.mouse.up();await page.waitForTimeout(550);assert.equal(await page.locator('.drag-preview').count(),0);assert.equal(await page.locator('.drag-pending').count(),0);
 // Mouse drag uses deferred capture, preserving ordinary link clicks.
 let b=await row(0).locator('.card-copy').boundingBox();await page.mouse.move(b.x+20,b.y+b.height/2);await page.mouse.down();await page.locator('.drag-preview').waitFor();
 b=await row(1).boundingBox();await page.mouse.move(b.x+40,b.y+b.height-10);await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('.template-card-link h2')?.textContent==='日用品');assert.ok(page.url().endsWith('/templates'));
 await row(0).locator('a').click();await page.waitForURL(/#\/template\//);
 for(const t of (await saved()).templates)assert.deepEqual(t,original.find(old=>old.id===t.id));
 // Creation choices use the same saved order, and backup retains it.
 await page.goto(origin+'/#/lists');const tiles=await page.locator('[data-action=from-template] > span:nth-child(2)').allTextContents();assert.deepEqual(tiles.map(t=>t.trim()),['日用品','食品','猫用品']);
 await page.locator('.collection-heading [data-action=new-list]').click();assert.deepEqual(await page.locator('#dialog [name=source] option').allTextContents(),['空から作る','日用品','食品','猫用品']);await page.getByRole('button',{name:'キャンセル',exact:true}).click();
 await page.goto(origin+'/#/management');await page.locator('[data-management-action=new]').click();assert.deepEqual(await page.locator('#dialog [name=source] option').allTextContents(),['空から作る','日用品','食品','猫用品']);await page.getByRole('button',{name:'キャンセル',exact:true}).click();
 const backupNames=await page.evaluate(async()=>{const t=await import('/src/transfer.js'),d=await import('/src/domain.js'),s=JSON.parse(localStorage.getItem('tempalist:data'));return t.importBackup(d.emptyState(),t.parseTransfer(t.exportBackup(s))).templates.map(t=>t.name);});assert.deepEqual(backupNames,(await saved()).templates.map(t=>t.name));
 // Cache supports sorting without network access.
 await page.goto(origin+'/#/templates');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await context.setOffline(true);await page.reload();
 await row(0).getByRole('button',{name:'下へ',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.template-card-link h2')?.textContent==='食品');await context.setOffline(false);

 // A stale rendered order cannot overwrite a newer stored order.
 await page.evaluate(async()=>{const d=await import('/src/domain.js'),s=JSON.parse(localStorage.getItem('tempalist:data')),ids=s.templates.filter(t=>t.status==='active').map(t=>t.id);const next=d.reorderTemplates(s,'active',0,1,ids);next.revision++;localStorage.setItem('tempalist:data',JSON.stringify(next));});
 await row(0).getByRole('button',{name:'下へ',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('別の画面でテンプレート一覧'));
 assert.deepEqual(await names('active'),['日用品','食品','猫用品']);await page.reload();
 // A swipe before the press threshold scrolls rather than reordering.
 await page.setViewportSize({width:375,height:640});await page.evaluate(()=>scrollTo(0,0));const beforeScroll=await names('active');
 b=await row(1).locator('.card-copy').boundingBox();const sx=b.x+20,sy=b.y+b.height/2;await touch('touchStart',sx,sy);
 for(let i=1;i<=6;i++){await touch('touchMove',sx,sy-i*25);await page.waitForTimeout(20);}await touch('touchEnd');
 await page.waitForFunction(()=>scrollY>30);assert.equal(await page.locator('.drag-preview').count(),0);assert.deepEqual(await names('active'),beforeScroll);
 // Empty and single-card states expose no usable out-of-bounds moves.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('tempalist:data'));s.templates=s.templates.filter(t=>t.status==='active').slice(0,1);s.templates[0].name='非常に長い名前のテンプレートでもカードと右端のボタンが画面の中に収まることを確認します';s.revision++;localStorage.setItem('tempalist:data',JSON.stringify(s));});await page.reload();
 assert.equal(await page.locator('.reorder-hint').count(),0);assert.equal(await row(0).getByRole('button',{name:'上へ',exact:true}).isDisabled(),true);assert.equal(await row(0).getByRole('button',{name:'下へ',exact:true}).isDisabled(),true);
 await page.setViewportSize({width:320,height:640});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-action=template-tab][data-value=draft]').click();assert.equal(await page.locator('.template-reorder-card').count(),0);assert.equal(await page.locator('.empty-state').count(),1);
 assert.deepEqual(errors,[]);console.log('Template order: all statuses, arrows, touch/mouse drag, cancellation, quick tap/keyboard, persistence, creation choices, backup, offline, five widths: OK');
}finally{await browser.close();}
