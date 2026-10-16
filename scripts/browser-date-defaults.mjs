import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const cases=[
 {zone:'Asia/Tokyo',before:'2026-10-15T14:59:00Z',after:'2026-10-15T15:01:00Z',pickerAfter:'2026-10-16T15:01:00Z',due:'2026-10-17T00:00:00.000Z',futureDue:'2026-10-23T00:00:00.000Z'},
 {zone:'America/Los_Angeles',before:'2026-10-16T06:59:00Z',after:'2026-10-16T07:01:00Z',pickerAfter:'2026-10-17T07:01:00Z',due:'2026-10-17T16:00:00.000Z',futureDue:'2026-10-23T16:00:00.000Z'},
];
const currentDate='2026-10-17',currentText='2026/10/17';

async function exercise(scenario){
 const context=await browser.newContext({viewport:{width:375,height:812},timezoneId:scenario.zone});
 const page=await context.newPage(),errors=[],apiRequests=[];
 page.setDefaultTimeout(7000);
 page.on('pageerror',error=>errors.push(error.message));
 // No permission is granted, and an unexpected API request cannot reach production.
 await context.route('https://api.atoqueue.sikumilab.com/**',route=>{
  apiRequests.push(route.request().url());
  return route.fulfill({status:503,json:{code:'TEST_TRANSPORT_DISABLED'}});
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 const dialog=page.locator('#dialog');
 const date=()=>dialog.locator('[name=date]');
 const picker=()=>dialog.locator('[data-picker=date]');
 const closed=()=>dialog.waitFor({state:'hidden'});
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
 async function cancel(){
  await button('キャンセル').click();
  const discard=button('入力を破棄して閉じる');
  if(await discard.isVisible())await discard.click();
  await closed();
 }
 async function openPicker(){
  await dialog.locator('[data-open-picker=date]').click();
  await page.keyboard.press('Escape');
 }
 async function expectEmpty(){
  assert.equal(await date().inputValue(),'');
  assert.equal(await date().getAttribute('placeholder'),currentText);
 }
 async function expectSeed(){
  await openPicker();
  assert.equal(await picker().inputValue(),currentDate);
  assert.equal(await date().inputValue(),currentText);
 }
 try{
  await page.clock.setFixedTime(new Date(scenario.before));
  await page.goto(origin);
  await button('リストを作る').first().click();
  await page.getByLabel('タイトル',{exact:true}).fill('検証専用・日付の初期値');
  assert.equal(await date().inputValue(),'');
  assert.equal(await date().getAttribute('placeholder'),'2026/10/15');

  // Keep this dialog mounted across midnight: focus refreshes only the hint.
  await page.clock.setFixedTime(new Date(scenario.after));
  await date().focus();
  assert.equal(await date().getAttribute('placeholder'),'2026/10/16');
  assert.equal(await date().inputValue(),'');
  await page.getByLabel('タイトル',{exact:true}).focus();
  // Advance across another midnight without focusing the text field first.
  await page.clock.setFixedTime(new Date(scenario.pickerAfter));
  await expectSeed();
  assert.equal(await date().getAttribute('placeholder'),currentText);
  assert.equal((await data()).checklists.length,0);
  await cancel();
  assert.equal((await data()).checklists.length,0);

  // Opening and saving an untouched optional date must still create no deadline.
  await button('リストを作る').first().click();
  await page.getByLabel('タイトル',{exact:true}).fill('検証専用・期限なし');
  await expectEmpty();
  await button('作成する').click();await closed();
  assert.equal((await data()).checklists[0].dueAt,null);
  await button('編集').click();await expectEmpty();await expectSeed();
  assert.equal((await data()).checklists[0].dueAt,null);
  for(const value of ['2026/99/99','2026/']){
   await date().fill(value);await openPicker();
   assert.equal(await date().inputValue(),value,'picker activation must preserve invalid or partial text');
  }
  await cancel();
  assert.equal((await data()).checklists[0].dueAt,null);

  await button('通知を設定').click();
  assert.equal(await page.getByLabel('このリストの通知を受け取る').isChecked(),false);
  await expectEmpty();await expectSeed();
  assert.equal((await data()).checklists[0].dueAt,null);
  await cancel();
  assert.equal((await data()).checklists[0].dueAt,null);

  // Explicit save uses Tempalist's existing default of 09:00 in the device zone.
  await button('編集').click();await expectSeed();
  await button('保存する').click();await closed();
  assert.equal((await data()).checklists[0].dueAt,scenario.due);
  await button('編集').click();
  // Synthetic native change checks the native-to-visible field bridge, not OS UI.
  await picker().evaluate(element=>{
   element.value='2026-10-23';element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  assert.equal(await date().inputValue(),'2026/10/23');
  await button('保存する').click();await closed();
  assert.equal((await data()).checklists[0].dueAt,scenario.futureDue);
  await button('編集').click();await openPicker();
  assert.equal(await date().inputValue(),'2026/10/23');
  assert.equal(await picker().inputValue(),'2026-10-23');
  await cancel();

  await page.goto(origin+'/#/management');
  await button('管理リストを作る').click();
  await page.getByLabel('管理リスト名',{exact:true}).fill('検証専用・消費期限');
  await button('作成する').click();await closed();
  await button('項目を追加').click();
  await page.getByLabel('項目名',{exact:true}).fill('検証専用の食品');
  await expectEmpty();await expectSeed();
  assert.equal((await data()).managementLists[0].items.length,0);
  await cancel();
  assert.equal((await data()).managementLists[0].items.length,0);
  await button('項目を追加').click();
  await page.getByLabel('項目名',{exact:true}).fill('検証専用の食品');
  await expectEmpty();await button('保存する').click();await closed();
  assert.equal((await data()).managementLists[0].items[0].expiryDate,null);
  async function editExpiry(){
   await page.locator('.item-menu summary').first().click();
   await page.locator('[data-management-action=edit-item]').first().click();
  }
  await editExpiry();await expectEmpty();await expectSeed();
  assert.equal((await data()).managementLists[0].items[0].expiryDate,null);
  await button('保存する').click();await closed();
  assert.equal((await data()).managementLists[0].items[0].expiryDate,currentDate);
  await editExpiry();await date().fill('20261023');
  await button('保存する').click();await closed();
  await editExpiry();await openPicker();
  assert.equal(await date().inputValue(),'2026/10/23');
  assert.equal(await picker().inputValue(),'2026-10-23');
  await cancel();
  assert.equal((await data()).managementLists[0].items[0].expiryDate,'2026-10-23');
  assert.equal(await page.evaluate(()=>window.Notification?.permission==='granted'),false);
  assert.deepEqual(apiRequests,[]);
  assert.deepEqual(errors,[]);
  console.log(`Browser date defaults ${scenario.zone}: local midnight, optional blank dates, picker draft, cancel/save, invalid input, existing deadlines, notifications OFF and management expiry: OK`);
 }finally{await context.close();}
}

try{for(const scenario of cases)await exercise(scenario);}
finally{await browser.close();}
