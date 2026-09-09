import {it,expect,vi} from 'vitest';
import {createNotificationApi} from '../src/notification/api.js';
const deviceId='11111111-1111-4111-8111-111111111111',reminderId='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333';
const credentials={deviceId,deviceSecret:'x'.repeat(43)};
const subscription={endpoint:'https://push.example/subscription',expirationTime:null,keys:{p256dh:'BA'+'A'.repeat(85),auth:'A'.repeat(22)}};
const registered={appId:'tempalist',protocolVersion:2,...credentials,createdAt:'2026-09-10T00:00:00.000Z'};
const body={deviceId,scheduledAt:'2026-10-01T00:00:00.000Z',notificationKey:'deadline_advance',routeKey:'list'};
const response=(value,status=200)=>({ok:status<300,status,headers:new Headers(),json:async()=>value});
it('registers a subscription and validates its app identity',async()=>{
 const fetch=vi.fn(async()=>response(registered,201));const api=createNotificationApi({fetch});
 expect(await api.registerDevice({subscription})).toEqual(registered);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({subscription});
 expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
 await expect(createNotificationApi({fetch:async()=>response({...registered,appId:'other'},201)}).registerDevice({subscription})).rejects.toMatchObject({kind:'protocol'});
});
it('sends an anonymous reminder with saved identity and operation key',async()=>{
 const fetch=vi.fn(async()=>response({reminderId,status:'pending',scheduledAt:body.scheduledAt,repeatCadence:null,updatedAt:registered.createdAt},201));
 const api=createNotificationApi({fetch});await api.upsertReminder(credentials,reminderId,body,key);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
 expect(fetch.mock.calls[0][1].headers).toMatchObject({Authorization:`Bearer ${credentials.deviceSecret}`,'Idempotency-Key':key});
 await expect(api.upsertReminder(credentials,reminderId,{...body,title:'private'},key)).rejects.toMatchObject({kind:'validation'});
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('checks reminder response identity before acknowledging',async()=>{
 const api=createNotificationApi({fetch:async()=>response({reminderId:key,status:'pending',scheduledAt:body.scheduledAt,repeatCadence:null,updatedAt:registered.createdAt})});
 await expect(api.upsertReminder(credentials,reminderId,body,key)).rejects.toMatchObject({kind:'protocol'});
});
it('cancels and disables only on 204, and updates subscriptions with a key',async()=>{
 const fetch=vi.fn(async()=>response(null,204));const api=createNotificationApi({fetch});
 await api.cancelReminder(credentials,reminderId);await api.disableDevice(credentials,key);
 expect(fetch.mock.calls[0][0]).toContain(`?deviceId=${deviceId}`);
 expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe(key);
 fetch.mockResolvedValueOnce(response({appId:'tempalist',deviceId,status:'active',updatedAt:registered.createdAt}));
 await api.updateSubscription(credentials,{subscription},key);
 fetch.mockResolvedValueOnce(response({}));
 await expect(api.cancelReminder(credentials,reminderId)).rejects.toMatchObject({kind:'protocol'});
});
it('preserves Retry-After and distinguishes missing devices from missing reminders',async()=>{
 const fetch=vi.fn(async()=>({...response({error:{code:'RATE_LIMITED',message:'private'}},429),headers:new Headers({'Retry-After':'120'})}));
 const api=createNotificationApi({fetch});
 await expect(api.cancelReminder(credentials,reminderId)).rejects.toMatchObject({retryable:true,retryAfterSeconds:120,code:'RATE_LIMITED'});
 fetch.mockResolvedValueOnce(response({error:{code:'REMINDER_NOT_FOUND'}},404));
 await expect(api.cancelReminder(credentials,reminderId)).rejects.toMatchObject({code:'REMINDER_NOT_FOUND'});
});
