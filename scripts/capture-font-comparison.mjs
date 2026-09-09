import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812},timezoneId:'Asia/Tokyo'});
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:/工場の始業前点検/}).click();
 await page.getByLabel('タイトル',{exact:true}).fill('朝の作業を始める前に');
 await page.getByLabel('期限の日付',{exact:true}).fill('20260910');await page.getByLabel('時刻',{exact:true}).fill('0830');
 await page.getByRole('button',{name:'作成する',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
 await page.getByRole('checkbox').first().check();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).checklists[0].items[0].checked);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
 await page.addStyleTag({url:'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap'});
 await mkdir('artifacts',{recursive:true});
 for(const [name,file] of [['Zen Kaku Gothic New','font-zen'],['Noto Sans JP','font-noto']]){
  await page.evaluate(async family=>{
   document.documentElement.style.setProperty('--font-sans',`"${family}",system-ui,sans-serif`);
   await Promise.all([document.fonts.load(`500 16px "${family}"`,'始業前点検'),document.fonts.load(`700 19px "${family}"`,'完了を確定する')]);
   await document.fonts.ready;
  },name);
  await page.screenshot({path:`artifacts/${file}.png`,fullPage:true});
 }
 const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>書体の実画面比較</title><style>body{margin:0;padding:24px;background:#f3f5f7;color:#142432;font:16px system-ui,sans-serif}h1{font-size:22px;margin:0 0 10px}p{margin:0 0 20px;line-height:1.7}.columns{display:flex;gap:20px;align-items:start}figure{margin:0;width:375px;flex-shrink:0}figcaption{font-weight:700;padding:16px;background:#fff;border-radius:12px 12px 0 0}img{display:block;width:100%}</style><h1>同じ配色・太さ・データで書体だけを比較</h1><p>本文500／見出し・主要ボタン700。左：以前の書体を現在の太さに調整。右：現在の書体。<br>どちらも実アプリのスクリーンショットです。</p><div class="columns"><figure><figcaption>Zen Kaku Gothic New</figcaption><img src="font-zen.png" alt="Zen Kaku Gothic Newによる実画面"></figure><figure><figcaption>Noto Sans JP（現在）</figcaption><img src="font-noto.png" alt="Noto Sans JPによる実画面"></figure></div></html>';
 await writeFile('artifacts/font-comparison.html',html,'utf8');
 const comparison=await context.newPage();await comparison.setViewportSize({width:820,height:900});
 await comparison.goto(pathToFileURL(resolve('artifacts/font-comparison.html')).href);
 await comparison.screenshot({path:'artifacts/font-comparison.png',fullPage:true});
 console.log('Actual font comparison saved: artifacts/font-comparison.html and .png');
}finally{await browser.close();}
