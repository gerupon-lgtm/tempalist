import {it,expect,vi} from 'vitest';
import {createNotificationRuntime} from '../src/notification/runtime.js';
import {readNotifications,saveNotifications,emptyNotifications} from '../src/notification/queue.js';
const id='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-09-10T00:00:00Z');
const registered={deviceId:id,deviceSecret:'private',appId:'tempalist',protocolVersion:2,createdAt:new Date(now).toISOString()};
const subscription={endpoint:'https://push.example',expirationTime:null,keys:{p256dh:'key',auth:'key'}};
function setup(){
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 let lists=[{id,status:'active',notificationEnabled:true,dueAt:'2026-09-12T00:00:00Z',offsets:['-1h']}];
 const api={getPublicKey:vi.fn(async()=>({publicKey:'key'})),registerDevice:vi.fn(async()=>registered),upsertReminder:vi.fn(async()=>{}),cancelReminder:vi.fn(async()=>{}),disableDevice:vi.fn(async()=>{}),updateSubscription:vi.fn(async()=>{})};
 const device={requestPermission:vi.fn(async()=>{}),subscribe:vi.fn(async()=>subscription),currentSubscription:vi.fn(async()=>subscription),unsubscribe:vi.fn(async()=>{}),permission:()=> 'granted'};
 const runtime=createNotificationRuntime({storage,api,device,readLists:()=>lists,now:()=>now,locks:null,onChange:()=>{}});
 return {runtime,api,device,storage,lists,setLists:value=>lists=value};
}
it('does not register or ask permission during startup',async()=>{
 const s=setup();await s.runtime.sync();expect(s.api.registerDevice).not.toHaveBeenCalled();expect(s.device.requestPermission).not.toHaveBeenCalled();s.runtime.dispose();
});
it('keeps setup failures visible in the settings status without claiming registration succeeded',async()=>{
 const s=setup();s.device.requestPermission.mockRejectedValue(new Error('通知が許可されていません。'));
 await expect(s.runtime.enable()).rejects.toThrow('通知が許可されていません');
 expect(s.runtime.status()).toMatchObject({registered:false,message:'通知が許可されていません。'});
 expect(s.api.registerDevice).not.toHaveBeenCalled();s.runtime.dispose();
});
it('persists registration and outbox before sending, with no duplicate on reload',async()=>{
 const s=setup();await s.runtime.enable();
 s.api.upsertReminder.mockImplementation(async()=>{expect(readNotifications(s.storage).outbox).toHaveLength(1);});
 await s.runtime.sync();await s.runtime.sync();
 expect(s.api.upsertReminder).toHaveBeenCalledTimes(1);expect(readNotifications(s.storage).maps).toHaveLength(1);s.runtime.dispose();
});
it('keeps operation identity after response loss and honors the retry deadline',async()=>{
 const s=setup();await s.runtime.enable();s.api.upsertReminder.mockRejectedValue({kind:'network',retryable:true});
 await s.runtime.sync();const first=readNotifications(s.storage).outbox[0];await s.runtime.sync();
 expect(s.api.upsertReminder).toHaveBeenCalledTimes(1);expect(readNotifications(s.storage).outbox[0].id).toBe(first.id);s.runtime.dispose();
});
it('retains mappings until successful cancellation even after the list is deleted',async()=>{
 const s=setup();await s.runtime.enable();await s.runtime.sync();s.setLists([]);s.api.cancelReminder.mockRejectedValue({kind:'network',retryable:true});
 await s.runtime.sync();expect(readNotifications(s.storage).maps).toHaveLength(1);expect(readNotifications(s.storage).outbox[0].operation).toBe('cancel');s.runtime.dispose();
});
it('does not enable a device when permission is denied or registration fails',async()=>{
 const s=setup();s.device.requestPermission.mockRejectedValue(new Error('拒否'));await expect(s.runtime.enable()).rejects.toThrow('拒否');expect(s.api.registerDevice).not.toHaveBeenCalled();
 s.device.requestPermission.mockResolvedValue();s.api.registerDevice.mockRejectedValue(new Error('offline'));
 await expect(s.runtime.enable()).rejects.toThrow();expect(readNotifications(s.storage).device).toBeNull();s.runtime.dispose();
});
it('blocks permanent errors and invalidates device credentials on DEVICE_NOT_FOUND',async()=>{
 const s=setup();await s.runtime.enable();s.api.upsertReminder.mockRejectedValue({status:403,code:'APP_ORIGIN_FORBIDDEN',retryable:false});await s.runtime.sync();await s.runtime.sync();
 expect(s.api.upsertReminder).toHaveBeenCalledTimes(1);expect(readNotifications(s.storage).outbox[0].blocked).toBe(true);
 s.api.upsertReminder.mockRejectedValue({status:404,code:'DEVICE_NOT_FOUND',retryable:false});await s.runtime.retry();
 expect(readNotifications(s.storage).device).toBeNull();expect(s.lists[0].notificationEnabled).toBe(true);s.runtime.dispose();
});
it('persists device disable intent until success, then unsubscribes',async()=>{
 const s=setup();await s.runtime.enable();s.api.disableDevice.mockRejectedValue({kind:'network',retryable:true});await s.runtime.disable();
 expect(readNotifications(s.storage).disable.id).toBeTruthy();expect(s.device.unsubscribe).not.toHaveBeenCalled();
 s.api.disableDevice.mockResolvedValue();await s.runtime.retry();expect(readNotifications(s.storage).device).toBeNull();expect(s.device.unsubscribe).toHaveBeenCalled();s.runtime.dispose();
});
it('does not change saved credentials or lists on quota errors',async()=>{
 const s=setup();s.storage.setItem=()=>{throw new Error('quota');};await expect(s.runtime.enable()).rejects.toThrow('保存');expect(s.api.registerDevice).not.toHaveBeenCalled();s.runtime.dispose();
});
it('keeps a saved subscription update key when its response is lost',async()=>{
 const s=setup();saveNotifications(s.storage,{...emptyNotifications(),device:registered,subscription:{...subscription,endpoint:'https://old.example'}});
 s.api.updateSubscription.mockRejectedValue({kind:'network',retryable:true});await expect(s.runtime.enable()).rejects.toBeTruthy();
 const saved=readNotifications(s.storage).subscriptionChange;expect(saved.id).toBeTruthy();
 s.api.updateSubscription.mockResolvedValue();await s.runtime.retry();expect(s.api.updateSubscription.mock.calls[1][2]).toBe(saved.id);s.runtime.dispose();
});
it('still cancels reservations when browser subscription inspection fails',async()=>{
 const s=setup();await s.runtime.enable();await s.runtime.sync();s.setLists([]);s.device.currentSubscription.mockRejectedValue(new Error('browser unavailable'));
 await s.runtime.sync();expect(s.api.cancelReminder).toHaveBeenCalledTimes(1);expect(readNotifications(s.storage).maps).toEqual([]);s.runtime.dispose();
});
