const VERSION='0.3.5';
const CACHE=`tempalist-shell-${VERSION}`;
const SHELL=['/','/index.html','/manifest.webmanifest','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png',
 '/update/','/update/index.html','/src/pwa.js','/src/update-page.js','/src/date-time-fields.js',
 '/src/app.js','/src/card-interactions.js','/src/checklist-record.js','/src/dates.js','/src/domain.js','/src/reorder.js','/src/samples.js','/src/storage.js','/src/styles.css','/src/transfer.js','/src/ui.js','/src/version.js','/src/views.js',
 '/src/notification/api.js','/src/notification/queue.js','/src/notification/runtime.js','/src/notification/device.js'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const notifications={
 deadline_advance:{body:'期限が近いチェックリストがあります',tagPrefix:'tempalist-advance'},
 deadline_imminent:{body:'まもなく期限のチェックリストがあります',tagPrefix:'tempalist-imminent'},
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
self.addEventListener('message',event=>{if(event.data?.type==='tempalist:activate-update')self.skipWaiting();});
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
 event.waitUntil(self.registration.showNotification(valid?'!=テンパリスト':'通知',{
  body:definition?.body??'アプリを開いて確認してください。',icon:'/assets/icon-192.png',
  ...(valid?{tag:`${definition.tagPrefix}-${value.groupId}`}:{tag:'tempalist-fallback'}),
  data:valid?{reminderId:value.reminderId,routeKey:'list'}:{},
 }));
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
