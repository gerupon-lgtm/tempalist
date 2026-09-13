import {parseDeadline,getTimeZone} from './dates.js';
export function expiryDate(value){
 if(value===null||value==='')return null;
 if(typeof value!=='string')throw new Error('消費期限の日付が不正です');
 const normalized=value.replaceAll('/','-');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized))throw new Error('消費期限は年月日を入力してください');
 parseDeadline(normalized,'09:00','UTC');return normalized;
}
export function expiryTime(value){
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('通知時刻は00:00〜23:59で入力してください');
 return value;
}
export function previousDate(value){
 const [year,month,day]=expiryDate(value).split('-').map(Number);
 return new Date(Date.UTC(year,month-1,day-1)).toISOString().slice(0,10);
}
function scheduled(date,time,zone){
 try{parseDeadline(date,'09:00','UTC');}catch{return null;}
 try{return parseDeadline(date,time,zone).dueAt;}catch(error){
  // In a daylight-saving gap use the first valid minute after the selected time.
  const [hour,minute]=time.split(':').map(Number);
  for(let minutes=hour*60+minute+1;minutes<Math.min(1440,hour*60+minute+181);minutes++){
   try{return parseDeadline(date,`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,zone).dueAt;}catch{/* Continue within this calendar day. */}
  }
  return null;
 }
}
export function notificationSources(state,zone=getTimeZone()){
 const time=expiryTime(state.settings.expiryNotificationTime??'09:00');
 const cache=new Map();
 const slot=date=>{if(!cache.has(date))cache.set(date,scheduled(date,time,zone));return cache.get(date);};
 const items=(state.managementLists??[]).flatMap(list=>list.items.filter(item=>list.notificationEnabled&&item.expiryDate&&!item.needsAction).map(item=>{
  const date=expiryDate(item.expiryDate);
  const scheduledSlots=Object.fromEntries([['-24h',slot(previousDate(date))],['0h',slot(date)]].filter(([,at])=>at!==null));
  return {id:item.id,managementListId:list.id,notificationEnabled:true,status:'active',dueAt:scheduledSlots['0h']??scheduledSlots['-24h']??null,offsets:Object.keys(scheduledSlots),scheduledSlots};
 }));
 return [...state.checklists,...items];
}
