export function notificationSupport(env=globalThis){
 const nav=env.navigator;
 const ios=/iPad|iPhone|iPod/.test(nav?.userAgent||'')||(/Macintosh/.test(nav?.userAgent||'')&&nav.maxTouchPoints>1);
 if(ios&&!nav.standalone&&!env.matchMedia?.('(display-mode: standalone)').matches)return '通知を使うには、共有メニューからホーム画面に追加し、そのアイコンから開いてください。';
 if(!env.isSecureContext||!nav?.serviceWorker||!env.Notification||!env.PushManager||!nav.locks)return 'このブラウザは通知機能に対応していません。対応するブラウザで開いてください。';
 return '';
}
export function createBrowserDevice(env=globalThis){
 async function ready(){
  let timer;try{return await Promise.race([env.navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('通知の準備に時間がかかっています。画面を再読み込みしてください。')),15000);})]);}finally{clearTimeout(timer);}
 }
 async function requestPermission(){
  const unsupported=notificationSupport(env);if(unsupported)throw new Error(unsupported);
  const permission=env.Notification.permission==='default'?await env.Notification.requestPermission():env.Notification.permission;
  if(permission!=='granted')throw new Error('通知が許可されていません。ブラウザのサイト設定から通知を許可してください。');
 }
 async function subscribe(publicKey){
  const registration=await ready();let sub=await registration.pushManager.getSubscription();
  const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-publicKey.length%4)%4)),c=>c.charCodeAt(0));
  if(sub?.options?.applicationServerKey){const current=new Uint8Array(sub.options.applicationServerKey);if(current.length!==key.length||current.some((b,i)=>b!==key[i])){await sub.unsubscribe();sub=null;}}
  sub??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  return sub.toJSON();
 }
 return {
  requestPermission,subscribe,permission:()=>env.Notification?.permission??'denied',
  async currentSubscription(){if(!env.navigator?.serviceWorker)return null;return (await (await ready()).pushManager.getSubscription())?.toJSON()??null;},
  async unsubscribe(){const sub=await (await ready()).pushManager.getSubscription();if(sub&&await sub.unsubscribe()===false)throw new Error('購読の解除を確認できませんでした。');},
 };
}
