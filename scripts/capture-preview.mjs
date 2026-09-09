import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},timezoneId:'Asia/Tokyo'});
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:/工場の始業前点検/}).click();
 await page.getByLabel('タイトル',{exact:true}).fill('朝の作業を始める前に');
 await page.getByLabel('期限の日付',{exact:true}).fill('20260910');
 await page.getByLabel('時刻',{exact:true}).fill('0830');
 await page.getByRole('button',{name:'作成する',exact:true}).click();
 await page.locator('#dialog').waitFor({state:'hidden'});
 for(let i=0;i<2;i++){
  await page.getByRole('checkbox').nth(i).check();
  await page.waitForFunction(index=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[index].checked,i);
 }
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
 await mkdir('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/preview-checklist-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'リスト',exact:true}).click();
 await page.screenshot({path:'artifacts/preview-home-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'artifacts/preview-home-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'テンプレート',exact:true}).click();
 await page.screenshot({path:'artifacts/preview-templates-desktop.png',fullPage:true});
 console.log('Trial previews captured in artifacts/preview-*.png (isolated sample data).');
}finally{await browser.close();}
