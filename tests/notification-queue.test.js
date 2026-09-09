import {it,expect} from 'vitest';
import * as queue from '../src/notification/queue.js';
const now=Date.parse('2026-09-10T00:00:00Z');
const id='11111111-1111-4111-8111-111111111111';
const list={id,title:'private',items:[{note:'private'}],notificationEnabled:true,status:'active',dueAt:'2026-09-12T00:00:00.000Z',offsets:['-24h','-1h']};
const snapshot=()=>({...queue.emptyNotifications(),device:{deviceId:id,deviceSecret:'secret',appId:'tempalist',protocolVersion:2,createdAt:'2026-09-10T00:00:00.000Z'}});
it('creates anonymous operations and retains IDs and keys on repeated startup',()=>{
 const a=queue.reconcile(snapshot(),[list],now),b=queue.reconcile(a,[list],now+1000);
 expect(a.maps).toHaveLength(2);expect(b).toEqual(a);
 expect(a.outbox[0].body).toEqual({deviceId:id,scheduledAt:'2026-09-11T00:00:00.000Z',notificationKey:'deadline_advance',routeKey:'list'});
 expect(JSON.stringify(a.outbox)).not.toContain('private');
});
it('changes operation keys but keeps reminder identities on deadline updates',()=>{
 const a=queue.reconcile(snapshot(),[list],now);
 const b=queue.reconcile(a,[{...list,dueAt:'2026-09-13T00:00:00.000Z'}],now);
 expect(b.maps.map(m=>m.reminderId)).toEqual(a.maps.map(m=>m.reminderId));
 expect(b.outbox[0].id).not.toBe(a.outbox[0].id);
});
it.each(['off','settle','delete','offset'])('keeps mappings until cancellation succeeds on %s',reason=>{
 const a=queue.reconcile(snapshot(),[list],now);
 const lists=reason==='delete'?[]:[{...list,...(reason==='off'?{notificationEnabled:false}:reason==='settle'?{status:'settled'}:{offsets:[]})}];
 const b=queue.reconcile(a,lists,now);
 expect(b.maps).toHaveLength(2);expect(b.outbox.every(o=>o.operation==='cancel')).toBe(true);
 const c=queue.acknowledge(b,b.outbox[0]);expect(c.maps).toHaveLength(1);
});
it('does not recreate a delivered slot or enqueue a past slot',()=>{
 let a=queue.reconcile(snapshot(),[list],now);
 for(const op of a.outbox)a=queue.acknowledge(a,op);
 expect(queue.reconcile(a,[list],now+3*86400000).outbox).toEqual([]);
 expect(queue.reconcile(snapshot(),[list],now+3*86400000).maps).toEqual([]);
});
it('cancels an unsent slot that became past, instead of sending an invalid schedule',()=>{
 const a=queue.reconcile(snapshot(),[list],now);
 const b=queue.reconcile(a,[list],now+3*86400000);
 expect(b.outbox.every(o=>o.operation==='cancel')).toBe(true);
});
it('classifies the two hour boundary and does not schedule at now',()=>{
 expect(queue.notificationKey(-7200000)).toBe('deadline_imminent');
 expect(queue.notificationKey(-7200001)).toBe('deadline_advance');
 expect(queue.reconcile(snapshot(),[{...list,dueAt:'2026-09-10T01:00:00.000Z'}],now).outbox).toEqual([]);
});
it('keeps retry identity, honors retry-after, and blocks permanent errors',()=>{
 let a=queue.reconcile(snapshot(),[list],now);const op=a.outbox[0];
 a=queue.failOperation(a,op,{retryable:true,retryAfterSeconds:120},now);
 expect(a.outbox[0]).toMatchObject({id:op.id,nextAttemptAt:new Date(now+120000).toISOString(),attemptCount:1,blocked:false});
 a=queue.failOperation(a,a.outbox[0],{retryable:false},now);
 expect(a.outbox[0].blocked).toBe(true);
 expect(queue.reconcile(a,[list],now).outbox[0].blocked).toBe(true);
});
it('rejects unknown or malformed notification storage without overwriting it',()=>{
 const storage={getItem:()=>'{"schemaVersion":99}',setItem:()=>{throw new Error('must not write');}};
 expect(()=>queue.readNotifications(storage)).toThrow();
});
