const VERSION='0.4.4';
const CACHE=`tempalist-shell-${VERSION}`;
const SHELL=['/','/index.html','/manifest.webmanifest','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png',
 '/update/','/update/index.html','/src/pwa.js','/src/update-page.js','/src/date-time-fields.js','/src/checklist-link.js',
 '/src/app.js','/src/card-interactions.js','/src/checklist-record.js','/src/dates.js','/src/domain.js','/src/reorder.js','/src/samples.js','/src/storage.js','/src/styles.css','/src/transfer.js','/src/ui.js','/src/version.js','/src/views.js',
 '/src/notification/browser-diagnostics.js','/src/notification/diagnostics.js','/src/notification/api.js','/src/notification/queue.js','/src/notification/runtime.js','/src/notification/device.js'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPTS='tempalist-push-diagnostics-v1',RECEIPT_PATH='/__tempalist_push_diagnostics__';
let receiptTail=Promise.resolve();
function cleanReceipt(value){
 if(!value||!['push-received','display-accepted','display-failed'].includes(value.event)||!['push','local-test'].includes(value.source)||typeof value.at!=='string'||!Number.isFinite(Date.parse(value.at)))return null;
 const entry={at:new Date(value.at).toISOString(),event:value.event,source:value.source};
 if(typeof value.version==='string'&&/^\d+\.\d+\.\d+$/.test(value.version))entry.version=value.version;
 if(typeof value.reminderId==='string'&&UUID.test(value.reminderId))entry.reminderId=value.reminderId;
 if(typeof value.validPayload==='boolean')entry.validPayload=value.validPayload;
 if(['TypeError','NotAllowedError','InvalidStateError','SecurityError','AbortError','unknown'].includes(value.errorName))entry.errorName=value.errorName;
 return entry;
}
async function readReceipts(){
 if(!await caches.has(RECEIPTS))return [];
 const response=await (await caches.open(RECEIPTS)).match(RECEIPT_PATH);
 const data=response?await response.json():[];return Array.isArray(data)?data.map(cleanReceipt).filter(Boolean).slice(-100):[];
}
function recordReceipt(event,details){
 const entry=cleanReceipt({...details,event,at:new Date().toISOString(),version:VERSION});
 const task=receiptTail.then(async()=>{
  const entries=[...await readReceipts(),entry].filter(Boolean).slice(-100);
  await (await caches.open(RECEIPTS)).put(RECEIPT_PATH,new Response(JSON.stringify(entries),{headers:{'Content-Type':'application/json'}}));
 });
 receiptTail=task.catch(()=>{});return receiptTail;
}
async function displayNotification(title,options,details){
 try{await self.registration.showNotification(title,options);await recordReceipt('display-accepted',details);return {displayRequest:'accepted'};}
 catch(error){const errorName=['TypeError','NotAllowedError','InvalidStateError','SecurityError','AbortError'].includes(error?.name)?error.name:'unknown';await recordReceipt('display-failed',{...details,errorName});if(details.source==='push')throw error;return {displayRequest:'failed',errorName};}
}
const notifications={
 deadline_advance:{body:'期限が近いチェックリストがあります',tagPrefix:'tempalist-advance'},
 deadline_imminent:{body:'期限を確認するチェックリストがあります',tagPrefix:'tempalist-imminent'},
};
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function validClick(value){return object(value)&&Object.keys(value).length===2&&value.routeKey==='list'&&typeof value.reminderId==='string'&&UUID.test(value.reminderId);}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 // SW script updates bypass HTTP cache; its app files must do the same.
 await cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})));
 const version=await (await cache.match('/src/version.js')).text();
 const manifest=await (await cache.match('/manifest.webmanifest')).json();
 if(!version.includes(`APP_VERSION = '${VERSION}'`)||manifest.version!==VERSION){
  await caches.delete(CACHE);throw new Error('App files do not match the Service Worker version');
 }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('tempalist-shell-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='tempalist:activate-update')self.skipWaiting();
 if(!['tempalist:inspect-push','tempalist:test-display'].includes(event.data?.type)||!event.ports?.[0])return;
 try{if(new URL(event.source?.url).origin!==self.location.origin)return;}catch{return;}
 event.waitUntil((async()=>{
  if(event.data.type==='tempalist:test-display'){
   const result=await displayNotification('テンパリスト：表示テスト',{body:'この端末での通知表示を確認しています。',tag:'tempalist-display-test',icon:'/assets/icon-192.png',data:{}},{source:'local-test'});
   event.ports[0].postMessage({version:VERSION,...result});return;
  }
  try{await receiptTail;event.ports[0].postMessage({version:VERSION,historyAvailable:true,events:await readReceipts()});}
  catch{event.ports[0].postMessage({version:VERSION,historyAvailable:false,events:[]});}
 })());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const navigation=event.request.mode==='navigate'&&['/','/index.html','/list','/list/'].includes(url.pathname);
 if(!navigation&&!SHELL.includes(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(navigation?'/':url.pathname)||fetch(event.request);})());
});
self.addEventListener('push',event=>{
 let value;try{value=JSON.parse(event.data?.text());}catch{/* Show the generic visible fallback. */}
 const fields=['version','appId','type','reminderId','notificationKey','routeKey','groupId'];
 const valid=object(value)&&Object.keys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k))&&value.version===2&&value.appId==='tempalist'&&value.type==='reminder_due'&&typeof value.reminderId==='string'&&UUID.test(value.reminderId)&&Object.hasOwn(notifications,value.notificationKey)&&value.routeKey==='list'&&typeof value.groupId==='string'&&/^[0-9a-f]{16}$/.test(value.groupId);
 const definition=valid?notifications[value.notificationKey]:null;
 const details={source:'push',validPayload:valid,...(valid?{reminderId:value.reminderId}:{})};
 const received=recordReceipt('push-received',details);
 // Display immediately; diagnostics are best effort and never gate the display request.
 const display=displayNotification(valid?'!=テンパリスト':'通知',{
  body:definition?.body??'アプリを開いて確認してください。',icon:'/assets/icon-192.png',
  ...(valid?{tag:`${definition.tagPrefix}-${value.groupId}`}:{tag:'tempalist-fallback'}),
  data:valid?{reminderId:value.reminderId,routeKey:'list'}:{},
 },details);
 event.waitUntil(Promise.all([received,display]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const data=event.notification.data;const id=validClick(data)?data.reminderId:null;
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){
   let url;try{url=new URL(client.url);}catch{continue;}
   if(url.origin!==self.location.origin||!['/','/index.html','/list','/list/'].includes(url.pathname))continue;
   try{client.postMessage({type:'tempalist:notification-click',reminderId:id});await client.focus();return;}catch{/* The client may have closed after matchAll. Try another window. */}
  }
  await self.clients.openWindow(self.location.origin+(id?`/list/?reminderId=${id}`:'/'));
 })());
});
