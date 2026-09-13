// @vitest-environment node
import {it,expect} from 'vitest';
import {emptyState,createTemplate,validateState} from '../src/domain.js';
import {addSupplySamples,SUPPLY_TEMPLATES} from '../src/samples.js';
it('adds four reusable templates with the requested items and unique labels',()=>{
 const state=addSupplySamples(emptyState());expect(state.templates.map(t=>t.name)).toEqual(['食品','猫用品','日用品','実験備品']);
 expect(state.templates.map(t=>t.items.length)).toEqual([7,6,6,6]);
 expect(state.templates[0].items.map(i=>i.label)).toContain('ペットボトルコーヒー');
 for(const t of state.templates){expect(new Set(t.items.map(i=>i.label)).size).toBe(t.items.length);expect(t.status).toBe('active');}
 expect(validateState(state)).toEqual(state);expect(addSupplySamples(state)).toBe(state);
});
it('preserves existing named templates and edited samples without duplicates',()=>{
 let state=createTemplate(emptyState(),{name:' 食品 ',items:[{label:'自分の食品'}]});const original=state.templates[0];
 state=addSupplySamples(state);expect(state.templates).toHaveLength(4);expect(state.templates[0]).toEqual(original);
 state.templates[1].name='猫のもの';expect(addSupplySamples(state)).toBe(state);
 expect(state.templates[1].id).toBe(SUPPLY_TEMPLATES[1].id);
});

it('keeps the completion flag in the same state as the samples after deletion',()=>{
 const seeded=addSupplySamples(emptyState());
 const deleted=validateState({...seeded,templates:[]});
 expect(deleted.supplySamplesAdded).toBe(true);
 expect(addSupplySamples(deleted)).toBe(deleted);
 expect(deleted.templates).toHaveLength(0);
});
