import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
try{
 for(const width of [320,375,412,768,1280]){
  await page.setViewportSize({width,height:900});const readings=[];
  for(const route of ['lists','templates','management','settings']){
   await page.goto(origin+'/#/'+route);await page.locator('.collection-heading').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow on '+route+' at '+width);
   readings.push(await page.locator('.collection-heading').evaluate(el=>{
    const h=el.querySelector('h1'),p=el.querySelector('p'),b=el.querySelector('button'),r=b?.getBoundingClientRect();
    return {title:getComputedStyle(h).fontSize,description:getComputedStyle(p).fontSize,button:b?getComputedStyle(b).fontSize:null,x:r?.x,y:r?.y,width:r?.width,height:r?.height};
   }));
  }
  assert.equal(readings[3].title,readings[0].title);assert.equal(readings[3].description,readings[0].description);
  assert.deepEqual(readings[2],readings[0]);assert.deepEqual(readings[2],readings[1]);
 }
 const ids=await page.evaluate(async()=>{
  const domain=await import('/src/domain.js'),management=await import('/src/management-domain.js');
  let state=JSON.parse(localStorage.getItem('tempalist:data'));
  state=domain.createTemplate(state,{name:'表示確認用の長いタイトルを含むテンプレート',items:[{label:'洗剤',note:'項目のコメント'},{label:'文字数が多い場合にも読みやすく表示されることを確認する項目'}]});
  const sourceTemplateId=state.templates.at(-1).id;
  state=domain.createChecklist(state,{title:'表示確認用の長いタイトルを含むチェックリスト',sourceTemplateId});
  state=management.createManagementList(state,{name:'表示確認用の長いタイトルを含む管理リスト',sourceTemplateId});
  state.managementLists.at(-1).items.forEach(item=>{item.needsAction=true;});
  localStorage.setItem('tempalist:data',JSON.stringify(state));
  return {template:sourceTemplateId,checklist:state.checklists.at(-1).id,management:state.managementLists.at(-1).id};
 });
 await page.reload();await page.locator('.collection-heading').waitFor();
 for(const width of [320,375,412,768,1280]){
  await page.setViewportSize({width,height:900});
  for(const route of ['template/'+ids.template,'checklist/'+ids.checklist,'management/'+ids.management,'actions']){
   await page.goto(origin+'/#/'+route);await page.locator('.detail-heading').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'detail overflow '+route);
   if(route!=='actions'){
    const edit=page.locator('.detail-edit');assert.equal((await edit.boundingBox()).height,44);
    assert.ok(await edit.evaluate(el=>el.getBoundingClientRect().left>=el.parentElement.querySelector('h1').getBoundingClientRect().right));
   }
   assert.ok(await page.locator('.item-label').evaluateAll(elements=>elements.every(el=>el.hasAttribute('data-label-units')&&parseFloat(getComputedStyle(el).fontSize)>=14&&parseFloat(getComputedStyle(el).fontSize)<=16)));
  }
 }
 await page.goto(origin+'/#/settings');await page.locator('.collection-heading').waitFor();
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'artifacts/settings-heading-mobile.png',fullPage:true});
 console.log('Detail headings/edit buttons/long labels and overflow: OK');
 console.log('Collection headings: title, description, button typography and position match at 320/375/412/768/1280px, including settings: OK');
}catch(error){console.error(page.url(),await page.locator('main').innerText());throw error;}finally{await browser.close();}
