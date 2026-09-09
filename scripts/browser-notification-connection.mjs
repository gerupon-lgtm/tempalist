import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
const api='https://api.atoqueue.sikumilab.com/v2/apps/tempalist/push/public-key';
let requests=0,mode='success';
try{
  await page.route(api,async route=>{
    requests++;
    assert.equal(route.request().method(),'GET');
    assert.equal(route.request().postData(),null);
    assert.equal(route.request().headers().authorization,undefined);
    if(mode==='network')return route.abort();
    return route.fulfill({status:mode==='success'?200:404,contentType:'application/json',body:JSON.stringify(mode==='success'?{publicKey:'BA'+'A'.repeat(85)}:{error:{code:'APP_NOT_FOUND',message:'server internal text'}})});
  });
  await page.goto('http://127.0.0.1:4173/#/settings');
  await page.getByRole('heading',{name:'設定とデータ'}).waitFor();
  const before=await page.evaluate(()=>localStorage.getItem('tempalist:data'));
  assert.equal(requests,0,'No API request before an explicit click');
  const button=page.getByRole('button',{name:'接続を確認する',exact:true});
  assert.equal(await button.count(),1,'Settings exposes the notification connection check');
  await button.click();
  await page.locator('#notification-connection-status').filter({hasText:'接続できました'}).waitFor();
  assert.equal(requests,1);
  mode='missing';await button.click();
  await page.locator('#notification-connection-status').filter({hasText:'アプリ登録が必要'}).waitFor();
  assert.equal(await page.getByText('server internal text').count(),0);
  mode='network';await button.click();
  await page.locator('#notification-connection-status').filter({hasText:'通信状態と接続許可'}).waitFor();
  assert.equal(await button.isEnabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('tempalist:data')),before);
  assert.equal(await page.evaluate(()=>Notification.permission),'default');
  await page.screenshot({path:'artifacts/notification-connection-mobile.png',fullPage:true});
  console.log('Notification connection UI: explicit GET only, success/error/network states, no data changes or permission prompt: OK');
}finally{await browser.close();}
