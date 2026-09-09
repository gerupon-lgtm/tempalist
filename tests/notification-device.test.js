import {it,expect,vi} from 'vitest';
import {createBrowserDevice,notificationSupport} from '../src/notification/device.js';
const env=()=>({navigator:{userAgent:'desktop',maxTouchPoints:0,locks:{},serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe:async()=>({toJSON:()=>({endpoint:'new'})})}})}},Notification:{permission:'default',requestPermission:vi.fn(async()=> 'granted')},PushManager:function(){},isSecureContext:true,matchMedia:()=>({matches:false})});
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
 const d=createBrowserDevice(e);expect(await d.subscribe('BA'+'A'.repeat(85))).toEqual({endpoint:'existing'});expect(manager.subscribe).not.toHaveBeenCalled();await d.unsubscribe();expect(sub.unsubscribe).toHaveBeenCalled();
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
