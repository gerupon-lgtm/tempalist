import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup, shareTemplate, readSharedTemplate, parseTransfer } from '../src/transfer.js';
const templateId='40000000-0000-4000-8000-000000000001';
const listId='40000000-0000-4000-8000-000000000002';
const itemId='40000000-0000-4000-8000-000000000003';
const now='2026-09-09T00:00:00.000Z';
const template={id:templateId,name:'研究 & <確認>',status:'active',items:[{id:itemId,label:'試料を確認',note:'あいう'}],createdAt:now,updatedAt:now};
const state=()=>({schemaVersion:1,revision:0,templates:[structuredClone(template)],checklists:[{id:listId,title:'準備',sourceTemplateId:templateId,items:[{id:itemId,label:'試料を確認',note:'あいう',checked:true}],dueAt:null,dueHasTime:false,notificationEnabled:true,offsets:['-24h','-1h'],status:'active',settledAt:null,createdAt:now,updatedAt:now}],settings:{completedRetention:'90d'}});
describe('portable data',()=>{
 it('exports only business data, never credentials or outbox',()=>{
  const value=state(); value.deviceSecret='never-export'; value.outbox=[{secret:'never-export'}];
  const text=exportBackup(value,now); const data=JSON.parse(text);
  expect(text).not.toContain('never-export'); expect(data.exportedAt).toBe(now); expect(data.templates[0].items[0].note).toBe('あいう');
 });
 it('appends repeatedly without collisions and remaps source to imported template, keeping destination settings',()=>{
  const destination=state(); destination.settings.completedRetention='keep';
  const first=importBackup(destination,parseTransfer(exportBackup(state(),now)));
  const next=importBackup(first,parseTransfer(exportBackup(state(),now)));
  expect(next.templates).toHaveLength(3);expect(next.checklists).toHaveLength(3);
  expect(new Set(next.templates.map(t=>t.id)).size).toBe(3);
  expect(next.checklists[1].sourceTemplateId).toBe(next.templates[1].id);
  expect(next.checklists[2].sourceTemplateId).toBe(next.templates[2].id);
  expect(next.checklists[1].notificationEnabled).toBe(false);
  expect(next.settings.completedRetention).toBe('keep');
  expect(destination.checklists).toHaveLength(1);
 });
 it('round trips Japanese shared content in fragment with no query payload',()=>{
  const {url,json}=shareTemplate(template,'https://tempalist.sikumilab.com');
  expect(new URL(url).search).toBe('');
  expect(readSharedTemplate(url).items).toEqual([{label:'試料を確認',note:'あいう'}]);
  expect(parseTransfer(json).kind).toBe('template');
  expect(JSON.parse(json)).not.toHaveProperty('status');
 });
 it('provides JSON fallback rather than a too-long URL',()=>{
  const {url,json}=shareTemplate({...template,items:[{label:'あ'.repeat(9000)}]},'https://tempalist.sikumilab.com');
  expect(url).toBe(null); expect(JSON.parse(json).items[0].label).toHaveLength(9000);
 });
 it('rejects unknown versions, malformed shared data and broken encodings',()=>{
  expect(()=>parseTransfer('{"schemaVersion":99}')).toThrow(/版/);
  expect(()=>parseTransfer('{"schemaVersion":1,"kind":"template","name":"x","items":[{"label":2}]}')).toThrow();
  expect(()=>readSharedTemplate('https://tempalist.sikumilab.com/#t=%%%')).toThrow();
 });
});
