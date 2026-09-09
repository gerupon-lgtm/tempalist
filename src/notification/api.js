export const API_ORIGIN='https://api.atoqueue.sikumilab.com';
const PUBLIC_KEY_URL=`${API_ORIGIN}/v2/apps/tempalist/push/public-key`;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const messages={
  APP_NOT_FOUND:'通知基盤へのアプリ登録が必要です。',
  APP_ORIGIN_FORBIDDEN:'この画面のURLから通知基盤への接続が許可されていません。',
};
export class NotificationApiError extends Error {
  constructor(message,details){super(message);this.name='NotificationApiError';Object.assign(this,details);}
}
function protocolError(){return new NotificationApiError('通知基盤からの応答を確認できませんでした。',{kind:'protocol',retryable:false});}
function validKey(value){
  if(typeof value!=='string'||!/^B[A-Za-z0-9_-]{86}$/.test(value))return false;
  try{const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'=');return bytes.length===65&&bytes.charCodeAt(0)===4;}catch{return false;}
}
// Only anonymous public-key retrieval is enabled until the app registry is ready.
// All notification API traffic belongs here; business data is never an argument.
export function createNotificationApi({fetch:send=globalThis.fetch,timeoutMs=10000}={}){
  return {async getPublicKey(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      let response;
      try{response=await send(PUBLIC_KEY_URL,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});}
      catch{throw new NotificationApiError('通知基盤に接続できません。通信状態と接続許可を確認してください。',{kind:'network',retryable:true});}
      if(!response.ok){
        let body;try{body=await response.json();}catch{/* Status still describes an HTTP error. */}
        const code=isObject(body)&&isObject(body.error)&&Object.hasOwn(messages,body.error.code)?body.error.code:undefined;
        throw new NotificationApiError(messages[code]??'通知基盤との接続を確認できませんでした。',{kind:'http',status:response.status,code,retryable:[429,500,503].includes(response.status)});
      }
      if(response.status!==200)throw protocolError();
      let value;try{value=await response.json();}catch{throw protocolError();}
      if(!isObject(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'publicKey')||!validKey(value.publicKey))throw protocolError();
      return {publicKey:value.publicKey};
    }finally{clearTimeout(timer);}
  }};
}
