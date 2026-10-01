// @vitest-environment node
import {it,expect} from 'vitest';
import * as model from '../src/allocation-domain.js';
import * as domain from '../src/domain.js';
import * as management from '../src/management-domain.js';
import {notificationSources} from '../src/expiry.js';
import {exportBackup,parseTransfer,importBackup} from '../src/transfer.js';
function fixture(quantity=10){return model.createAllocationList(domain.emptyState(),{name:'ソフトウェアA',quantity});}
const list=state=>state.allocationLists[0];
const assign=(state,slot,assignee)=>model.assignAllocation(state,list(state).id,slot,assignee,list(state).revision);
it('creates quantity-based vacant slots with current counts and no per-slot setup',()=>{
 const state=fixture();expect(state.schemaVersion).toBe(4);expect(model.allocationCounts(list(state))).toEqual({total:10,used:0,available:10});expect(list(state).assignments).toEqual([]);expect(domain.validateState(state)).toEqual(state);
 expect(list(fixture(0)).quantity).toBe(0);expect(list(fixture(1_000_000)).assignments).toHaveLength(0);
});
it('requires an assignee, derives used counts and clears identity on release without history',()=>{
 let state=fixture();for(let slot=1;slot<=8;slot++)state=assign(state,slot,` 担当${slot} `);
 expect(model.allocationCounts(list(state))).toEqual({total:10,used:8,available:2});expect(list(state).assignments[0].assignee).toBe('担当1');
 expect(()=>assign(state,9,'  ')).toThrow('割り当て先');expect(()=>assign(state,1,'別担当')).toThrow('使用中');
 state=model.releaseAllocation(state,list(state).id,1,list(state).revision);
 expect(JSON.stringify(state)).not.toContain('担当1');expect(model.allocationCounts(list(state)).available).toBe(3);
 state=assign(state,1,'営業部PC');expect(list(state).assignments.find(a=>a.slot===1).assignee).toBe('営業部PC');
});
it('increases capacity and removes vacant slots on shrink while retaining every assignee',()=>{
 let state=assign(assign(fixture(),2,'田中'),10,'共用PC');const id=list(state).id;
 state=model.updateAllocationList(state,id,{name:'変更後',quantity:12},list(state).revision);expect(list(state).assignments.map(a=>a.slot)).toEqual([2,10]);
 state=model.updateAllocationList(state,id,{name:'変更後',quantity:2},list(state).revision);expect(list(state).assignments).toEqual([{slot:1,assignee:'共用PC'},{slot:2,assignee:'田中'}]);
 expect(()=>model.updateAllocationList(state,id,{name:'変更後',quantity:1},list(state).revision)).toThrow('先に使用を解除');expect(list(state).quantity).toBe(2);
});
it('rejects stale edits, release, delete and ABA reuse after another tab changes a slot',()=>{
 let state=fixture();const id=list(state).id,old=list(state).revision;state=assign(state,1,'A');
 for(const action of [()=>model.assignAllocation(state,id,2,'B',old),()=>model.releaseAllocation(state,id,1,old),()=>model.updateAllocationList(state,id,{name:'古い画面',quantity:0},old),()=>model.deleteAllocationList(state,id,old)])expect(action).toThrow('別の画面');
 const assignedRevision=list(state).revision;state=model.releaseAllocation(state,id,1,assignedRevision);state=assign(state,1,'B');expect(()=>model.releaseAllocation(state,id,1,assignedRevision)).toThrow();expect(list(state).assignments[0].assignee).toBe('B');
});
it('validates whole backup structure and quantity without creating unbounded arrays',()=>{
 for(const quantity of [-1,1.2,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'10'])expect(()=>fixture(quantity)).toThrow('保有数');
 expect(list(fixture(Number.MAX_SAFE_INTEGER)).assignments).toEqual([]);
 const state=fixture(),entry=list(state);for(const assignments of [[{slot:0,assignee:'A'}],[{slot:11,assignee:'A'}],[{slot:1,assignee:''}],[{slot:1,assignee:'A'},{slot:1,assignee:'B'}]])expect(()=>domain.validateState({...state,allocationLists:[{...entry,assignments}]})).toThrow();
 expect(()=>domain.validateState({...state,allocationLists:[{...entry,id:[entry.id]}]})).toThrow();
 expect(()=>domain.validateState({...state,schemaVersion:3})).toThrow();expect(()=>parseTransfer(JSON.stringify({...state,schemaVersion:5}))).toThrow();
});
it('backs up current assignments, imports separately and preserves destination settings and existing data',()=>{
 const original=assign(fixture(),3,'田中');const parsed=parseTransfer(exportBackup(original));const copied=importBackup(original,parsed);
 expect(copied.allocationLists).toHaveLength(2);expect(copied.allocationLists[1].id).not.toBe(list(original).id);expect(copied.allocationLists[1].assignments).toEqual([{slot:3,assignee:'田中'}]);expect(copied.settings).toEqual(original.settings);
 expect(importBackup(copied,domain.emptyState()).allocationLists).toEqual(copied.allocationLists);expect(domain.validateState(copied)).toEqual(copied);
 const legacy=importBackup(domain.emptyState(),parsed);expect(legacy.schemaVersion).toBe(4);expect(legacy.allocationLists).toHaveLength(1);
});
it('retains allocation format and assignments through ordinary and expiry management operations',()=>{
 let state=assign(fixture(),1,'A');const expected=list(state);
 state=domain.createTemplate(state,{name:'食品',items:[{label:'パン'}]});state=domain.createChecklist(state,{title:'通常'});
 state=management.createManagementList(state,{name:'食品',sourceTemplateId:state.templates[0].id});const supplies=state.managementLists[0];
 state=management.updateManagementList(state,supplies.id,{notificationEnabled:true});state=management.saveManagementItem(state,supplies.id,supplies.items[0].id,{label:'パン',note:'',expiryDate:'2026-10-20'},0);
 expect(state.schemaVersion).toBe(4);expect(list(state)).toEqual(expected);expect(domain.validateState(state)).toEqual(state);
 expect(notificationSources(state,'Asia/Tokyo').some(source=>source.id===expected.id)).toBe(false);expect(management.actionItems(state)).toEqual([]);
});
it('deletes only the requested allocation and preserves regular lists and management data',()=>{
 let state=fixture();state=domain.createChecklist(state,{title:'残す'});const before=state.checklists;
 state=model.deleteAllocationList(state,list(state).id,list(state).revision);expect(state.allocationLists).toEqual([]);expect(state.checklists).toEqual(before);expect(state.schemaVersion).toBe(4);
});
