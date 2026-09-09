import {expect,it} from 'vitest';
import * as d from '../src/domain.js';
import {exportBackup,parseTransfer,importBackup,shareTemplate,readSharedTemplate} from '../src/transfer.js';
function setup(locked=true){
 const state=d.createTemplate(d.emptyState(),{name:'実験準備',defaultOrderLocked:locked,items:[{label:'準備'},{label:'確認'},{label:'開始'}]});
 return d.createChecklist(state,{title:'今日の準備',sourceTemplateId:state.templates[0].id});
}
it('copies the template default when creating a list',()=>{
 expect(setup().checklists[0].orderLocked).toBe(true);
 expect(setup(false).checklists[0].orderLocked).toBe(false);
 expect(d.createChecklist(d.emptyState(),{title:'空のリスト'}).checklists[0].orderLocked).toBe(false);
});
it('keeps template defaults and existing lists independent',()=>{
 let s=setup();const t=s.templates[0],id=s.checklists[0].id;
 s=d.updateTemplate(s,t.id,{...t,defaultOrderLocked:false});expect(s.checklists[0].orderLocked).toBe(true);
 s=d.updateChecklist(s,id,{orderLocked:false});expect(s.templates[0].defaultOrderLocked).toBe(false);
 s=d.updateChecklist(s,id,{orderLocked:true});expect(s.templates[0].defaultOrderLocked).toBe(false);
});
it('rejects reordering while locked, including an items patch',()=>{
 const s=setup(),list=s.checklists[0];
 expect(()=>d.reorderItems(s,'checklist',list.id,0,2)).toThrow(/並び順.*ロック/);
 expect(()=>d.updateChecklist(s,list.id,{items:[...list.items].reverse()})).toThrow(/並び順.*ロック/);
 expect(s.checklists[0].items.map(i=>i.label)).toEqual(['準備','確認','開始']);
});
it('still allows checking, notes, adding and deleting items',()=>{
 let s=setup();const id=s.checklists[0].id,item=s.checklists[0].items[0];
 s=d.toggleItem(s,id,item.id);expect(s.checklists[0].items[0].checked).toBe(true);
 s=d.updateChecklist(s,id,{items:s.checklists[0].items.map(i=>({...i,note:'補足'}))});
 s=d.updateChecklist(s,id,{items:[...s.checklists[0].items,{label:'片付け'}]});
 s=d.updateChecklist(s,id,{items:s.checklists[0].items.slice(1)});
 expect(s.checklists[0].items.map(i=>i.label)).toEqual(['確認','開始','片付け']);
});
it('can unlock and reorder, then keeps the lock through settlement and reopening',()=>{
 let s=setup();const id=s.checklists[0].id;
 s=d.updateChecklist(s,id,{orderLocked:false});s=d.reorderItems(s,'checklist',id,0,2);
 expect(s.checklists[0].items[2].label).toBe('準備');
 s=d.updateChecklist(s,id,{orderLocked:true});s=d.settleChecklist(s,id);
 expect(()=>d.updateChecklist(s,id,{orderLocked:false})).toThrow(/確定済み/);
 s=d.reopenChecklist(s,id);expect(s.checklists[0].orderLocked).toBe(true);
});
it('normalizes old records without changing their saved order',()=>{
 const old=setup();delete old.templates[0].defaultOrderLocked;delete old.checklists[0].orderLocked;
 const normalized=d.validateState(old);
 expect(normalized.templates[0].defaultOrderLocked).toBe(false);expect(normalized.checklists[0].orderLocked).toBe(false);
 expect(normalized.checklists[0].items).toEqual(old.checklists[0].items);
 expect(old.checklists[0]).not.toHaveProperty('orderLocked');
});
it.each([null,'true',1])('rejects malformed lock value %s',value=>{
 const s=setup();s.templates[0].defaultOrderLocked=value;expect(()=>d.validateState(s)).toThrow();
 const t=setup();t.checklists[0].orderLocked=value;expect(()=>d.validateState(t)).toThrow();
});
it('preserves defaults on duplication and share/import',()=>{
 const s=setup();expect(d.duplicateTemplate(s,s.templates[0].id).templates[1].defaultOrderLocked).toBe(true);
 const shared=shareTemplate(s.templates[0]);expect(readSharedTemplate(shared.url).defaultOrderLocked).toBe(true);
 expect(parseTransfer(shared.json).defaultOrderLocked).toBe(true);
 const restored=importBackup(d.emptyState(),parseTransfer(exportBackup(s)));
 expect(restored.templates[0].defaultOrderLocked).toBe(true);expect(restored.checklists[0].orderLocked).toBe(true);
});
it('preserves the existing template default on writeback, and copies the list lock to a new template',()=>{
 let s=setup(false);const id=s.checklists[0].id;s=d.updateChecklist(s,id,{orderLocked:true});
 expect(d.writeBack(s,id,{mode:'overwrite'}).templates[0].defaultOrderLocked).toBe(false);
 expect(d.writeBack(s,id,{mode:'new',name:'固定した型'}).templates[1].defaultOrderLocked).toBe(true);
});
