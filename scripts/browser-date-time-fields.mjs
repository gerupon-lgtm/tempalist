import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const ios=process.argv.includes('--ios');
const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,timezoneId:'Asia/Tokyo',...(ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
if(ios)await context.addInitScript(()=>{window.showPickerCalls=0;HTMLInputElement.prototype.showPicker=function(){window.showPickerCalls++;};});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const button=name=>page.getByRole('button',{name,exact:true});
try{
 await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:4173');
 await button('リストを作る').first().click();
 await page.getByLabel('タイトル',{exact:true}).fill('PCセキュリティソフト設定');
 const date=page.getByLabel('期限の日付',{exact:true}),time=page.getByLabel('時刻',{exact:true});
 await date.tap();await date.pressSequentially('2026');assert.equal(await date.inputValue(),'2026/');
 await date.pressSequentially('09');assert.equal(await date.inputValue(),'2026/09/');
 await date.pressSequentially('10');assert.equal(await date.inputValue(),'2026/09/10');
 await date.tap();assert.deepEqual(await date.evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,10]);
 await date.pressSequentially('20261011');assert.equal(await date.inputValue(),'2026/10/11');
 // Delete backwards across both separators without getting stuck.
 await date.press('End');for(let i=0;i<12;i++)await date.press('Backspace');assert.equal(await date.inputValue(),'');
 await date.pressSequentially('20260910');
 await time.tap();await time.pressSequentially('14');assert.equal(await time.inputValue(),'14:');
 await time.pressSequentially('30');assert.equal(await time.inputValue(),'14:30');
 await time.tap();assert.deepEqual(await time.evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,5]);
 await time.pressSequentially('0930');assert.equal(await time.inputValue(),'09:30');
 await time.press('End');for(let i=0;i<6;i++)await time.press('Backspace');assert.equal(await time.inputValue(),'');
 await time.pressSequentially('1430');
 for(const width of [320,375,412]){
  await page.setViewportSize({width,height:812});
  for(const kind of ['date','time']){
   const layout=await page.locator(`[name=${kind}]`).evaluate(el=>{const wrap=el.parentElement.getBoundingClientRect(),icon=el.parentElement.querySelector('button').getBoundingClientRect();return {inside:icon.left>=wrap.left&&icon.right<=wrap.right,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(layout.inside,true);assert.equal(layout.overflow,false);
  }
 }
 await page.setViewportSize({width:375,height:812});
 await page.screenshot({path:'artifacts/date-time-fields-mobile.png'});
 for(const [kind,value] of [['date','2026-09-10'],['time','14:30']]){
  if(ios){
   const target=page.locator(`[data-open-picker=${kind}]`);await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();
   const point={x:box.x+box.width/2,y:box.y+box.height/2};
   assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.dataset.picker,point),kind);
   await page.touchscreen.tap(point.x,point.y);
   assert.equal(await page.locator(`[data-picker=${kind}]`).evaluate(el=>el===document.activeElement),true);
   assert.equal(await page.evaluate(()=>window.showPickerCalls),0);
  }else await page.locator(`[data-open-picker=${kind}]`).click();
  assert.equal(await page.locator(`[data-picker=${kind}]`).inputValue(),value);
  assert.equal(await page.locator('.picker-fallback').count(),0);
  await page.keyboard.press('Escape');
 }
 // Native selection reaches the text values that FormData submits.
 await page.locator('[data-picker=time]').evaluate(el=>{el.value='15:45';el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await time.inputValue(),'15:45');
 await button('作成する').click();await page.locator('#dialog').waitFor({state:'hidden'});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0]);
 assert.equal(saved.dueAt,'2026-09-10T06:45:00.000Z');assert.equal(saved.dueHasTime,true);
 await button('編集').click();assert.equal(await date.inputValue(),'2026/09/10');assert.equal(await time.inputValue(),'15:45');
 await date.tap();await date.press('Backspace');await time.tap();await time.press('Backspace');
 await button('保存する').click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].dueAt),null);
 assert.deepEqual(errors,[]);
 console.log(`Browser date/time${ios?' (iOS direct-tap path, simulated UA/no-op showPicker)':''}: tap selection, sequential input, separator deletion, embedded native pickers, mobile layout, UTC save/reopen/clear: OK`);
}finally{await browser.close();}
