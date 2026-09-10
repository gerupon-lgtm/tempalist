import {createChecklist,updateChecklist,validateState,expiredChecklistIds,removeChecklists} from './domain.js';
import {PUBLIC_ORIGIN} from './version.js';

export const CHECKLIST_LINK_LIMIT=8000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('連携データの項目が正しくありません。');
}
function text(value,label){if(typeof value!=='string'||!value.trim())throw new Error(`${label}が正しくありません。`);return value;}
export function validateChecklistLink(value){
 object(value,['schemaVersion','kind','source','requestId','title','items']);
 if(value.schemaVersion!==1)throw new Error('対応していない連携データの版です。');
 if(value.kind!=='checklist-create'||value.source!=='atoqueue')throw new Error('対応していない連携データです。');
 if(typeof value.requestId!=='string'||!uuid.test(value.requestId))throw new Error('連携IDが正しくありません。');
 if(!Array.isArray(value.items)||!value.items.length)throw new Error('チェック項目を1件以上選んでください。');
 const ids=new Set();
 const items=value.items.map(item=>{
  object(item,['sourceTaskId','label','note']);
  const sourceTaskId=text(item.sourceTaskId,'元の予定ID');
  if(ids.has(sourceTaskId))throw new Error('元の予定IDが重複しています。');ids.add(sourceTaskId);
  if(item.note!==undefined&&typeof item.note!=='string')throw new Error('コメントが正しくありません。');
  return {sourceTaskId,label:text(item.label,'項目名'),note:item.note??''};
 });
 return {schemaVersion:1,kind:'checklist-create',source:'atoqueue',requestId:value.requestId.toLowerCase(),title:text(value.title,'リスト名'),items};
}
function checkLength(url){if(url.length>CHECKLIST_LINK_LIMIT)throw new Error('連携URLは8000文字までです。項目を分けて送ってください。');}
export function buildChecklistLink(value,origin=PUBLIC_ORIGIN){
 const bytes=new TextEncoder().encode(JSON.stringify(validateChecklistLink(value)));
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 const encoded=btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const url=new URL('/#create='+encoded,origin).href;checkLength(url);return url;
}
export function readChecklistLink(url){
 checkLength(url);const hash=new URL(url).hash;
 if(!hash.startsWith('#create='))throw new Error('チェックリスト連携URLではありません。');
 const encoded=hash.slice(8);let value;
 try{
  if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error();
  const binary=atob(encoded.replaceAll('-','+').replaceAll('_','/'));
  value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,char=>char.charCodeAt(0))));
 }catch{throw new Error('連携URLを読み取れません。あとキューからもう一度送ってください。');}
 return validateChecklistLink(value);
}
export function findLinkedChecklist(state,value,now=new Date().toISOString()){
 const expired=new Set(expiredChecklistIds(state,now));
 return state.checklists.find(list=>!expired.has(list.id)&&list.receivedFrom?.direct&&list.receivedFrom.source===value.source&&list.receivedFrom.requestId===value.requestId);
}
export function createLinkedChecklist(state,input,title,now=new Date().toISOString()){
 const value=validateChecklistLink(input);
 let next=validateState(state);
 const existing=findLinkedChecklist(next,value,now);
 if(existing)return {state:next,checklistId:existing.id,created:false};
 next=removeChecklists(next,expiredChecklistIds(next,now));
 next=createChecklist(next,{title:title===undefined?value.title:title},now);
 const checklistId=next.checklists.at(-1).id;
 next=updateChecklist(next,checklistId,{items:value.items},now);
 const list=next.checklists.at(-1);
 list.receivedFrom={source:value.source,requestId:value.requestId,direct:true};
 list.items=list.items.map((item,index)=>({...item,sourceTaskId:value.items[index].sourceTaskId}));
 return {state:validateState(next),checklistId,created:true};
}
