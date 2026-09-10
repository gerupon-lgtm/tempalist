export function notificationSupport(env=globalThis){
 const nav=env.navigator;
 const ios=/iPad|iPhone|iPod/.test(nav?.userAgent||'')||(/Macintosh/.test(nav?.userAgent||'')&&nav.maxTouchPoints>1);
 if(ios&&!nav.standalone&&!env.matchMedia?.('(display-mode: standalone)').matches)return '通知を使うには、共有メニューからホーム画面に追加し、そのアイコンから開いてください。';
 if(!env.isSecureContext||!nav?.serviceWorker||!env.Notification||!env.PushManager||!nav.locks)return 'このブラウザは通知機能に対応していません。対応するブラウザで開いてください。';
 return '';
}
export function createBrowserDevice(env=globalThis){
 function subscriptionData(subscription){
  const value=subscription.toJSON();
  // WebKit can omit a null expirationTime from toJSON; the v2 contract requires it.
  // Use the same shape when registering and when checking a saved subscription.
  return {endpoint:value.endpoint,expirationTime:value.expirationTime??subscription.expirationTime??null,keys:value.keys};
 }
 async function ready(){
  let timer;try{return await Promise.race([env.navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('通知の準備に時間がかかっています。画面を再読み込みしてください。')),15000);})]);}finally{clearTimeout(timer);}
 }
 async function requestPermission(){
  const unsupported=notificationSupport(env);if(unsupported)throw new Error(unsupported);
  const permission=env.Notification.permission==='default'?await env.Notification.requestPermission():env.Notification.permission;
  if(permission!=='granted')throw new Error('通知が許可されていません。ブラウザのサイト設定から通知を許可してください。');
 }
 async function subscribe(publicKey){
  const registration=await ready();let timer;
  const attempt=async()=>{
   try{
    let sub=await registration.pushManager.getSubscription();
    const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-publicKey.length%4)%4)),c=>c.charCodeAt(0));
    if(sub?.options?.applicationServerKey){const current=new Uint8Array(sub.options.applicationServerKey);if(current.length!==key.length||current.some((b,i)=>b!==key[i])){await sub.unsubscribe();sub=null;}}
    sub??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    return subscriptionData(sub);
   }catch{throw new Error('通知サービスに登録できませんでした。通信状態とブラウザの通知設定を確認して、もう一度お試しください。');}
  };
  try{return await Promise.race([attempt(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('通知サービスへの登録に時間がかかっています。通信状態を確認して、もう一度お試しください。')),20000);})]);}
  finally{clearTimeout(timer);}
 }
 return {
  requestPermission,subscribe,permission:()=>env.Notification?.permission??'denied',
  async currentSubscription(){if(!env.navigator?.serviceWorker)return null;const sub=await (await ready()).pushManager.getSubscription();return sub?subscriptionData(sub):null;},
  async unsubscribe(){const sub=await (await ready()).pushManager.getSubscription();if(sub&&await sub.unsubscribe()===false)throw new Error('購読の解除を確認できませんでした。');},
 };
}
