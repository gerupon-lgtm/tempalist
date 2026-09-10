import {it,expect} from 'vitest';
import * as d from '../src/domain.js';
import {createChecklistRecord} from '../src/checklist-record.js';
import {exportBackup,parseTransfer,importBackup} from '../src/transfer.js';
const start='2026-09-10T00:00:00.000Z',checked='2026-09-10T01:02:03.456Z',later='2026-09-10T02:03:04.567Z';
function fixture(){
 let state=d.createChecklist(d.emptyState(),{title:'点検'},start);
 const id=state.checklists[0].id;
 state=d.updateChecklist(state,id,{items:[{label:'装置',note:'温度を確認'},{label:'電源'}]},start);
 return {state,id,itemId:state.checklists[0].items[0].id};
}
it('records check time, clears on uncheck and records a new time on recheck',()=>{
 const s=fixture();expect(s.state.checklists[0].items[0].checkedAt).toBeNull();
 let state=d.toggleItem(s.state,s.id,s.itemId,checked);
 expect(state.checklists[0].items[0]).toMatchObject({checked:true,checkedAt:checked});
 expect(state.checklists[0].updatedAt).toBe(checked);
 expect(s.state.checklists[0].items[0].checkedAt).toBeNull();
 state=d.toggleItem(state,s.id,s.itemId,later);
 expect(state.checklists[0].items[0]).toMatchObject({checked:false,checkedAt:null});
 state=d.toggleItem(state,s.id,s.itemId,later);
 expect(state.checklists[0].items[0].checkedAt).toBe(later);
});
it('keeps check time through editing, reordering, settlement, remarks and reopening',()=>{
 const s=fixture();let state=d.toggleItem(s.state,s.id,s.itemId,checked);
 state=d.updateChecklist(state,s.id,{items:state.checklists[0].items.map(i=>({id:i.id,label:i.label,note:'補足'}))},later);
 state=d.reorderItems(state,'checklist',s.id,0,1,later);
 state=d.settleChecklist(state,s.id,later);
 state=d.updateChecklistRemarks(state,s.id,'確認しました',later);
 state=d.reopenChecklist(state,s.id,later);
 expect(state.checklists[0].items.find(i=>i.id===s.itemId).checkedAt).toBe(checked);
});
it('handles edits that change check state without accepting a supplied replacement timestamp',()=>{
 const s=fixture();let state=d.updateChecklist(s.state,s.id,{items:[{id:s.itemId,label:'装置',checked:true,checkedAt:start}]},checked);
 expect(state.checklists[0].items[0].checkedAt).toBe(checked);
 state=d.updateChecklist(state,s.id,{items:[{...state.checklists[0].items[0],checkedAt:later}]},later);
 expect(state.checklists[0].items[0].checkedAt).toBe(checked);
 state=d.updateChecklist(state,s.id,{items:[{...state.checklists[0].items[0],checked:false}]},later);
 expect(state.checklists[0].items[0].checkedAt).toBeNull();
});
it('does not invent dates for legacy checked items, even when edited or settled',()=>{
 const s=fixture();s.state.checklists[0].items[0].checked=true;delete s.state.checklists[0].items[0].checkedAt;
 let state=d.validateState(s.state);expect(state.checklists[0].items[0].checkedAt).toBeNull();
 state=d.updateChecklist(state,s.id,{items:state.checklists[0].items},later);
 state=d.settleChecklist(state,s.id,later);
 const record=createChecklistRecord(state.checklists[0],{now:later,timeZone:'UTC'});
 expect(record.text).toContain('チェック日時: 日時未記録');
 expect(JSON.parse(record.json).checklist.items[0].checkedAt).toBeNull();
});
it('rejects invalid dates and dates on unchecked items on import',()=>{
 for(const value of ['invalid','2026-09-10T12:00:00+09:00',42,'2026-02-30T00:00:00Z']){
  const s=fixture();Object.assign(s.state.checklists[0].items[0],{checked:true,checkedAt:value});
  expect(()=>parseTransfer(JSON.stringify(s.state))).toThrow();
 }
 const s=fixture();s.state.checklists[0].items[0].checkedAt=checked;
 expect(()=>d.validateState(s.state)).toThrow();
});
it('includes item timestamps in pending mail, MIME, JSON and round-trip imports',()=>{
 const s=fixture(),state=d.toggleItem(s.state,s.id,s.itemId,checked);
 const record=createChecklistRecord(state.checklists[0],{now:later,timeZone:'Asia/Tokyo'});
 expect(record.text).toContain('チェック日時: 2026/09/10 10:02:03 (Asia/Tokyo) ['+checked+']');
 expect(record.text).toContain('チェック日時: 未チェック');
 expect(record.text).toContain('温度を確認');
 expect(JSON.parse(record.json).checklist.items[0].checkedAt).toBe(checked);
 for(const json of [record.json,exportBackup(state)]){
  expect(importBackup(d.emptyState(),parseTransfer(json)).checklists[0].items[0].checkedAt).toBe(checked);
 }
 const boundary=/boundary="([^"]+)"/.exec(record.eml)[1];
 const parts=record.eml.split('--'+boundary),decode=part=>Buffer.from(part.split('\r\n\r\n')[1].trim(),'base64').toString('utf8');
 expect(decode(parts[1])).toContain(checked);
 expect(JSON.parse(decode(parts[2])).checklist.items[0].checkedAt).toBe(checked);
});
it('never copies check times into templates or newly created lists',()=>{
 const s=fixture();let state=d.toggleItem(s.state,s.id,s.itemId,checked);
 state=d.writeBack(state,s.id,{mode:'new',name:'点検テンプレート'},later);
 expect(state.templates[0].items[0]).not.toHaveProperty('checkedAt');
 state=d.updateTemplate(state,state.templates[0].id,{...state.templates[0],status:'active'},later);
 state=d.createChecklist(state,{sourceTemplateId:state.templates[0].id,title:'次の点検'},later);
 expect(state.checklists[1].items[0]).toMatchObject({checked:false,checkedAt:null});
});
