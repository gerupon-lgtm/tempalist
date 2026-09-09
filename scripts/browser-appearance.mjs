import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0]);
try{
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button',{name:/工場の始業前点検/}).click();
  await page.getByLabel('タイトル',{exact:true}).fill('朝の作業を始める前に');
  await page.getByRole('button',{name:'作成する',exact:true}).click();
  await page.locator('#dialog').waitFor({state:'hidden'});
  await page.getByRole('checkbox').first().tap();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].checked);
  await page.evaluate(()=>document.fonts.ready);
  const style=await page.evaluate(()=>({
    fontLoaded:document.fonts.check('400 16px "Noto Sans JP"','始業前点検'),
    background:getComputedStyle(document.documentElement).backgroundColor,
    button:getComputedStyle(document.querySelector('button.primary')).backgroundColor,
    checkbox:getComputedStyle(document.querySelector('input:checked')).backgroundColor,
    buttonText:getComputedStyle(document.querySelector('button.primary')).color,
    buttonWeight:getComputedStyle(document.querySelector('button.primary')).fontWeight,
    bodyWeight:getComputedStyle(document.documentElement).fontWeight,
    itemSize:getComputedStyle(document.querySelector('.item-label')).fontSize,
  }));
  assert.equal(style.checkbox,style.button);
  assert.equal(style.buttonText,'rgb(255, 255, 255)');
  assert.equal(style.buttonWeight,'700');
  assert.equal(style.bodyWeight,'500');
  assert.equal(style.itemSize,'16px');
  assert.equal(style.background,'rgb(255, 254, 254)');
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),style.background);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#toast')).transitionDuration),'0s');
  await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});

  const cdp=await context.newCDPSession(page);
  const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y}]});
  let before=await saved();
  let handle=page.locator('[data-index="0"] .item-copy');
  await handle.scrollIntoViewIfNeeded();
  let box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await touch('touchStart',x,y);await touch('touchEnd');
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.drag-preview').count(),0);
  assert.deepEqual((await saved()).items,before.items);

  await touch('touchStart',x,y);await page.locator('.drag-preview').waitFor();
  const ghostStart=await page.locator('.drag-preview').boundingBox();
  await touch('touchMove',x-14,y+155);
  const ghostMoved=await page.locator('.drag-preview').boundingBox();
  assert.ok(Math.abs(ghostMoved.y-ghostStart.y-155)<2);
  assert.equal(await page.locator('[data-drop]').count(),1);
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/preview-reorder-mobile.png'});
  await touch('touchEnd');
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].id!==id,before.items[0].id);
  const after=await saved();
  assert.equal(after.items.find(item=>item.id===before.items[0].id).checked,true);
  await page.reload();assert.deepEqual((await saved()).items,after.items);

  // A cancelled touch must not commit the previewed order.
  handle=page.locator('[data-index="0"] .item-copy');await handle.scrollIntoViewIfNeeded();
  box=await handle.boundingBox();x=box.x+box.width/2;y=box.y+box.height/2;
  await touch('touchStart',x,y);await page.locator('.drag-preview').waitFor();
  await touch('touchMove',x,y+120);await touch('touchCancel');
  assert.equal(await page.locator('.drag-preview').count(),0);
  assert.deepEqual((await saved()).items,after.items);

  // Right-side arrows remain direct taps; their whole region is excluded from dragging.
  let controls=page.locator('[data-index="0"] .row-controls');
  await controls.scrollIntoViewIfNeeded();
  box=await controls.boundingBox();x=box.x+box.width/2;y=box.y+box.height/2;
  await touch('touchStart',x,y);await page.waitForTimeout(550);
  assert.equal(await page.locator('.drag-preview').count(),0);await touch('touchCancel');
  const down=page.locator('[data-index="0"]').getByRole('button',{name:'下へ',exact:true});
  await down.tap();
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[1].id===id,after.items[0].id);
  await page.locator('[data-index="1"]').getByRole('button',{name:'上へ',exact:true}).tap();
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].id===id,after.items[0].id);
  assert.deepEqual((await saved()).items,after.items);

  const checkbox=page.locator('[data-index="0"] .row-check');await checkbox.scrollIntoViewIfNeeded();
  box=await checkbox.boundingBox();
  await touch('touchStart',box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(550);
  assert.equal(await page.locator('.drag-preview').count(),0);await touch('touchCancel');

  // Swiping the text remains native scrolling, with no lifted card.
  await page.evaluate(()=>scrollTo(0,0));
  await touch('touchStart',140,680);
  for(let i=1;i<=8;i++){await touch('touchMove',140,680-i*35);await page.waitForTimeout(20);}
  await touch('touchEnd');
  await page.waitForFunction(()=>scrollY>100);
  assert.equal(await page.locator('.drag-preview').count(),0);
  assert.deepEqual((await saved()).items,after.items);
  for(const width of [320,375,1280]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.deepEqual(errors,[]);

  // Block Google Fonts in a new context so the fallback check cannot use a warm cache.
  const fallback=await browser.newContext({viewport:{width:375,height:812}});
  await fallback.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  const fallbackPage=await fallback.newPage();await fallbackPage.goto('http://127.0.0.1:4173');
  await fallbackPage.getByRole('button',{name:/工場の始業前点検/}).click();
  await fallbackPage.getByRole('button',{name:'作成する',exact:true}).click();
  await fallbackPage.locator('#dialog').waitFor({state:'hidden'});
  await fallbackPage.getByRole('checkbox').first().check();
  await fallbackPage.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].checked);
  assert.equal(await fallbackPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await fallbackPage.screenshot({path:'artifacts/preview-font-fallback-mobile.png',fullPage:true});
  await fallback.close();
  console.log(`Appearance and touch: shared accent, light surface in dark OS, reduced motion, long press/ghost/drop/persistence/cancel, native scroll, 320/375/1280 widths, blocked-font fallback: OK. Google font loaded in normal context: ${style.fontLoaded}`);
}finally{await browser.close();}
