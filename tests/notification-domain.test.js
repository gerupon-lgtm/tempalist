import {it,expect} from 'vitest';
import * as d from '../src/domain.js';
const now='2026-09-10T00:00:00.000Z';
const state=()=>{const s=d.createChecklist(d.emptyState(),{title:'通知確認',dueAt:'2026-09-12T00:00:00.000Z'},now);return d.updateChecklist(s,s.checklists[0].id,{offsets:['-24h','-1h']},now);};
it('enables notifications for an active future list and persists the choice',()=>{
 const s=state(),id=s.checklists[0].id;const next=d.setChecklistNotification(s,id,true,now);expect(next.checklists[0].notificationEnabled).toBe(true);expect(d.validateState(next)).toEqual(next);
 expect(d.setChecklistNotification(next,id,false,now).checklists[0].notificationEnabled).toBe(false);
});
it('rejects enabling without a future slot or on settled lists',()=>{
 const s=state(),id=s.checklists[0].id;
 expect(()=>d.setChecklistNotification(d.updateChecklist(s,id,{dueAt:null},now),id,true,now)).toThrow();
 expect(()=>d.setChecklistNotification(s,id,true,'2026-09-11T23:30:00.000Z')).toThrow();
 expect(()=>d.setChecklistNotification(d.settleChecklist(s,id,now),id,true,now)).toThrow();
});
it('turns notification choice off when the deadline or all offsets are removed',()=>{
 const s=state(),id=s.checklists[0].id,n=d.setChecklistNotification(s,id,true,now);
 expect(d.updateChecklist(n,id,{dueAt:null},now).checklists[0].notificationEnabled).toBe(false);
 expect(d.updateChecklist(n,id,{offsets:[]},now).checklists[0].notificationEnabled).toBe(false);
});
it('explains missing deadlines, empty selection, and elapsed slots separately',()=>{
 const s=state(),id=s.checklists[0].id;
 expect(()=>d.setChecklistNotification(d.updateChecklist(s,id,{dueAt:null},now),id,true,now)).toThrow('期限の日付を入力');
 expect(()=>d.setChecklistNotification(d.updateChecklist(s,id,{offsets:[]},now),id,true,now)).toThrow('1つ以上');
 expect(()=>d.setChecklistNotification(s,id,true,'2026-09-11T23:30:00.000Z')).toThrow('すべて過ぎています');
 const mixed=d.setChecklistNotification(s,id,true,'2026-09-11T22:00:00.000Z');
 expect(mixed.checklists[0].notificationEnabled).toBe(true);
 expect(d.setChecklistNotification(s,id,false,'2026-09-11T23:30:00.000Z').checklists[0].notificationEnabled).toBe(false);
});
it('supports a deadline slot within the last hour, but never at or after the deadline',()=>{
 const s=state(),id=s.checklists[0].id;
 const due=d.updateChecklist(s,id,{offsets:['0h']},now);
 expect(d.setChecklistNotification(due,id,true,'2026-09-11T23:30:00.000Z').checklists[0].notificationEnabled).toBe(true);
 for(const time of ['2026-09-12T00:00:00.000Z','2026-09-12T00:01:00.000Z'])expect(()=>d.setChecklistNotification(due,id,true,time)).toThrow('すべて過ぎています');
 expect(d.createChecklist(d.emptyState(),{title:'新規'},now).checklists[0].offsets).toEqual(['-24h','-1h','0h']);
 const legacy=d.updateChecklist(s,id,{offsets:['-24h','-1h']},now);
 expect(d.validateState(legacy).checklists[0].offsets).toEqual(['-24h','-1h']);
});
