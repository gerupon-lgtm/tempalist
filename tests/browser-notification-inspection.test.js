// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {inspectNotificationBrowser,testNotificationDisplay} from '../src/notification/browser-diagnostics.js';
import {emptyNotifications} from '../src/notification/queue.js';
function setup(){
 const sub={endpoint:'https://push.example/PRIVATE',expirationTime:null,keys:{p256dh:'PRIVATE',auth:'PRIVATE'}};
 const active={postMessage:vi.fn((data,ports)=>ports[0].postMessage(data.type==='tempalist:inspect-push'?{version:'0.4.3',historyAvailable:true,events:[],deviceSecret:'PRIVATE'}:{displayRequest:'accepted'}))};
 const registration={active,waiting:null,pushManager:{getSubscription:vi.fn(async()=>({toJSON:()=>sub}))},getNotifications:vi.fn(async()=>[])};
 const env={MessageChannel,Notification:{permission:'granted'},matchMedia:()=>({matches:true}),location:{href:'https://tempalist.sikumilab.com/#create=PRIVATE'},localStorage:{getItem:()=>JSON.stringify({...emptyNotifications(),subscription:sub})},navigator:{serviceWorker:{controller:active,getRegistration:vi.fn(async()=>registration)}}};
 return {env,registration};
}
it('inspects worker and subscription equality without returning credentials, URL fragments or raw Push keys',async()=>{
 const {env}=setup(),result=await inspectNotificationBrowser(env);
 expect(result).toMatchObject({standalone:true,controlled:true,registrationPresent:true,activeWorker:true,controllerMatchesActive:true,subscriptionMatchesLocal:true,receiverVersion:'0.4.3',pushHistoryAvailable:true,pushEvents:[]});
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE|endpoint|deviceSecret|p256dh/);
});
it('detects changed subscriptions and calls display only from explicit test function',async()=>{
 const {env,registration}=setup();registration.pushManager.getSubscription=async()=>({toJSON:()=>({endpoint:'https://changed.example',keys:{p256dh:'different',auth:'different'}})});
 expect((await inspectNotificationBrowser(env)).subscriptionMatchesLocal).toBe(false);
 expect(registration.active.postMessage.mock.calls[0][0].type).toBe('tempalist:inspect-push');
 expect(await testNotificationDisplay(env)).toContain('表示要求が受け付けられました');
 env.Notification.permission='denied';await expect(testNotificationDisplay(env)).rejects.toThrow('通知が許可されていません');
});
it('still reads receiver history when subscription inspection fails',async()=>{
 const {env,registration}=setup();const error=new Error('PRIVATE');error.name='InvalidStateError';
 registration.pushManager.getSubscription=async()=>{throw error;};
 const result=await inspectNotificationBrowser(env);
 expect(result.receiverVersion).toBe('0.4.3');expect(result.pushHistoryAvailable).toBe(true);
 expect(result.subscriptionInspectionError).toBe('InvalidStateError');expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('still reads receiver history with malformed saved notification state and retains AbortError',async()=>{
 const {env,registration}=setup();env.localStorage.getItem=()=>'{bad';
 registration.active.postMessage=(_data,ports)=>ports[0].postMessage({version:'0.4.3',historyAvailable:true,events:[{event:'display-failed',source:'push',at:'2026-09-12T06:00:00.000Z',errorName:'AbortError',endpoint:'PRIVATE'}]});
 const result=await inspectNotificationBrowser(env);expect(result.receiverVersion).toBe('0.4.3');
 expect(result.pushEvents[0].errorName).toBe('AbortError');expect(result.subscriptionInspectionError).toBeTruthy();expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
