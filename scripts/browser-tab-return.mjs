import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
try{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:/工場の始業前点検/}).click();
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 const route=await page.evaluate(()=>location.hash);
 await page.getByRole('checkbox').first().check();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].checked);
 for(const destination of ['テンプレート','設定']){
  await page.getByRole('link',{name:destination,exact:true}).click();
  await page.getByRole('heading',{level:1}).filter({hasText:destination}).waitFor();
  await page.reload();
  await page.getByRole('link',{name:'リスト',exact:true}).click();
  await page.getByRole('checkbox').first().waitFor();
  assert.equal(await page.evaluate(()=>location.hash),route);
  assert.equal(await page.getByRole('checkbox').first().isChecked(),true);
 }
 await page.getByRole('link',{name:'一覧に戻る',exact:true}).click();await page.locator('.list-card').waitFor();
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('heading',{name:'設定とデータ'}).waitFor();
 await page.getByRole('link',{name:'リスト',exact:true}).click();await page.locator('.list-card').waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'#/lists');
 // Deleting the remembered checklist in another tab must not leave a broken destination.
 await page.locator('.list-card').first().click();await page.getByRole('checkbox').first().waitFor();
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('heading',{name:'設定とデータ'}).waitFor();
 await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('tempalist:data'));state.checklists=[];localStorage.setItem('tempalist:data',JSON.stringify(state));});
 await page.reload();await page.getByRole('link',{name:'リスト',exact:true}).click();
 await page.getByRole('heading',{name:'いま、進行中のリストはありません'}).waitFor();
 console.log('Tab return: checklist and checks retained across tabs/reload, explicit overview respected, deleted destinations cleared: OK');
}finally{await browser.close();}
