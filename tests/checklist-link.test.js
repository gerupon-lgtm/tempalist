import {it,expect} from 'vitest';
import * as d from '../src/domain.js';
import {buildChecklistLink,readChecklistLink,createLinkedChecklist} from '../src/checklist-link.js';
import {exportBackup,parseTransfer,importBackup} from '../src/transfer.js';
import {createChecklistRecord} from '../src/checklist-record.js';
const now='2026-09-11T01:00:00.000Z';
const payload=()=>({schemaVersion:1,kind:'checklist-create',source:'atoqueue',requestId:'11111111-1111-4111-8111-111111111111',title:'買い物 🛒',items:[{sourceTaskId:'a',label:'牛乳',note:'2本\n冷蔵'},{sourceTaskId:'b',label:'牛乳'}]});
const rawLink=value=>'https://tempalist.sikumilab.com/#create='+Buffer.from(JSON.stringify(value)).toString('base64url');
it('round trips Unicode, newlines and ordered items using a fragment only',()=>{
 const url=buildChecklistLink(payload()),result=readChecklistLink(url);
 expect(new URL(url).search).toBe('');expect(result.items[0].note).toBe('2本\n冷蔵');
 expect(result.items[1].note).toBe('');expect(result.title).toBe('買い物 🛒');
 expect(result.items.map(i=>i.sourceTaskId)).toEqual(['a','b']);
});
it('rejects unknown versions, fields, types, duplicate source IDs and invalid encoding',()=>{
 for(const change of [{schemaVersion:2},{kind:'template'},{source:'unknown'},{requestId:'no'},{title:' '},{items:[]},{extra:1},{items:[{sourceTaskId:'a',label:'ok',checked:true}]},{items:[{sourceTaskId:'a',label:'ok',note:null}]},{items:[{sourceTaskId:'a',label:'ok'},{sourceTaskId:'a',label:'again'}]}]){
  expect(()=>readChecklistLink(rawLink({...payload(),...change}))).toThrow();
 }
 for(const suffix of ['','%%%','_w','bnVsbA','YQ'])expect(()=>readChecklistLink('https://tempalist.sikumilab.com/#create='+suffix)).toThrow();
 expect(()=>readChecklistLink('https://tempalist.sikumilab.com/#t=abc')).toThrow();
});
it('rejects oversized URLs without truncating any items',()=>{
 const data=payload();data.items[0].note='長文'.repeat(4000);
 expect(()=>buildChecklistLink(data)).toThrow('8000');expect(()=>readChecklistLink(rawLink(data))).toThrow('8000');
});
it('creates an unchecked list with new IDs and no template, deadline or notification',()=>{
 const before=d.emptyState(),result=createLinkedChecklist(before,payload(),'変更したタイトル',now),list=result.state.checklists[0];
 expect(before.checklists).toEqual([]);expect(result.created).toBe(true);
 expect(list).toMatchObject({title:'変更したタイトル',status:'active',sourceTemplateId:null,dueAt:null,notificationEnabled:false,orderLocked:false,createdAt:now,receivedFrom:{source:'atoqueue',requestId:payload().requestId,direct:true}});
 expect(list.items.map(i=>[i.sourceTaskId,i.checked,i.checkedAt])).toEqual([['a',false,null],['b',false,null]]);
 expect(list.items[0].id).not.toBe('a');expect(result.state.templates).toEqual([]);
});
it('opens the existing list on retries, including after settlement, without overwriting edits',()=>{
 let result=createLinkedChecklist(d.emptyState(),payload(),undefined,now);
 let state=d.updateChecklist(result.state,result.checklistId,{title:'編集済み'},now);
 state=d.settleChecklist(state,result.checklistId,now);
 result=createLinkedChecklist(state,{...payload(),title:'変更された再送'},undefined,now);
 expect(result.created).toBe(false);expect(result.state.checklists).toHaveLength(1);expect(result.state.checklists[0].title).toBe('編集済み');
});
it('allows a new request or a retry after deletion to create a new list',()=>{
 const first=createLinkedChecklist(d.emptyState(),payload(),undefined,now);
 const again=createLinkedChecklist(d.deleteChecklist(first.state,first.checklistId),payload(),undefined,now);
 expect(again.checklistId).not.toBe(first.checklistId);
 const changed={...payload(),requestId:'22222222-2222-4222-8222-222222222222'};
 expect(createLinkedChecklist(again.state,changed,undefined,now).state.checklists).toHaveLength(2);
});
it('retains origin IDs across checks, edits, records and backups, without imported copies blocking a new receipt',()=>{
 const result=createLinkedChecklist(d.emptyState(),payload(),undefined,now);let state=result.state;
 const item=state.checklists[0].items[0];state=d.toggleItem(state,result.checklistId,item.id,now);
 state=d.updateChecklist(state,result.checklistId,{items:state.checklists[0].items.map(i=>({id:i.id,label:i.label,note:'編集'}))},now);
 expect(state.checklists[0].items[0].sourceTaskId).toBe('a');
 for(const text of [exportBackup(state),createChecklistRecord(state.checklists[0]).json]){
  const imported=importBackup(d.emptyState(),parseTransfer(text));
  expect(imported.checklists[0].items[0].sourceTaskId).toBe('a');expect(imported.checklists[0].receivedFrom.direct).toBe(false);
  expect(createLinkedChecklist(imported,payload(),undefined,now).state.checklists).toHaveLength(2);
 }
 state=d.writeBack(state,result.checklistId,{mode:'new',name:'買い物'},now);
 expect(state.templates[0].items[0]).not.toHaveProperty('sourceTaskId');
});
it('validates persisted provenance and preserves legacy records with no provenance',()=>{
 const result=createLinkedChecklist(d.emptyState(),payload(),undefined,now);
 result.state.checklists[0].receivedFrom.requestId='invalid';expect(()=>d.validateState(result.state)).toThrow();
 const legacy=d.createChecklist(d.emptyState(),{title:'既存'},now);expect(d.validateState(legacy).checklists[0]).not.toHaveProperty('receivedFrom');
});
