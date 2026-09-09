import { validateState } from './domain.js';
import { PUBLIC_ORIGIN } from './version.js';
function shared(value) {
  if (typeof value.name !== 'string' || !value.name.trim() || !Array.isArray(value.items)) throw new Error('テンプレートの形式が正しくありません。');
  if(value.defaultOrderLocked !== undefined && typeof value.defaultOrderLocked !== 'boolean') throw new Error('並び順ロックの初期設定が正しくありません。');
  return {schemaVersion:1,kind:'template',name:value.name,defaultOrderLocked:value.defaultOrderLocked ?? false,items:value.items.map(item=>{
    if (!item || typeof item.label !== 'string' || !item.label.trim() || (item.note !== undefined && typeof item.note !== 'string')) throw new Error('項目の形式が正しくありません。');
    return {label:item.label,note:item.note ?? ''};
  })};
}
export function exportBackup(state, now=new Date().toISOString()) {
  const {templates,checklists,settings}=validateState(state);
  return JSON.stringify({schemaVersion:1,exportedAt:now,templates,checklists,settings},null,2);
}
export function parseTransfer(text) {
  let value;
  try { value=JSON.parse(text); } catch { throw new Error('JSONファイルを読み取れません。'); }
  if (!value || value.schemaVersion !== 1) throw new Error('対応していないデータの版です。取り込みを中止しました。');
  if (value.kind === 'template') return shared(value);
  if (value.kind !== undefined && value.kind !== 'backup') throw new Error('データの種類が正しくありません。');
  return {...validateState({...value,revision:0}),kind:'backup'};
}
export function importBackup(destination, value) {
  const imported=validateState({...value,revision:0});
  const ids=new Map(imported.templates.map(t=>[t.id,crypto.randomUUID()]));
  const templates=imported.templates.map(t=>({...t,id:ids.get(t.id),items:t.items.map(i=>({...i,id:crypto.randomUUID()}))}));
  const checklists=imported.checklists.map(c=>({...c,id:crypto.randomUUID(),sourceTemplateId:ids.get(c.sourceTemplateId) ?? null,notificationEnabled:false,items:c.items.map(i=>({...i,id:crypto.randomUUID()}))}));
  return {...destination,templates:[...destination.templates,...templates],checklists:[...destination.checklists,...checklists]};
}
export function shareTemplate(template, origin=PUBLIC_ORIGIN) {
  const data=shared(template), json=JSON.stringify(data,null,2);
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte);
  const encoded=btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const url=new URL('/#t='+encoded,origin).href;
  return {url:url.length<=8000 ? url : null,json};
}
export function readSharedTemplate(url) {
  const encoded=new URL(url).hash.slice(3);
  if (!new URL(url).hash.startsWith('#t=') || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('共有リンクの形式が正しくありません。');
  try {
    const binary=atob(encoded.replaceAll('-','+').replaceAll('_','/'));
    const value=parseTransfer(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
    if (value.kind !== 'template') throw new Error();
    return value;
  } catch { throw new Error('共有リンクを読み取れません。対応版の共有JSONでも取り込めます。'); }
}
