import {it,expect} from 'vitest';
import {createNotificationDiagnostics} from '../src/notification/diagnostics.js';
const at='2026-09-12T06:00:00.000Z',id='11111111-1111-4111-8111-111111111111';
const setup=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
it('only records approved diagnostic fields and keeps them after restart',()=>{
 const storage=setup(),d=createNotificationDiagnostics(storage,()=>Date.parse(at));
 d.record('failed',{reminderId:id,operation:'upsert',slotKey:'0h',scheduledAt:at,code:'network',status:503,deviceSecret:'PRIVATE',deviceId:id,subscription:{endpoint:'PRIVATE'},title:'PRIVATE',message:'PRIVATE',body:{deviceId:id}});
 const records=createNotificationDiagnostics(storage).read();
 expect(records[0]).toMatchObject({at,event:'failed',reminderId:id,operation:'upsert',slotKey:'0h',scheduledAt:at,code:'network',status:503});
 expect(JSON.stringify(records)).not.toMatch(/PRIVATE|deviceId|deviceSecret|subscription|message|body/);
});
it('limits history and sanitizes already stored records',()=>{
 const storage=setup(),d=createNotificationDiagnostics(storage,()=>Date.parse(at));
 for(let i=0;i<110;i++)d.record('accepted',{reminderId:id});
 expect(d.read()).toHaveLength(100);
 storage.setItem('tempalist:notification-diagnostics',JSON.stringify([{at,event:'failed',code:'SECRET',deviceSecret:'PRIVATE'},null,{at,event:'SECRET'}]));
 expect(d.read()).toEqual([{at,event:'failed',code:'unknown'}]);
});
it('does not interrupt application work on unavailable or full storage',()=>{
 const d=createNotificationDiagnostics({getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}});
 expect(()=>d.record('accepted')).not.toThrow();expect(d.read()).toEqual([]);
});
