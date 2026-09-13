// @vitest-environment node
import {it,expect} from 'vitest';
import * as domain from '../src/domain.js';
import * as management from '../src/management-domain.js';
import {expiryDate,expiryTime,notificationSources} from '../src/expiry.js';
import {emptyNotifications,reconcile,acknowledge,readNotifications,saveNotifications} from '../src/notification/queue.js';
import {exportBackup,parseTransfer,importBackup} from '../src/transfer.js';
const now=Date.parse('2026-09-14T00:00:00Z');
function fixture(){
 let state=domain.createTemplate(domain.emptyState(),{name:'食品',items:[{label:'食パン'},{label:'ペットシート'}]});
 state=management.createManagementList(state,{name:'日常',sourceTemplateId:state.templates[0].id});
 const list=state.managementLists[0],item=list.items[0];
 state=management.saveManagementItem(state,list.id,item.id,{label:item.label,note:'',expiryDate:'2026/09/20'},item.revision);
 state=management.updateManagementList(state,list.id,{notificationEnabled:true});
 return {state,listId:list.id,itemId:item.id};
}
const itemOf=(state)=>state.managementLists[0].items[0];
function queue(){return {...emptyNotifications(),device:{deviceId:crypto.randomUUID(),deviceSecret:'test',appId:'tempalist',protocolVersion:2}};}
function accepted(state){for(const op of [...state.outbox])state=acknowledge(state,op);return state;}
it('validates optional calendar dates and common times',()=>{
 expect(expiryDate('')).toBe(null);expect(expiryDate('2026/09/20')).toBe('2026-09-20');
 for(const bad of ['2026-02-29','2026-09-31','2026-9-20','09/20'])expect(()=>expiryDate(bad)).toThrow();
 expect(expiryTime('09:00')).toBe('09:00');for(const bad of ['24:00','9:00','12:60',''])expect(()=>expiryTime(bad)).toThrow();
});
it('plans only dated unconsumed items in enabled lists at the previous and same local day',()=>{
 const {state,listId}=fixture();expect(state.schemaVersion).toBe(3);expect(domain.validateState(state)).toEqual(state);
 const sources=notificationSources(state,'Asia/Tokyo');expect(sources).toHaveLength(1);
 expect(sources[0].scheduledSlots).toEqual({'-24h':'2026-09-19T00:00:00.000Z','0h':'2026-09-20T00:00:00.000Z'});
 const off=management.updateManagementList(state,listId,{notificationEnabled:false});expect(notificationSources(off)).toHaveLength(0);expect(itemOf(off).expiryDate).toBe('2026-09-20');
});
it('uses calendar days across daylight saving and moves a nonexistent time to the next valid minute',()=>{
 const {state}=fixture();itemOf(state).expiryDate='2026-03-08';
 let source=notificationSources(state,'America/New_York')[0];expect(source.scheduledSlots).toEqual({'-24h':'2026-03-07T14:00:00.000Z','0h':'2026-03-08T13:00:00.000Z'});
 state.settings.expiryNotificationTime='02:30';source=notificationSources(state,'America/New_York')[0];expect(source.scheduledSlots['0h']).toBe('2026-03-08T07:00:00.000Z');
});
it('cancels consumed items, clears expiry on purchase and restores expiry on undo without notifying consumed stock',()=>{
 let {state,listId,itemId}=fixture();let q=accepted(reconcile(queue(),notificationSources(state,'Asia/Tokyo'),now));
 state=management.setNeedsAction(state,listId,itemId,true,itemOf(state).revision);expect(itemOf(state).expiryDate).toBe('2026-09-20');
 expect(reconcile(q,notificationSources(state,'Asia/Tokyo'),now).outbox.map(o=>o.operation)).toEqual(['cancel','cancel']);
 const result=management.completeManagementItem(state,listId,itemId,itemOf(state).revision);expect(itemOf(result.state).expiryDate).toBeNull();expect(itemOf(result.state).lastCompletedAt).not.toBeNull();
 state=management.undoManagementCompletion(result.state,result.undo);expect(itemOf(state).expiryDate).toBe('2026-09-20');expect(itemOf(state).needsAction).toBe(true);expect(notificationSources(state)).toHaveLength(0);
 state=management.setNeedsAction(state,listId,itemId,false,itemOf(state).revision);expect(notificationSources(state)).toHaveLength(1);
});
it('retains reminder IDs on common-time edits, cancels cleared/deleted items and never backfills past notifications',()=>{
 let {state,listId,itemId}=fixture();let q=accepted(reconcile(queue(),notificationSources(state,'Asia/Tokyo'),now));const ids=q.maps.map(m=>m.reminderId);
 state.settings.expiryNotificationTime='10:30';q=reconcile(q,notificationSources(state,'Asia/Tokyo'),now);expect(q.maps.map(m=>m.reminderId)).toEqual(ids);expect(q.outbox.every(o=>o.body.scheduledAt.includes('T01:30'))).toBe(true);
 for(const op of q.outbox)expect(Object.keys(op.body).sort()).toEqual(['deviceId','notificationKey','routeKey','scheduledAt']);
 const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};saveNotifications(storage,q);expect(readNotifications(storage)).toEqual(q);
 expect(reconcile(queue(),notificationSources(state,'Asia/Tokyo'),Date.parse('2026-09-20T00:00Z')).outbox).toHaveLength(1);
 expect(reconcile(queue(),notificationSources(state,'Asia/Tokyo'),Date.parse('2026-09-21T00:00Z')).outbox).toHaveLength(0);
 state=management.deleteManagementItem(state,listId,itemId,itemOf(state).revision);expect(reconcile(accepted(q),notificationSources(state),now).outbox.every(o=>o.operation==='cancel')).toBe(true);
});
it('backs up expiry, imports notification OFF and preserves destination common time; older schema cannot silently drop fields',()=>{
 const {state}=fixture();state.settings.expiryNotificationTime='10:30';const parsed=parseTransfer(exportBackup(state));
 const dest={...domain.emptyState(),schemaVersion:3,managementLists:[],settings:{completedRetention:'90d',expiryNotificationTime:'08:00'}};
 const imported=importBackup(dest,parsed);expect(imported.schemaVersion).toBe(3);expect(itemOf(imported).expiryDate).toBe('2026-09-20');expect(imported.managementLists[0].notificationEnabled).toBe(false);expect(imported.settings.expiryNotificationTime).toBe('08:00');
 expect(()=>domain.validateState({...state,schemaVersion:2})).toThrow();expect(()=>parseTransfer(JSON.stringify({...parsed,schemaVersion:4}))).toThrow();
});

it('isolates a missing calendar day or year boundary without blocking other reminders',()=>{
 const {state}=fixture();
 state.checklists=[{id:crypto.randomUUID(),status:'active',notificationEnabled:true,dueAt:'2026-09-20T00:00:00.000Z',offsets:['0h']}];
 itemOf(state).expiryDate='0100-01-01';expect(()=>notificationSources(state,'Asia/Tokyo')).not.toThrow();
 expect(reconcile(queue(),notificationSources(state,'Asia/Tokyo'),now).outbox).toHaveLength(1);
 itemOf(state).expiryDate='2011-12-31';const sources=notificationSources(state,'Pacific/Apia');
 expect(sources[1].offsets).toEqual(['0h']);expect(sources[0]).toEqual(state.checklists[0]);
});
