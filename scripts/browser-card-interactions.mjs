import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:/工場の始業前点検/}).click();
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 const note='保護具の装着状態を確認してください。\n'+Array.from({length:9},(_,i)=>`確認 ${i+1}：異常があれば作業を止め、担当者に報告してください。`).join('\n')+'\n<img src=x onerror=alert(1)>';
 for(const [index,text] of [[0,note],[1,'担当者へ声をかける。'],[2,'安全のため、作業場所と使用する道具を確認してください。'.repeat(3)]]){
  const row=page.locator(`[data-index="${index}"]`);await row.locator('summary').click();
  await row.getByRole('button',{name:'編集',exact:true}).click();await page.getByLabel('メモ',{exact:true}).fill(text);
  await page.getByRole('button',{name:'保存する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 }
 await page.evaluate(()=>document.fonts.ready);
 const first=page.locator('[data-index="0"]'),second=page.locator('[data-index="1"]');
 await first.locator('.note-more').waitFor();assert.equal(await second.locator('.note-more').count(),0);
 assert.equal(await second.locator('.item-note').textContent(),'担当者へ声をかける。');
 await first.locator('summary').click();await page.getByRole('heading',{level:1}).click();
 assert.equal(await page.locator('.item-menu[open]').count(),0);
 await first.locator('summary').click();await second.locator('summary').click();assert.equal(await page.locator('.item-menu[open]').count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.item-menu[open]').count(),0);
 await first.locator('.item-copy').tap();const panel=page.locator('#note-panel');await panel.waitFor({state:'visible'});
 assert.equal(await panel.locator('.note-panel-body').textContent(),note);assert.equal(await panel.locator('img').count(),0);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/preview-long-note-mobile.png'});
 await panel.getByRole('button',{name:'メモを閉じる'}).click();await panel.waitFor({state:'hidden'});
 await first.locator('.item-copy').focus();await page.keyboard.press('Enter');await panel.waitFor({state:'visible'});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 await first.locator('.item-copy').tap();await panel.waitFor({state:'visible'});
 await page.getByRole('heading',{level:1}).click();await panel.waitFor({state:'hidden'});
 await second.locator('.item-copy').tap();await panel.waitFor({state:'hidden'});
 // Holding and releasing at the same position must not become a note tap.
 await first.locator('.item-copy').scrollIntoViewIfNeeded();const box=await first.locator('.item-copy').boundingBox();
 const x=box.x+box.width/2,y=box.y+box.height/2,cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await page.locator('.drag-preview').waitFor();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(200);await panel.waitFor({state:'hidden'});
 await first.locator('.item-copy').tap();await panel.waitFor({state:'visible'});
 await page.getByRole('link',{name:'設定',exact:true}).click();assert.equal(await panel.count(),0);
 await page.getByRole('link',{name:'リスト',exact:true}).click();
 await page.locator('.list-card').first().click();
 await page.locator('[data-index="2"] .note-more').waitFor();
 await page.setViewportSize({width:1280,height:900});
 await page.waitForFunction(()=>!document.querySelector('[data-index="2"] .note-more'));
 assert.deepEqual(errors,[]);
 console.log('Card interactions: outside dismissal, one menu, short/long notes, plain text, keyboard, close, long-press exclusion and route cleanup: OK');
}finally{await browser.close();}
