export const API_ORIGIN='https://api.atoqueue.sikumilab.com';
const PUBLIC_KEY_URL=`${API_ORIGIN}/v2/apps/tempalist/push/public-key`;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const messages={
  APP_NOT_FOUND:'通知基盤へのアプリ登録が必要です。',
  APP_ORIGIN_FORBIDDEN:'この画面のURLから通知基盤への接続が許可されていません。',
  DEVICE_UNAUTHORIZED:'通知の設定が無効になりました。再設定してください。',
  DEVICE_NOT_FOUND:'通知の設定が無効になりました。再設定してください。',
  REMINDER_NOT_FOUND:'通知予約を再設定する必要があります。',
  INVALID_SCHEDULE:'通知の時刻が過去になりました。期限を確認してください。',
  RATE_LIMITED:'通知の同期を待っています。',
  INTERNAL_ERROR:'通知の登録が保留中です。',
  PUSH_UNAVAILABLE:'通知の登録が保留中です。',
};
export class NotificationApiError extends Error {
  constructor(message,details){super(message);this.name='NotificationApiError';Object.assign(this,details);}
}
function protocolError(){return new NotificationApiError('通知基盤からの応答を確認できませんでした。',{kind:'protocol',retryable:false});}
function validKey(value){
  if(typeof value!=='string'||!/^B[A-Za-z0-9_-]{86}$/.test(value))return false;
  try{const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'=');return bytes.length===65&&bytes.charCodeAt(0)===4;}catch{return false;}
}
export const isUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const utc=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const exact=(value,keys)=>isObject(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function validate(ok){if(!ok)throw new NotificationApiError('通知の送信内容を確認してください。',{kind:'validation',retryable:false});}
function credentialsValid(value){validate(isObject(value)&&isUuid(value.deviceId)&&typeof value.deviceSecret==='string'&&/^[\x21-\x7e]+$/.test(value.deviceSecret));}
function subscriptionValid(value){
 validate(exact(value,['subscription']));const s=value.subscription;
 validate(exact(s,['endpoint','expirationTime','keys'])&&typeof s.endpoint==='string'&&exact(s.keys,['p256dh','auth']));
 let url;try{url=new URL(s.endpoint);}catch{validate(false);}
 validate(url.protocol==='https:'&&!url.username&&!url.password&&(s.expirationTime===null||Number.isFinite(s.expirationTime))&&validKey(s.keys.p256dh)&&typeof s.keys.auth==='string'&&/^[A-Za-z0-9_-]{22}$/.test(s.keys.auth));
}
// All notification API traffic belongs here. Requests accept anonymous fields only.
export function createNotificationApi({fetch:send=globalThis.fetch,timeoutMs=10000}={}){
  async function request(path,{method='GET',credentials,body,key,statuses=[200],check}={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      let response;
      const headers={Accept:'application/json'};
      if(credentials){credentialsValid(credentials);headers.Authorization=`Bearer ${credentials.deviceSecret}`;}
      if(key!==undefined){validate(isUuid(key));headers['Idempotency-Key']=key;}
      if(body!==undefined)headers['Content-Type']='application/json';
      try{response=await send(path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});}
      catch{throw new NotificationApiError('通知基盤に接続できません。通信状態と接続許可を確認してください。',{kind:'network',retryable:true});}
      if(!response.ok){
        let body;try{body=await response.json();}catch{/* Status still describes an HTTP error. */}
        const code=isObject(body)&&isObject(body.error)&&Object.hasOwn(messages,body.error.code)?body.error.code:undefined;
        const retry=response.headers?.get('Retry-After');
        const retryAfterSeconds=retry===null||retry===undefined?0:/^\d+$/.test(retry)?Number(retry):Math.max(0,Math.ceil((Date.parse(retry)-Date.now())/1000))||0;
        throw new NotificationApiError(messages[code]??'通知基盤との接続を確認できませんでした。',{kind:'http',status:response.status,code,retryable:[429,500,503].includes(response.status),retryAfterSeconds});
      }
      if(!statuses.includes(response.status))throw protocolError();
      if(response.status===204)return;
      let value;try{value=await response.json();}catch{throw protocolError();}
      if(!check(value))throw protocolError();
      return value;
    }finally{clearTimeout(timer);}
  }
  const base=`${API_ORIGIN}/v2/apps/tempalist`;
  return {
    getPublicKey:()=>request(PUBLIC_KEY_URL,{check:value=>exact(value,['publicKey'])&&validKey(value.publicKey)}),
    async registerDevice(body){subscriptionValid(body);return request(`${base}/devices`,{method:'POST',body,statuses:[201],check:v=>exact(v,['appId','deviceId','deviceSecret','protocolVersion','createdAt'])&&v.appId==='tempalist'&&v.protocolVersion===2&&isUuid(v.deviceId)&&typeof v.deviceSecret==='string'&&/^[\x21-\x7e]+$/.test(v.deviceSecret)&&utc(v.createdAt)});},
    async updateSubscription(credentials,body,key){credentialsValid(credentials);subscriptionValid(body);validate(isUuid(key));return request(`${base}/devices/${credentials.deviceId}/subscription`,{method:'PUT',credentials,body,key,check:v=>exact(v,['appId','deviceId','status','updatedAt'])&&v.appId==='tempalist'&&v.deviceId===credentials.deviceId&&v.status==='active'&&utc(v.updatedAt)});},
    async disableDevice(credentials,key){credentialsValid(credentials);validate(isUuid(key));return request(`${base}/devices/${credentials.deviceId}`,{method:'DELETE',credentials,key,statuses:[204]});},
    async upsertReminder(credentials,id,body,key){
      credentialsValid(credentials);validate(isUuid(id)&&isUuid(key)&&exact(body,['deviceId','scheduledAt','notificationKey','routeKey']));
      validate(body.deviceId===credentials.deviceId&&utc(body.scheduledAt)&&['deadline_advance','deadline_imminent'].includes(body.notificationKey)&&body.routeKey==='list');
      return request(`${base}/reminders/${id}`,{method:'PUT',credentials,body,key,statuses:[200,201],check:v=>exact(v,['reminderId','status','scheduledAt','repeatCadence','updatedAt'])&&v.reminderId===id&&v.status==='pending'&&utc(v.scheduledAt)&&v.repeatCadence===null&&utc(v.updatedAt)});
    },
    async cancelReminder(credentials,id){credentialsValid(credentials);validate(isUuid(id));return request(`${base}/reminders/${id}?deviceId=${credentials.deviceId}`,{method:'DELETE',credentials,statuses:[204]});},
  };
}
