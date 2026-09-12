import {emptyNotifications,readNotifications,saveNotifications,reconcile,acknowledge,failOperation} from './queue.js';
import {createNotificationDiagnostics} from './diagnostics.js';
const lifecycleOperation=()=>({id:crypto.randomUUID(),attemptCount:0,nextAttemptAt:'1970-01-01T00:00:00.000Z',blocked:false});
// JSON property order is not part of a Push subscription's identity.
const sameSubscription=(a,b)=>Boolean(a?.endpoint&&a.keys?.p256dh&&a.keys?.auth&&b&&
 a.endpoint===b.endpoint&&(a.expirationTime??null)===(b.expirationTime??null)&&
 a.keys.p256dh===b.keys?.p256dh&&a.keys.auth===b.keys?.auth);
export function createNotificationRuntime({storage,api,device,readLists,now=Date.now,locks=globalThis.navigator?.locks,onChange=()=>{}}){
 const diagnostics=createNotificationDiagnostics(storage,now);
 const trace=(event,op={},extra={})=>diagnostics.record(event,{reminderId:op.reminderId,operation:op.operation,scheduledAt:op.body?.scheduledAt,...extra});
 let tail=Promise.resolve(),timer=null,disposed=false,message='',awaitingSetup=false;
 const read=()=>readNotifications(storage);
 const save=s=>{saveNotifications(storage,s);onChange();return s;};
 const lock=task=>{const p=tail.then(()=>locks?locks.request('tempalist:notification',task):task());tail=p.catch(()=>{});return p;};
 function tell(text){message=text;onChange();}
 function schedule(){
  clearTimeout(timer);if(disposed)return;
  const s=read();if(!s.device)return;
  const pending=[s.disable,s.subscriptionChange,...s.outbox.filter(o=>!awaitingSetup||o.operation==='cancel')].filter(o=>o&&!o.blocked);
  if(pending.length){const next=Math.min(...pending.map(o=>Date.parse(o.nextAttemptAt)));timer=setTimeout(()=>void sync(),Math.min(2147483647,Math.max(1000,next-now())));}
 }
 function failed(s,op,error,field){
  trace('failed',op,{code:error.code||error.kind||'unknown',status:error.status,...(field?{operation:field==='subscriptionChange'?'subscription-update':'device-disable'}:{})});
  if(error.status===401||error.code==='DEVICE_NOT_FOUND'||error.code==='DEVICE_UNAUTHORIZED'){
   save(emptyNotifications());tell('通知の設定が無効になりました。「この端末で通知を使う」から再設定してください。');return;
  }
  if(error.code==='REMINDER_NOT_FOUND'&&!field){
   if(op.operation==='cancel')save(acknowledge(s,op));
   else {
    s.outbox=s.outbox.filter(o=>o.id!==op.id);s.maps=s.maps.filter(m=>m.reminderId!==op.reminderId);
    const rebuilt=reconcile(s,readLists(),now());for(const item of rebuilt.outbox)if(!s.outbox.some(old=>old.id===item.id)){item.blocked=true;item.error='REMINDER_NOT_FOUND';}
    save(rebuilt);tell('通知予約を再構築しました。設定画面から同期を再試行してください。');
   }
   return;
  }
  if(field){
   op.attemptCount++;op.blocked=!error.retryable;op.error=error.code||error.kind||'unknown';
   op.nextAttemptAt=new Date(now()+Math.max((error.retryAfterSeconds||0)*1000,Math.min(3600000,1000*2**Math.min(op.attemptCount,12)))).toISOString();save(s);
  }else save(failOperation(s,op,error,now()));
  tell(error.retryable?'通知の同期が保留中です。通信が戻ると再試行します。':'通知の同期を停止しました。接続・期限・通知設定を確認し、再試行してください。');
 }
 async function updateSubscription(s){
  const op=s.subscriptionChange;
  try{trace('sending',{operation:'subscription-update'});await api.updateSubscription(s.device,{subscription:op.subscription},op.id);trace('accepted',{operation:'subscription-update'});s.subscription=op.subscription;delete s.subscriptionChange;save(s);}
  catch(error){failed(s,op,error,'subscriptionChange');throw error;}
 }
 async function sendPending(){
  let s=read();if(!s.device)return;
  if(s.disable){
   const op=s.disable;if(op.blocked||Date.parse(op.nextAttemptAt)>now())return;
   try{trace('sending',{operation:'device-disable'});await api.disableDevice(s.device,op.id);trace('accepted',{operation:'device-disable'});save(emptyNotifications());await device.unsubscribe();tell('この端末の通知を停止しました。');}
   catch(error){if(read().device)failed(s,op,error,'disable');else tell('通知は停止しました。ブラウザの購読解除を再確認してください。');}return;
  }
  if(s.subscriptionChange){const op=s.subscriptionChange;if(op.blocked||Date.parse(op.nextAttemptAt)>now())return;try{await updateSubscription(s);}catch{return;}}
  s=read();let subscription=null,inspectionFailed=false;
  try{subscription=await device.currentSubscription();}catch{inspectionFailed=true;/* Cancellation can still proceed. */}
  const usable=device.permission()==='granted'&&sameSubscription(subscription,s.subscription);
  awaitingSetup=!usable;
  if(!usable)trace('subscription-unavailable');
  if(!usable)tell(inspectionFailed?'ブラウザの通知状態を確認できませんでした。登録情報は保持しています。「通知の同期を再試行」で確認してください。':'通知の許可または購読を確認し、「この端末の通知設定を確認」から再設定してください。');
  let sent=0;
  while(sent++<50){
   s=read();if(!s.device)return;
   const next=reconcile(s,readLists(),now());
   if(JSON.stringify(next)!==JSON.stringify(s)){
    const added=next.outbox.filter(o=>!s.outbox.some(old=>old.id===o.id));s=save(next);
    for(const item of added){const map=s.maps.find(m=>m.reminderId===item.reminderId);trace('queued',item,{slotKey:map?.slotKey,scheduledAt:map?.scheduledAt});}
   }
   const op=s.outbox.find(o=>!o.blocked&&Date.parse(o.nextAttemptAt)<=now()&&(usable||o.operation==='cancel'));
   if(!op)break;
   try{
    trace('sending',op);
    if(op.operation==='cancel')await api.cancelReminder(s.device,op.reminderId);
    else await api.upsertReminder(s.device,op.reminderId,op.body,op.id);
    trace('accepted',op);
    save(acknowledge(s,op));
   }catch(error){failed(s,op,error);if(error.status===401||error.code==='DEVICE_NOT_FOUND')break;}
  }
  if(usable&&read().device&&!read().outbox.length)tell('通知の同期が完了しています。');
 }
 async function sync(){
  if(disposed)return;
  try{await lock(sendPending);}catch(error){trace('sync-error',{},{code:error.code||error.kind||'unknown'});tell(error.message||'通知の同期を確認してください。');}
  finally{try{schedule();}catch(error){tell(error.message);}}
 }
 async function enable(){
  // Invoke permission synchronously from the user's click, before awaiting locks or requests.
  try{
   await device.requestPermission();
   return await lock(async()=>{
   let s=read();if(s.disable)throw new Error('通知の停止処理が保留中です。同期完了後に再設定してください。');
   save(s); // Verify storage is writable before creating a server-side device.
   const {publicKey}=await api.getPublicKey();const subscription=await device.subscribe(publicKey);
   if(s.device){
    if(s.subscriptionChange||!sameSubscription(s.subscription,subscription)){
     if(!s.subscriptionChange||!sameSubscription(s.subscriptionChange.subscription,subscription))s.subscriptionChange={...lifecycleOperation(),subscription};
     save(s);await updateSubscription(s);
    }
   }else{
    const registered=await api.registerDevice({subscription});
    try{s=save({...emptyNotifications(),device:registered,subscription});}
    catch(error){try{await api.disableDevice(registered,crypto.randomUUID());await device.unsubscribe();}catch{/* Do not retry non-idempotent registration. */}throw error;}
   }
   trace('registered');tell('この端末で通知を使えます。各リストの通知をONにしてください。');return true;
  });}catch(error){tell(error.message||'通知の登録に失敗しました。もう一度お試しください。');throw error;}
  finally{try{schedule();}catch{/* Caller reports persistence failure. */}}
 }
 async function disable(){
  await lock(async()=>{const s=read();if(s.device){s.disable??=lifecycleOperation();save(s);}else await device.unsubscribe();});
  await sync();
 }
 async function retry(){
  await lock(()=>{const s=read();for(const op of [s.disable,s.subscriptionChange,...s.outbox].filter(Boolean)){op.blocked=false;op.nextAttemptAt='1970-01-01T00:00:00.000Z';}save(s);});await sync();
 }
 function status(){
  try{const s=read();return {registered:Boolean(s.device),stopping:Boolean(s.disable),pending:s.outbox.length+Number(Boolean(s.disable))+Number(Boolean(s.subscriptionChange)),message:message||(s.device?'この端末で通知を使えます。':'この端末の通知は未設定です。')};}
  catch(error){return {registered:false,pending:0,message:error.message};}
 }
 function diagnosticReport(){
  const s=read();
  const lifecycleOperations=[['subscription-update',s.subscriptionChange],['device-disable',s.disable]].filter(([,op])=>op).map(([operation,op])=>({operation,state:op.blocked?'stopped':'pending'}));
  return {recordedAt:new Date(now()).toISOString(),permission:device.permission(),registered:Boolean(s.device),pending:s.outbox.length+lifecycleOperations.length,lifecycleOperations,
   reservations:s.maps.map(m=>{const op=s.outbox.find(o=>o.reminderId===m.reminderId);return {reminderId:m.reminderId,slotKey:m.slotKey,scheduledAt:new Date(m.scheduledAt).toISOString(),state:op?(op.blocked?'stopped':'pending'):'no-pending-operation'};}),events:diagnostics.read()};
 }
 return {sync,enable,disable,retry,status,diagnosticReport,findChecklist:id=>read().maps.find(m=>m.reminderId===id)?.checklistId,dispose(){disposed=true;clearTimeout(timer);}};
}
