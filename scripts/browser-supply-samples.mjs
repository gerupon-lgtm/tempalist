import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
try{
 await page.goto(origin);await page.locator('[data-nav=management]').waitFor();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
 assert.equal((await read()).templates.length,9);
 // Recreate an existing user before this release, keeping a custom Food template.
 await page.evaluate(()=>{
  const state=JSON.parse(localStorage.getItem('tempalist:data'));
  delete state.supplySamplesAdded;
  state.templates=state.templates.filter(t=>!['猫用品','日用品','実験備品'].includes(t.name));
  state.templates.find(t=>t.name==='食品').items[0].label='自分の食品';
  localStorage.setItem('tempalist:data',JSON.stringify(state));localStorage.removeItem('tempalist:supply-samples-v1');
 });
 await page.reload();await page.locator('[data-nav=management]').waitFor();assert.equal((await read()).templates.length,9);assert.equal((await read()).templates.find(t=>t.name==='食品').items[0].label,'自分の食品');
 await page.getByRole('link',{name:'管理',exact:true}).click();await page.getByRole('button',{name:'管理リストを作る',exact:true}).click();await page.getByLabel('テンプレート',{exact:true}).selectOption({label:'猫用品'});await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal((await read()).managementLists[0].items.length,6);
 const data=await read(),sample=data.templates.find(t=>t.name==='猫用品');
 await page.evaluate(id=>{const state=JSON.parse(localStorage.getItem('tempalist:data'));state.templates=state.templates.filter(t=>t.id!==id);localStorage.setItem('tempalist:data',JSON.stringify(state));},sample.id);
 await page.reload();await page.locator('[data-nav=management]').waitFor();assert.equal((await read()).templates.length,8);assert.equal((await read()).managementLists[0].items.length,6);
 await page.reload();await page.locator('[data-nav=management]').waitFor();assert.equal((await read()).templates.length,8);
 console.log('Supply samples: new/existing users, name conflict preservation, management creation, no duplicate or resurrection after reload: OK');
}finally{await browser.close();}
