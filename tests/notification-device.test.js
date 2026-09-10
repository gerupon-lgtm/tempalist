import {it,expect,vi} from 'vitest';
import {createBrowserDevice,notificationSupport} from '../src/notification/device.js';
import {createNotificationApi} from '../src/notification/api.js';
const env=()=>({navigator:{userAgent:'desktop',maxTouchPoints:0,locks:{},serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe:async()=>({toJSON:()=>({endpoint:'new'})})}})}},Notification:{permission:'default',requestPermission:vi.fn(async()=> 'granted')},PushManager:function(){},isSecureContext:true,matchMedia:()=>({matches:false})});
it('normalizes Safari subscriptions for registration and subsequent sync inspection',async()=>{
 const e=env();e.navigator.userAgent='iPhone';e.navigator.standalone=true;
 const safari={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'BA'+'A'.repeat(85),auth:'A'.repeat(22)}};
 e.navigator.serviceWorker.ready=Promise.resolve({pushManager:{getSubscription:async()=>({toJSON:()=>safari})}});
 const device=createBrowserDevice(e),subscription=await device.subscribe('BA'+'A'.repeat(85));
 const registered={appId:'tempalist',protocolVersion:2,deviceId:'11111111-1111-4111-8111-111111111111',deviceSecret:'test-secret',createdAt:'2026-09-10T00:00:00.000Z'};
 const fetch=vi.fn(async()=>({status:201,ok:true,json:async()=>registered}));
 await expect(createNotificationApi({fetch}).registerDevice({subscription})).resolves.toEqual(registered);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({subscription:{...safari,expirationTime:null}});
 expect(await device.currentSubscription()).toEqual(subscription);
 expect(safari).not.toHaveProperty('expirationTime');
});
it('keeps explicit expiry values and invalid keys available for strict API validation',async()=>{
 const e=env(),raw={endpoint:'https://web.push.apple.com/test',expirationTime:1234567890000,keys:{p256dh:'bad',auth:'bad'}};
 e.navigator.serviceWorker.ready=Promise.resolve({pushManager:{getSubscription:async()=>({toJSON:()=>raw})}});
 const subscription=await createBrowserDevice(e).subscribe('BA'+'A'.repeat(85));
 expect(subscription).toEqual(raw);
 const fetch=vi.fn();await expect(createNotificationApi({fetch}).registerDevice({subscription})).rejects.toMatchObject({kind:'validation'});expect(fetch).not.toHaveBeenCalled();
});
it('requires home-screen installation on iOS before requesting permission',async()=>{
 const e=env();e.navigator.userAgent='iPhone';const d=createBrowserDevice(e);
 await expect(d.requestPermission()).rejects.toThrow('ホーム画面');expect(e.Notification.requestPermission).not.toHaveBeenCalled();
});
it('supports iPad desktop user agents only when installed',()=>{
 const e=env();e.navigator.userAgent='Macintosh';e.navigator.maxTouchPoints=5;expect(notificationSupport(e)).toContain('ホーム画面');e.matchMedia=()=>({matches:true});expect(notificationSupport(e)).toBe('');
});
it('requests permission only through an explicit call and rejects denial',async()=>{
 const e=env(),d=createBrowserDevice(e);expect(e.Notification.requestPermission).not.toHaveBeenCalled();await d.requestPermission();expect(e.Notification.requestPermission).toHaveBeenCalledTimes(1);
 e.Notification.permission='denied';await expect(d.requestPermission()).rejects.toThrow('許可');expect(e.Notification.requestPermission).toHaveBeenCalledTimes(1);
});
it('does not request permission on unsupported browsers',async()=>{
 const e=env();delete e.PushManager;await expect(createBrowserDevice(e).requestPermission()).rejects.toThrow('対応');expect(e.Notification.requestPermission).not.toHaveBeenCalled();
});
it('reuses an existing subscription and can unsubscribe it',async()=>{
 const e=env(),sub={toJSON:()=>({endpoint:'existing'}),unsubscribe:vi.fn(async()=>true)};
 const manager={getSubscription:async()=>sub,subscribe:vi.fn()};e.navigator.serviceWorker.ready=Promise.resolve({pushManager:manager});
 const d=createBrowserDevice(e);expect(await d.subscribe('BA'+'A'.repeat(85))).toMatchObject({endpoint:'existing',expirationTime:null});expect(manager.subscribe).not.toHaveBeenCalled();await d.unsubscribe();expect(sub.unsubscribe).toHaveBeenCalled();
});
it('shows a Japanese error when the browser push service rejects registration',async()=>{
 const e=env();e.navigator.serviceWorker.ready=Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe:async()=>{throw new Error('internal push endpoint');}}});
 await expect(createBrowserDevice(e).subscribe('BA'+'A'.repeat(85))).rejects.toThrow('通知サービスに登録できませんでした');
});
it('stops waiting when the browser push service never responds',async()=>{
 vi.useFakeTimers();try{
  const e=env();e.navigator.serviceWorker.ready=Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe:()=>new Promise(()=>{})}});
  const result=createBrowserDevice(e).subscribe('BA'+'A'.repeat(85)).catch(error=>error);
  await vi.advanceTimersByTimeAsync(20000);
  // Avoid waiting forever on the old implementation while still asserting the user-visible result.
  const outcome=await Promise.race([result,Promise.resolve(null)]);
  expect(outcome?.message).toContain('時間がかかっています');
 }finally{vi.useRealTimers();}
});
