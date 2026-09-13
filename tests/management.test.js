// @vitest-environment node
import {it,expect} from 'vitest';
import * as model from '../src/management-domain.js';
import * as domain from '../src/domain.js';
import {exportBackup,parseTransfer,importBackup} from '../src/transfer.js';
import {createStore,DATA_KEY} from '../src/storage.js';
const first='2026-09-13T01:00:00.000Z',second='2026-09-14T02:00:00.000Z';
function fixture(){
 let state=domain.createTemplate(domain.emptyState(),{name:'食品',defaultOrderLocked:true,items:[{label:'牛乳',note:'1L'}]},first);
 const template=state.templates[0];state=model.createManagementList(state,{name:'冷蔵庫',sourceTemplateId:template.id},first);
 state=model.createManagementList(state,{name:'研究室',sourceTemplateId:template.id},first);
 return {state,list:state.managementLists[0],other:state.managementLists[1],template};
}
it('shares templates by copying independent management and checklist items',()=>{
 const {state,list,other,template}=fixture();expect(state.schemaVersion).toBe(2);expect(list.orderLocked).toBe(true);
 expect(list.items[0]).toMatchObject({label:'牛乳',note:'1L',needsAction:false,lastCompletedAt:null});expect(list.items[0].id).not.toBe(other.items[0].id);
 const normal=domain.createChecklist(state,{title:'通常',sourceTemplateId:template.id},first);
 const edited=domain.updateTemplate(normal,template.id,{...template,name:'変更',items:[{label:'卵'}]},second);
 expect(edited.managementLists[0]).toEqual(list);expect(edited.checklists[0].items[0].label).toBe('牛乳');expect(domain.validateState(edited)).toEqual(edited);
});
it('aggregates same labels from separate lists and completes only the selected source',()=>{
 let {state,list,other}=fixture();
 for(const source of [list,other])state=model.setNeedsAction(state,source.id,source.items[0].id,true,0,first);
 expect(model.actionItems(state).map(entry=>entry.listName)).toEqual(['冷蔵庫','研究室']);
 const completed=model.completeManagementItem(state,list.id,list.items[0].id,1,second);state=completed.state;
 expect(model.actionItems(state)).toHaveLength(1);expect(state.managementLists[0].items[0]).toMatchObject({needsAction:false,lastCompletedAt:second});
 expect(state.managementLists[1].items[0].needsAction).toBe(true);
 expect(()=>model.completeManagementItem(state,list.id,list.items[0].id,1,second)).toThrow('変更');
 const reverted=model.undoManagementCompletion(state,completed.undo,second);expect(reverted.managementLists[0].items[0]).toMatchObject({needsAction:true,lastCompletedAt:null});
 expect(()=>model.undoManagementCompletion(reverted,completed.undo,second)).toThrow('変更');
});
it('manual removal preserves the previous completion date, repeat completion replaces it, undo restores it',()=>{
 let {state,list}=fixture();const id=list.items[0].id;
 state=model.setNeedsAction(state,list.id,id,true,0,first);state=model.completeManagementItem(state,list.id,id,1,first).state;
 state=model.setNeedsAction(state,list.id,id,true,2,second);state=model.setNeedsAction(state,list.id,id,false,3,second);
 expect(state.managementLists[0].items[0].lastCompletedAt).toBe(first);expect(model.actionItems(state)).toHaveLength(0);
 state=model.setNeedsAction(state,list.id,id,true,4,second);const completion=model.completeManagementItem(state,list.id,id,5,second);
 expect(completion.state.managementLists[0].items[0].lastCompletedAt).toBe(second);
 expect(model.undoManagementCompletion(completion.state,completion.undo,second).managementLists[0].items[0].lastCompletedAt).toBe(first);
});
it('rejects stale undo even after the item is checked then cleared again',()=>{
 let {state,list}=fixture();const id=list.items[0].id;state=model.setNeedsAction(state,list.id,id,true,0,first);
 const completion=model.completeManagementItem(state,list.id,id,1,first);state=model.setNeedsAction(completion.state,list.id,id,true,2,second);state=model.setNeedsAction(state,list.id,id,false,3,second);
 expect(()=>model.undoManagementCompletion(state,completion.undo,second)).toThrow('変更');
});
it('retains identity and response state on renaming items and lists',()=>{
 let {state,list}=fixture(),id=list.items[0].id;state=model.setNeedsAction(state,list.id,id,true,0,first);
 state=model.saveManagementItem(state,list.id,id,{label:'ミルク',note:'2L'},1,second);state=model.updateManagementList(state,list.id,{name:'自宅'},second);
 expect(model.actionItems(state)[0]).toMatchObject({listName:'自宅',item:{id,label:'ミルク',needsAction:true}});
});
it('rejects duplicate additions, edits, imported data and duplicate templates only for management',()=>{
 let {state,list,template}=fixture();
 expect(()=>model.saveManagementItem(state,list.id,null,{label:' 牛乳 ',note:''},null,first)).toThrow('同じ名前');
 state=model.saveManagementItem(state,list.id,null,{label:'卵',note:''},null,first);const egg=state.managementLists[0].items[1];
 expect(()=>model.saveManagementItem(state,list.id,egg.id,{label:'牛乳',note:''},0,first)).toThrow('同じ名前');
 const invalid=structuredClone(state);invalid.managementLists[0].items[1].label='牛乳';expect(()=>domain.validateState(invalid)).toThrow('同じ名前');
 state=domain.updateTemplate(state,template.id,{...template,name:'重複',items:[{label:'牛乳'},{label:' 牛乳 '}]},first);
 expect(()=>model.createManagementList(state,{name:'失敗',sourceTemplateId:template.id},first)).toThrow('同じ名前');
 expect(domain.createChecklist(state,{title:'通常',sourceTemplateId:template.id},first).checklists[0].items).toHaveLength(2);
});
it('locks ordering independently and removes action entries when items or lists are deleted',()=>{
 let {state,list}=fixture();state=model.saveManagementItem(state,list.id,null,{label:'卵',note:''},null,first);
 expect(()=>model.reorderManagementItems(state,list.id,0,1,first)).toThrow('ロック');state=model.updateManagementList(state,list.id,{orderLocked:false},first);
 state=model.reorderManagementItems(state,list.id,0,1,first);expect(state.managementLists[0].items[1].label).toBe('牛乳');
 state=model.setNeedsAction(state,list.id,list.items[0].id,true,0,first);state=model.deleteManagementItem(state,list.id,list.items[0].id,1,second);expect(model.actionItems(state)).toHaveLength(0);
 state=model.deleteManagementList(state,list.id);expect(state.managementLists).toHaveLength(1);
 expect(()=>model.reorderManagementItems(state,state.managementLists[0].id,0,99,first)).toThrow();
});
it('preserves legacy format until management creation, then backs up all data in version 2',()=>{
 const legacy=domain.emptyState();expect(JSON.parse(exportBackup(legacy)).schemaVersion).toBe(1);
 const {state,list}=fixture();const checked=model.setNeedsAction(state,list.id,list.items[0].id,true,0,first);
 const completed=model.completeManagementItem(checked,list.id,list.items[0].id,1,second).state;
 const parsed=parseTransfer(exportBackup(completed));expect(parsed.schemaVersion).toBe(2);
 const imported=importBackup({...legacy,settings:{completedRetention:'keep'}},parsed);
 expect(imported.settings.completedRetention).toBe('keep');expect(imported.managementLists[0].items[0].lastCompletedAt).toBe(second);
 expect(imported.managementLists[0].id).not.toBe(list.id);expect(imported.managementLists[0].items[0].id).not.toBe(list.items[0].id);
 expect(imported.managementLists[0].sourceTemplateId).toBe(imported.templates[0].id);
 expect(domain.expiredChecklistIds(imported,'2028-01-01T00:00:00.000Z')).toEqual([]);
 expect(domain.validateState(imported)).toEqual(imported);
 const again=importBackup(imported,parseTransfer(exportBackup(legacy)));expect(again.managementLists).toEqual(imported.managementLists);
 expect(()=>parseTransfer(JSON.stringify({...parsed,schemaVersion:3}))).toThrow();
 expect(()=>domain.validateState({...state,schemaVersion:1})).toThrow();
});
it('validates malformed management state and does not silently discard unknown data',()=>{
 const {state}=fixture();for(const value of [null,{},'bad'])expect(()=>domain.validateState({...state,managementLists:value})).toThrow();
 const duplicate=structuredClone(state);duplicate.managementLists[1].items[0].id=duplicate.managementLists[0].items[0].id;expect(()=>domain.validateState(duplicate)).toThrow('IDが重複');
 for(const field of ['needsAction','lastCompletedAt','revision','id']){const invalid=structuredClone(state);invalid.managementLists[0].items[0][field]='bad';expect(()=>domain.validateState(invalid)).toThrow();}
});
it('saves action completion atomically and leaves stored state intact on quota failure',()=>{
 let {state,list}=fixture();state=model.setNeedsAction(state,list.id,list.items[0].id,true,0,first);
 const backend={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;}};
 const store=createStore(backend,domain.validateState);store.initialize(state);const raw=store.raw();
 backend.setItem=()=>{throw new DOMException('full','QuotaExceededError');};
 expect(()=>store.save(model.completeManagementItem(store.read(),list.id,list.items[0].id,1,second).state,0)).toThrow('容量');expect(store.raw()).toBe(raw);expect(store.read().managementLists[0].items[0].needsAction).toBe(true);
});
