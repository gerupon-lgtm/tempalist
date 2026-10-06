// @vitest-environment node
import {it,expect} from 'vitest';
import {emptyState,createTemplate,reorderTemplates,validateState,updateTemplate} from '../src/domain.js';
import {exportBackup,parseTransfer,importBackup} from '../src/transfer.js';
function fixture(){let state=emptyState();for(const [name,status] of [['A','active'],['B','draft'],['C','active'],['D','archived'],['E','active'],['F','draft']])state=createTemplate(state,{name,status,items:[{label:name+'項目'}]});return state;}
const ids=(state,status='active')=>state.templates.filter(t=>t.status===status).map(t=>t.id);
it('reorders the displayed status while preserving hidden positions and template contents',()=>{
 const state=fixture(),before=state.templates;
 const changed=reorderTemplates(state,'active',0,2,ids(state));expect(changed.templates.map(t=>t.name)).toEqual(['C','B','E','D','A','F']);
 expect(state.templates).toEqual(before);for(const t of changed.templates)expect(t).toEqual(before.find(entry=>entry.id===t.id));expect(validateState(changed)).toEqual(changed);
 const draft=reorderTemplates(changed,'draft',1,0,ids(changed,'draft'));expect(draft.templates.map(t=>t.name)).toEqual(['C','F','E','D','A','B']);expect(ids(draft)).toEqual(ids(changed));
 expect(reorderTemplates(draft,'archived',0,0,ids(draft,'archived')).templates).toEqual(draft.templates);
});
it('rejects stale displayed orders after reorder, additions, removal or a status change',()=>{
 const state=fixture(),expected=ids(state);const moved=reorderTemplates(state,'active',0,1,expected);
 expect(()=>reorderTemplates(moved,'active',1,2,expected)).toThrow('別の画面');
 const added=createTemplate(state,{name:'new',items:[]});expect(()=>reorderTemplates(added,'active',0,1,expected)).toThrow('別の画面');
 expect(()=>reorderTemplates({...state,templates:state.templates.slice(2)},'active',0,1,expected)).toThrow('別の画面');
 const changed=updateTemplate(state,expected[0],{...state.templates[0],status:'draft'});expect(()=>reorderTemplates(changed,'active',0,1,expected)).toThrow('別の画面');
});
it('validates indexes and preserves ordering through backup import',()=>{
 const state=fixture();for(const [from,to] of [[-1,0],[0,3],[.5,0],[0,Infinity]])expect(()=>reorderTemplates(state,'active',from,to,ids(state))).toThrow('位置');
 expect(()=>reorderTemplates(state,'invalid',0,0,[])).toThrow('状態');expect(()=>reorderTemplates(state,'active',0,1,undefined)).toThrow();
 const moved=reorderTemplates(state,'active',2,0,ids(state));const copied=importBackup(emptyState(),parseTransfer(exportBackup(moved)));expect(copied.templates.map(t=>t.name)).toEqual(moved.templates.map(t=>t.name));
});
