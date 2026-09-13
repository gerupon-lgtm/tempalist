import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
try{
 for(const width of [320,375,412,768]){
  await page.setViewportSize({width,height:900});const readings=[];
  for(const route of ['lists','templates','management']){
   await page.goto(origin+'/#/'+route);await page.locator('.collection-heading').waitFor();
   readings.push(await page.locator('.collection-heading').evaluate(el=>{
    const h=el.querySelector('h1'),p=el.querySelector('p'),b=el.querySelector('button'),r=b.getBoundingClientRect();
    return {title:getComputedStyle(h).fontSize,description:getComputedStyle(p).fontSize,button:getComputedStyle(b).fontSize,x:r.x,y:r.y,width:r.width,height:r.height};
   }));
  }
  assert.deepEqual(readings[2],readings[0]);assert.deepEqual(readings[2],readings[1]);
 }
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'artifacts/management-heading-mobile.png',fullPage:true});
 console.log('Collection headings: title, description, button typography and position match at 320/375/412/768px: OK');
}finally{await browser.close();}
