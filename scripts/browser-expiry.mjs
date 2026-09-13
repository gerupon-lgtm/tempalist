import {buildChecklistLink} from '../src/checklist-link.js';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const ios=process.env.TEST_IOS==='1'||process.argv.includes('--ios');
const context=await browser.newContext({viewport:{width:375,height:812},timezoneId:'Asia/Tokyo',...(ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',hasTouch:true}:{})});
const page=await context.newPage(),requests=[];
await context.grantPermissions(['notifications']);
const cdp=await context.newCDPSession(page);let registrationId;
cdp.on('ServiceWorker.workerRegistrationUpdated',({registrations})=>{registrationId=registrations.find(r=>r.scopeURL==='http://127.0.0.1:4173/'&&!r.isDeleted)?.registrationId??registrationId;});
await cdp.send('ServiceWorker.enable');
const deviceId='11111111-1111-4111-8111-111111111111';
await context.addInitScript(ios=>{
 if(ios)Object.defineProperty(navigator,'standalone',{value:true});
 let granted=localStorage.getItem('test:permission')==='granted';
 Object.defineProperty(Notification,'permission',{get:()=>granted?'granted':'default'});
 Notification.requestPermission=async()=>{granted=true;localStorage.setItem('test:permission','granted');return 'granted';};
 const value={endpoint:'https://push.example/test',expirationTime:null,keys:{p256dh:'BA'+'A'.repeat(85),auth:'A'.repeat(22)}};
 if(ios)delete value.expirationTime;
 const sub={toJSON:()=>value,unsubscribe:async()=>true};
 PushManager.prototype.getSubscription=async()=>sub;PushManager.prototype.subscribe=async()=>sub;
},ios);
await context.route('https://api.atoqueue.sikumilab.com/v2/**',async route=>{
 const req=route.request(),url=new URL(req.url()),method=req.method(),body=req.postDataJSON();requests.push({path:url.pathname,method,body,key:req.headers()['idempotency-key']});
 if(method==='GET')return route.fulfill({json:{publicKey:'BA'+'A'.repeat(85)}});
 if(method==='POST'){assert.equal(body.subscription.expirationTime,null);assert.deepEqual(Object.keys(body.subscription).sort(),['endpoint','expirationTime','keys']);return route.fulfill({status:201,json:{appId:'tempalist',protocolVersion:2,deviceId,deviceSecret:'test-secret',createdAt:new Date().toISOString()}});}
 if(method==='DELETE')return route.fulfill({status:204});
 if(url.pathname.includes('/subscription'))return route.fulfill({json:{appId:'tempalist',deviceId,status:'active',updatedAt:new Date().toISOString()}});
 assert.deepEqual(Object.keys(body).sort(),['deviceId','notificationKey','routeKey','scheduledAt']);
 return route.fulfill({status:201,json:{reminderId:url.pathname.split('/').at(-1),status:'pending',scheduledAt:body.scheduledAt,repeatCadence:null,updatedAt:new Date().toISOString()}});
});
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const button=name=>page.getByRole('button',{name,exact:true});
const closed=()=>page.locator('#dialog').waitFor({state:'hidden'});
const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
const q=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:notification')));
const synced=count=>page.waitForFunction(count=>{const s=JSON.parse(localStorage.getItem('tempalist:notification'));return s?.device&&s.maps.length===count&&!s.outbox.length;},count);
async function route(path){await page.goto(origin+'/#/'+path);await page.getByRole('heading',{level:1}).waitFor();}
async function editExpiry(value){
 await page.locator('.item-menu summary').first().click();await page.locator('[data-management-action="edit-item"]').first().click();
 await page.getByLabel('消費期限（任意）',{exact:true}).fill(value);await button('保存する').click();await closed();
}
try{
 await route('management');await page.evaluate(()=>navigator.serviceWorker.ready);
 await button('管理リストを作る').click();await page.getByLabel('テンプレート',{exact:true}).selectOption({label:'食品'});await button('作成する').click();await closed();
 const list=(await data()).managementLists[0];const path='management/'+list.id;
 const future=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 await editExpiry(future);assert.equal((await data()).managementLists[0].items[0].expiryDate,future);
 await button('通知を設定').click();await page.getByLabel('この管理リストの通知を受け取る').check();await button('保存する').click();await closed();await synced(2);
 let before=await q();const ids=before.maps.map(m=>m.reminderId);assert.ok(before.maps.every(m=>m.managementListId===list.id));
 assert.ok(before.maps.every(m=>m.scheduledAt.includes('T00:00:00.000Z')));
 await route('settings');await button('通知時刻を変更').click();await page.getByLabel('通知時刻',{exact:true}).fill('1030');await button('保存する').click();await closed();
 await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('tempalist:notification'));return s.maps.length===2&&!s.outbox.length&&s.maps.every(m=>m.scheduledAt.includes('T01:30'));});
 assert.deepEqual((await q()).maps.map(m=>m.reminderId),ids);
 await page.locator('#retention').selectOption('30d');await button('変更する').click();await closed();assert.equal((await data()).settings.expiryNotificationTime,'10:30');await synced(2);
 // Notification startup resolves the management target, never a normal checklist.
 await page.goto(origin+'/?reminderId='+ids[0]);await page.waitForURL('**/#/'+path);
 await page.locator('[data-management-check=need]').first().check();await synced(0);assert.equal((await data()).managementLists[0].items[0].expiryDate,future);
 await route('actions');await page.locator('[data-management-check=complete]').first().click();await button('元に戻す').waitFor();assert.equal((await data()).managementLists[0].items[0].expiryDate,null);
 await button('元に戻す').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).managementLists[0].items[0].needsAction);assert.equal((await data()).managementLists[0].items[0].expiryDate,future);await synced(0);
 await route(path);await page.locator('[data-management-check=need]').first().uncheck();await synced(2);
 await editExpiry('');await synced(0);
 await editExpiry(future);await synced(2);
 await button('通知を設定').click();await page.getByLabel('この管理リストの通知を受け取る').uncheck();await button('保存する').click();await closed();await synced(0);assert.equal((await data()).managementLists[0].items[0].expiryDate,future);
 await button('通知を設定').click();await page.getByLabel('この管理リストの通知を受け取る').check();await button('保存する').click();await closed();await synced(2);
 await context.setOffline(true);await page.locator('[data-management-check=need]').first().check();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tempalist:data')).managementLists[0].items[0].needsAction);
 // The backend is mocked; offline cancellation transport is covered by queue/runtime unit tests.
 await context.setOffline(false);await route('settings');await button('通知の同期を再試行').click();await synced(0);
 await page.screenshot({path:'artifacts/expiry-settings-mobile.png',fullPage:true});
 assert.equal(requests.filter(r=>r.method==='POST').length,1);
 console.log('Expiry UI: optional date, management toggle, common time reschedule, notification route, consume/cancel, purchase/undo, clear, OFF preservation, retry: OK');
}finally{await browser.close();}
