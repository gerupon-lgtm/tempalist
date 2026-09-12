import {readNotifications} from './queue.js';
const errorName=error=>['SecurityError','NotAllowedError','InvalidStateError','TypeError','AbortError','timeout'].includes(error?.name)?error.name:'unknown';
async function bounded(promise){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error();e.name='timeout';reject(e);},5000);})]);}finally{clearTimeout(timer);}
}
export async function requestWorker(worker,type,env=globalThis){
 const channel=new env.MessageChannel();
 try{return await bounded(new Promise((resolve,reject)=>{
  channel.port1.onmessage=event=>resolve(event.data);
  channel.port1.onmessageerror=()=>reject(new Error());
  worker.postMessage({type},[channel.port2]);
 }));}finally{channel.port1.close();channel.port2.close();}
}
export async function inspectNotificationBrowser(env=globalThis){
 const result={standalone:Boolean(env.navigator.standalone||env.matchMedia?.('(display-mode: standalone)').matches),controlled:Boolean(env.navigator.serviceWorker?.controller)};
 try{
  const registration=await bounded(env.navigator.serviceWorker.getRegistration(env.location.href));
  result.registrationPresent=Boolean(registration);result.activeWorker=Boolean(registration?.active);result.waitingWorker=Boolean(registration?.waiting);
  if(!registration)return result;
  result.controllerMatchesActive=Boolean(registration.active&&env.navigator.serviceWorker.controller===registration.active);
  try{
   const subscription=await bounded(registration.pushManager.getSubscription()),current=subscription?.toJSON();
   result.browserSubscriptionPresent=Boolean(subscription);
   const previous=readNotifications(env.localStorage).subscription;result.savedSubscriptionPresent=Boolean(previous);
   result.subscriptionMatchesLocal=Boolean(current?.endpoint&&previous&&current.endpoint===previous.endpoint&&current.keys?.p256dh===previous.keys?.p256dh&&current.keys?.auth===previous.keys?.auth&&(current.expirationTime??subscription.expirationTime??null)===(previous.expirationTime??null));
  }catch(error){result.subscriptionInspectionError=errorName(error);}
  try{result.currentlyVisibleNotificationCount=(await bounded(registration.getNotifications())).length;}catch(error){result.visibleNotificationInspection=errorName(error);}
  if(registration.active){
   try{const data=await requestWorker(registration.active,'tempalist:inspect-push',env);
    if(data&&typeof data.version==='string'&&/^\d+\.\d+\.\d+$/.test(data.version)&&typeof data.historyAvailable==='boolean'&&Array.isArray(data.events)){
     result.receiverVersion=data.version;result.pushHistoryAvailable=data.historyAvailable;
     // Re-project even data from our worker: diagnostics must not expose extra fields.
     result.pushEvents=data.events.slice(-100).filter(e=>e&&['push-received','display-accepted','display-failed'].includes(e.event)&&['push','local-test'].includes(e.source)&&Number.isFinite(Date.parse(e.at))).map(e=>({at:new Date(e.at).toISOString(),event:e.event,source:e.source,...(typeof e.version==='string'&&/^\d+\.\d+\.\d+$/.test(e.version)?{version:e.version}:{}),...(typeof e.reminderId==='string'&&/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(e.reminderId)?{reminderId:e.reminderId}:{}),...(typeof e.validPayload==='boolean'?{validPayload:e.validPayload}:{}),...(e.errorName?{errorName:errorName({name:e.errorName})}:{})}));
    }else result.receiverInspection='invalid-response';
   }catch(error){result.receiverInspection=errorName(error);}
  }
 }catch(error){result.inspectionError=errorName(error);}
 return result;
}
export async function testNotificationDisplay(env=globalThis){
 if(env.Notification?.permission!=='granted')throw new Error('通知が許可されていません。端末の通知設定を確認してください。');
 const registration=await bounded(env.navigator.serviceWorker.getRegistration(env.location.href));
 if(!registration?.active)throw new Error('通知処理の準備ができていません。アプリを開き直してください。');
 try{
  const result=await requestWorker(registration.active,'tempalist:test-display',env);
  if(result?.displayRequest==='accepted')return '表示要求が受け付けられました。端末の通知欄に「表示テスト」が出たか確認してください。';
  if(result?.displayRequest==='failed')return `表示要求に失敗しました（${errorName({name:result.errorName})}）。診断情報を確認してください。`;
  return '表示結果を確認できませんでした。診断情報を確認してください。';
 }catch{return '通知処理から応答を確認できませんでした。アプリを更新し、診断情報を確認してください。';}
}
