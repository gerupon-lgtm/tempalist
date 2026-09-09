import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
try{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('link',{name:'テンプレート',exact:true}).click();
 await page.getByRole('button',{name:'新しく作る',exact:true}).click();
 await page.getByLabel('テンプレート名',{exact:true}).fill('順序を守る実験準備');
 await page.getByLabel('作成するリストの並び順をロックする',{exact:true}).check();
 await page.getByLabel('項目（1行に1項目）',{exact:true}).fill('準備\n確認\n開始');
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 const templateId=(await saved()).templates.at(-1).id;
 assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
 await page.getByRole('button',{name:'この型でリストを作る',exact:true}).click();
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 await page.getByRole('switch',{name:'並び順ロック',exact:true}).waitFor();
 const id=(await saved()).checklists[0].id;
 assert.equal((await saved()).checklists[0].orderLocked,true);
 assert.equal(await page.getByRole('button',{name:'下へ',exact:true}).count(),0);
 const box=await page.locator('[data-index="0"] .item-copy').boundingBox();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+20,y:box.y+10}]});
 await page.waitForTimeout(550);assert.equal(await page.locator('.drag-preview').count(),0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.getByRole('checkbox').first().tap();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].checked);
 await page.reload();assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
 await page.getByRole('switch').click();await page.getByRole('button',{name:'下へ',exact:true}).first().waitFor();
 await page.getByRole('button',{name:'下へ',exact:true}).first().click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].label==='確認');
 assert.equal((await saved()).templates.find(t=>t.id===templateId).defaultOrderLocked,true);
 await page.getByRole('switch').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].orderLocked);
 // A stale screen in another tab cannot bypass a newly enabled lock.
 const blocked=await page.evaluate(async id=>{
  const d=await import('/src/domain.js');try{d.reorderItems(JSON.parse(localStorage.getItem('tempalist:data')),'checklist',id,0,1);return false;}catch{return true;}
 },id);assert.equal(blocked,true);
 await page.getByRole('button',{name:'完了を確定する',exact:true}).click();
 await page.getByRole('button',{name:'このまま確定する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 await page.locator('.list-card').first().click();assert.equal(await page.getByRole('switch').isDisabled(),true);
 await page.getByRole('button',{name:'再開する',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[role=switch]')?.disabled===false);
 assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
 await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.mouse.move(0,0);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
 const spacing=await page.evaluate(()=>({margin:getComputedStyle(document.querySelector('.detail-info')).marginBottom,padding:getComputedStyle(document.querySelector('.order-lock-setting')).paddingTop}));
 assert.deepEqual(spacing,{margin:'8px',padding:'6px'});
 await page.screenshot({path:'artifacts/preview-order-lock-mobile.png',fullPage:true});
 await page.goto(`http://127.0.0.1:4173/#/template/${templateId}`);
 await page.getByRole('switch').click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tempalist:data')).templates.find(t=>t.id===id).defaultOrderLocked===false,templateId);
 assert.equal((await saved()).checklists[0].orderLocked,true);
 assert.deepEqual(errors,[]);
 console.log('Order lock: template default, copied state, blocked drag/arrows, checking, persistence, independent changes, unlock/reorder, settlement/reopen: OK');
}finally{await browser.close();}
