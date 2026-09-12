import {isUuid} from './api.js';
export const NOTIFICATION_STORAGE_KEY='tempalist:notification';
export const emptyNotifications=()=>({schemaVersion:1,device:null,maps:[],outbox:[],disable:null,subscription:null});
export const notificationKey=offset=>Math.abs(offset)<=7200000?'deadline_imminent':'deadline_advance';
const offsets={'-24h':-86400000,'-1h':-3600000,'0h':0};
const copy=value=>JSON.parse(JSON.stringify(value));
const operation=(kind,id,body,now)=>({id:crypto.randomUUID(),operation:kind,reminderId:id,...(body?{body}:{}),attemptCount:0,nextAttemptAt:new Date(now).toISOString(),blocked:false});
function putOperation(state,kind,id,body,now){
 const existing=state.outbox.find(o=>o.reminderId===id);
 if(existing?.operation===kind&&JSON.stringify(existing.body)===JSON.stringify(body))return;
 state.outbox=state.outbox.filter(o=>o.reminderId!==id);
 state.outbox.push(operation(kind,id,body,now));
}
export function reconcile(snapshot,lists,now=Date.now()){
 const state=copy(snapshot);if(!state.device||state.disable)return state;
 const wanted=new Set();
 for(const list of lists){
  if(!list.notificationEnabled||list.status!=='active'||!list.dueAt)continue;
  for(const slot of list.offsets){
   if(!Object.hasOwn(offsets,slot))continue;
   const scheduledAt=new Date(Date.parse(list.dueAt)+offsets[slot]).toISOString();
   let map=state.maps.find(m=>m.checklistId===list.id&&m.slotKey===slot);
   const pending=map&&state.outbox.find(o=>o.reminderId===map.reminderId);
   if(Date.parse(scheduledAt)<=now){
    // Acknowledged past slots remain for notification-click resolution, without rescheduling.
    if(map&&map.scheduledAt===scheduledAt&&!pending)wanted.add(map.reminderId);
    continue;
   }
   if(!map){map={reminderId:crypto.randomUUID(),checklistId:list.id,slotKey:slot,scheduledAt:null};state.maps.push(map);}
   wanted.add(map.reminderId);
   if(map.scheduledAt!==scheduledAt||pending?.operation==='cancel'){
    map.scheduledAt=scheduledAt;
    putOperation(state,'upsert',map.reminderId,{deviceId:state.device.deviceId,scheduledAt,notificationKey:notificationKey(offsets[slot]),routeKey:'list'},now);
   }
  }
 }
 for(const map of state.maps)if(!wanted.has(map.reminderId))putOperation(state,'cancel',map.reminderId,undefined,now);
 return state;
}
export function acknowledge(snapshot,op){
 const state=copy(snapshot);state.outbox=state.outbox.filter(o=>o.id!==op.id);
 if(op.operation==='cancel')state.maps=state.maps.filter(m=>m.reminderId!==op.reminderId);
 return state;
}
export function failOperation(snapshot,op,error,now=Date.now()){
 const state=copy(snapshot),item=state.outbox.find(o=>o.id===op.id);if(!item)return state;
 item.attemptCount++;item.blocked=!error.retryable;
 item.nextAttemptAt=new Date(now+Math.max((error.retryAfterSeconds||0)*1000,Math.min(3600000,1000*2**Math.min(item.attemptCount,12)))).toISOString();
 item.error=error.code||error.kind||'unknown';
 return state;
}
export function readNotifications(storage){
 try{
  const raw=storage.getItem(NOTIFICATION_STORAGE_KEY);if(raw===null)return emptyNotifications();
  const s=JSON.parse(raw);
  if(s?.schemaVersion!==1||!Array.isArray(s.maps)||!Array.isArray(s.outbox)||!Object.hasOwn(s,'device')||!Object.hasOwn(s,'disable'))throw new Error();
  if(s.device!==null&&(!isUuid(s.device.deviceId)||typeof s.device.deviceSecret!=='string'||!s.device.deviceSecret||s.device.appId!=='tempalist'||s.device.protocolVersion!==2))throw new Error();
  if(s.maps.some(m=>!isUuid(m.reminderId)||!isUuid(m.checklistId)||!Object.hasOwn(offsets,m.slotKey)||!Number.isFinite(Date.parse(m.scheduledAt))))throw new Error();
  if(new Set(s.maps.map(m=>m.reminderId)).size!==s.maps.length||new Set(s.maps.map(m=>`${m.checklistId}/${m.slotKey}`)).size!==s.maps.length)throw new Error();
  if(s.outbox.some(o=>!isUuid(o.id)||!isUuid(o.reminderId)||!['upsert','cancel'].includes(o.operation)||!Number.isFinite(Date.parse(o.nextAttemptAt))||!Number.isInteger(o.attemptCount)||typeof o.blocked!=='boolean'||!s.maps.some(m=>m.reminderId===o.reminderId)))throw new Error();
  if(s.disable!==null&&(!isUuid(s.disable.id)||!Number.isFinite(Date.parse(s.disable.nextAttemptAt))||typeof s.disable.blocked!=='boolean'))throw new Error();
  return s;
 }catch{throw new Error('通知の保存データを読み込めません。チェックリストは引き続き利用できます。');}
}
export function saveNotifications(storage,state){
 try{storage.setItem(NOTIFICATION_STORAGE_KEY,JSON.stringify(state));}
 catch{throw new Error('通知設定を保存できません。空き容量を確認してください。チェックリストの保存結果は変更していません。');}
}
