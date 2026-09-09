import {it,expect} from 'vitest';
import * as d from '../src/domain.js';
const now='2026-09-10T00:00:00.000Z';
const state=()=>d.createChecklist(d.emptyState(),{title:'通知確認',dueAt:'2026-09-12T00:00:00.000Z'},now);
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
