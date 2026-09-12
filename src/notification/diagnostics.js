import {isUuid} from './api.js';
import {APP_VERSION} from '../version.js';
const KEY='tempalist:notification-diagnostics';
const LIMIT=100;
const events=new Set(['queued','sending','accepted','failed','subscription-unavailable','registered','sync-error']);
const codes=new Set(['network','protocol','validation','http','unknown','APP_NOT_FOUND','APP_ORIGIN_FORBIDDEN','DEVICE_NOT_FOUND','DEVICE_UNAUTHORIZED','REMINDER_NOT_FOUND','INVALID_SCHEDULE','RATE_LIMITED','INTERNAL_ERROR','PUSH_UNAVAILABLE']);
const iso=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value)&&Number.isFinite(Date.parse(value));
function safe(value){
 if(!value||!events.has(value.event)||!iso(value.at))return null;
 const out={at:value.at,event:value.event};
 if(typeof value.version==='string'&&/^\d+\.\d+\.\d+$/.test(value.version))out.version=value.version;
 if(isUuid(value.reminderId))out.reminderId=value.reminderId;
 if(['upsert','cancel','subscription-update','device-disable'].includes(value.operation))out.operation=value.operation;
 if(['-24h','-1h','0h'].includes(value.slotKey))out.slotKey=value.slotKey;
 if(iso(value.scheduledAt))out.scheduledAt=value.scheduledAt;
 if(value.code!==undefined)out.code=codes.has(value.code)?value.code:'unknown';
 if(Number.isInteger(value.status)&&value.status>=100&&value.status<=599)out.status=value.status;
 return out;
}
// An allowlist is used on both write and read. Never export raw storage or errors.
export function createNotificationDiagnostics(storage,now=Date.now){
 function read(){
  try{const value=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(value)?value.map(safe).filter(Boolean).slice(-LIMIT):[];}catch{return [];}
 }
 function record(event,details={}){
  try{const entry=safe({...details,event,at:new Date(now()).toISOString(),version:APP_VERSION});if(entry)storage.setItem(KEY,JSON.stringify([...read(),entry].slice(-LIMIT)));}catch{/* Diagnostics must never interrupt saving or notification work. */}
 }
 return {read,record};
}
