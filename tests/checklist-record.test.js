import {describe,it,expect} from 'vitest';
import * as domain from '../src/domain.js';
import {createChecklistRecord} from '../src/checklist-record.js';
import {parseTransfer,importBackup,exportBackup} from '../src/transfer.js';

const created='2026-09-10T00:00:00.000Z', completed='2026-09-10T01:02:03.000Z', exported='2026-09-10T02:03:04.000Z';
function fixture(){
 let state=domain.createChecklist(domain.emptyState(),{title:'始業前点検 & 日本語 🧪'},created);
 const id=state.checklists[0].id;
 state=domain.updateChecklist(state,id,{items:[{label:'装置を確認',note:'温度 25℃\n異常なし',checked:true},{label:'記録を確認',note:'未確認',checked:false}]},created);
 return {state,id};
}
describe('checklist remarks and portable records',()=>{
 it('defaults old data and keeps remarks through backup',()=>{
  const {state,id}=fixture();delete state.checklists[0].remarks;delete state.checklists[0].remarksUpdatedAt;
  expect(domain.validateState(state).checklists[0]).toMatchObject({remarks:'',remarksUpdatedAt:null});
  const changed=domain.updateChecklistRemarks(state,id,'全体の備考\n確認者A',exported);
  expect(parseTransfer(exportBackup(changed)).checklists[0]).toMatchObject({remarks:'全体の備考\n確認者A',remarksUpdatedAt:exported});
  expect(()=>domain.updateChecklistRemarks(state,id,42,exported)).toThrow();
 });
 it('allows remarks before and after completion without changing the completion or items',()=>{
  let {state,id}=fixture();state=domain.updateChecklistRemarks(state,id,'準備中',created);
  state=domain.settleChecklist(state,id,completed);const before=structuredClone(state);
  state=domain.updateChecklistRemarks(state,id,'追記しました',exported);
  expect(state.checklists[0]).toMatchObject({status:'settled',settledAt:completed,remarks:'追記しました',remarksUpdatedAt:exported,updatedAt:exported});
  expect(state.checklists[0].items).toEqual(before.checklists[0].items);
  expect(before.checklists[0].remarks).toBe('準備中');
  expect(()=>domain.updateChecklist(state,id,{title:'変更'},exported)).toThrow();
 });
 it('exports only the selected checklist including pending items, comments and precise completion timestamps',()=>{
  let {state,id}=fixture();state=domain.settleChecklist(state,id,completed);
  state=domain.updateChecklistRemarks(state,id,'完了後の備考',exported);
  const list={...state.checklists[0],deviceSecret:'SECRET',outbox:['SECRET']};
  const result=createChecklistRecord(list,{now:exported,timeZone:'Asia/Tokyo'});
  const data=JSON.parse(result.json);
  expect(result.subject).toBe(list.title);
  expect(result.text).toContain('2026/09/10 10:02:03');
  expect(result.text).toContain(completed);
  expect(result.text).toContain('完了後の備考');
  expect(result.text).toContain('温度 25℃\n異常なし');
  expect(result.text).toContain('[未チェック] 記録を確認');
  expect(data).toMatchObject({schemaVersion:1,kind:'checklist-record',exportedAt:exported,timeZone:'Asia/Tokyo',checklist:{settledAt:completed,remarksUpdatedAt:exported}});
  expect(result.json).not.toContain('SECRET');expect(result.eml).not.toContain('SECRET');
  const imported=importBackup(domain.emptyState(),parseTransfer(result.json));
  expect(imported.checklists[0]).toMatchObject({settledAt:completed,remarks:'完了後の備考',notificationEnabled:false});
  expect(imported.checklists[0].id).not.toBe(id);
 });
 it('exports pending records without inventing completion and retains snapshots on subsequent edits',()=>{
  const {state,id}=fixture();const result=createChecklistRecord(state.checklists[0],{now:exported,timeZone:'UTC'});
  expect(JSON.parse(result.json).checklist.settledAt).toBe(null);expect(result.text).toContain('完了日時: 未完了');
  domain.updateChecklistRemarks(state,id,'後からの更新',exported);
  expect(result.text).not.toContain('後からの更新');
 });
 it('encodes Unicode safely in MIME with folded headers and a complete JSON attachment',()=>{
  const {state}=fixture();state.checklists[0].title='点検🧪'.repeat(100)+'\r\nBcc: injected@example.com';
  const result=createChecklistRecord(state.checklists[0],{now:exported,timeZone:'UTC'});
  const [headers]=result.eml.split('\r\n\r\n');
  expect(headers).not.toMatch(/\r\nBcc:/);expect(headers).toContain('X-Unsent: 1');
  expect(headers.split('\r\n').every(line=>line.length<=78)).toBe(true);
  const boundary=/boundary="([^"]+)"/.exec(headers)[1];
  const parts=result.eml.split('--'+boundary);
  const decode=part=>Buffer.from(part.split('\r\n\r\n')[1].trim(),'base64').toString('utf8');
  expect(decode(parts[1])).toBe(result.text.replace(/\r?\n/g,'\r\n'));
  expect(JSON.parse(decode(parts[2]))).toEqual(JSON.parse(result.json));
  expect(parts[2]).toContain('Content-Disposition: attachment;');
 });
});
