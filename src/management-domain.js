// Persistent management items are the source of truth for the shared action list.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(message){throw new Error(message);}
function text(value,label){if(typeof value!=='string'||!value.trim())fail(`${label}を入力してください`);return value.trim();}
function id(value){if(typeof value!=='string'||!UUID.test(value))fail('管理データのIDが不正です');return value;}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('管理データの日時が不正です');return value;}
function note(value){if(typeof value!=='string')fail('メモが不正です');return value;}
function bool(value){if(typeof value!=='boolean')fail('管理データのチェック状態が不正です');return value;}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))fail('管理データが不正です');return value;}
function unique(entries){const seen=new Set();for(const entry of entries){if(seen.has(entry.id))fail('管理データのIDが重複しています');seen.add(entry.id);}}
export function assertUniqueNames(items){
 const seen=new Set();for(const item of items){const label=text(item.label,'項目名');if(seen.has(label))fail(`同じ名前の項目があります：「${label}」。名前を変更してください。`);seen.add(label);}
}
export function sanitizeManagementLists(value){
 if(!Array.isArray(value))fail('管理リストが不正です');
 const lists=value.map(raw=>{
  const list=object(raw);if(!Array.isArray(list.items))fail('管理項目が不正です');
  const items=list.items.map(rawItem=>{
   const item=object(rawItem);if(!Number.isSafeInteger(item.revision)||item.revision<0)fail('管理項目の版が不正です');
   return {id:id(item.id),label:text(item.label,'項目名'),note:note(item.note),needsAction:bool(item.needsAction),lastCompletedAt:item.lastCompletedAt===null?null:date(item.lastCompletedAt),revision:item.revision};
  });
  unique(items);assertUniqueNames(items);
  return {id:id(list.id),name:text(list.name,'管理リスト名'),sourceTemplateId:list.sourceTemplateId===null?null:id(list.sourceTemplateId),orderLocked:bool(list.orderLocked),items,createdAt:date(list.createdAt),updatedAt:date(list.updatedAt)};
 });unique(lists);unique(lists.flatMap(list=>list.items));return lists;
}
export const managementLists=state=>sanitizeManagementLists(state.managementLists??[]);
export const actionItems=state=>managementLists(state).flatMap(list=>list.items.filter(item=>item.needsAction).map(item=>({listId:list.id,listName:list.name,item})));
function save(state,lists){return {...state,schemaVersion:2,managementLists:sanitizeManagementLists(lists)};}
function change(state,listId,mutate,now){
 const lists=managementLists(state),list=lists.find(list=>list.id===listId);if(!list)fail('管理リストが見つかりません');
 const updated={...mutate(list),updatedAt:date(now)};
 return save(state,lists.map(entry=>entry.id===listId?updated:entry));
}
function itemChange(state,listId,itemId,expectedRevision,mutate,now){
 return change(state,listId,list=>{
  const item=list.items.find(item=>item.id===itemId);if(!item)fail('管理項目が見つかりません');
  if(item.revision!==expectedRevision)fail('項目が変更されています。最新の状態で操作してください。');
  return {...list,items:list.items.map(entry=>entry.id===itemId?{...mutate(item),revision:item.revision+1}:entry)};
 },now);
}
export function createManagementList(state,{name,sourceTemplateId=null},now=new Date().toISOString()){
 const template=sourceTemplateId===null?null:state.templates.find(t=>t.id===sourceTemplateId&&t.status==='active');
 if(sourceTemplateId!==null&&!template)fail('使用中のテンプレートを選んでください');
 const items=(template?.items??[]).map(item=>({id:crypto.randomUUID(),label:item.label,note:item.note,needsAction:false,lastCompletedAt:null,revision:0}));
 assertUniqueNames(items);
 return save(state,[...managementLists(state),{id:crypto.randomUUID(),name:text(name,'管理リスト名'),sourceTemplateId,orderLocked:template?.defaultOrderLocked??false,items,createdAt:date(now),updatedAt:now}]);
}
export function updateManagementList(state,listId,patch,now=new Date().toISOString()){
 if(Object.keys(patch).some(key=>!['name','orderLocked'].includes(key)))fail('変更できない管理データです');
 return change(state,listId,list=>({...list,...patch}),now);
}
export function saveManagementItem(state,listId,itemId,value,expectedRevision,now=new Date().toISOString()){
 const patch={label:text(value.label,'項目名'),note:note(value.note??'')};
 if(itemId)return itemChange(state,listId,itemId,expectedRevision,item=>({...item,...patch}),now);
 return change(state,listId,list=>({...list,items:[...list.items,{id:crypto.randomUUID(),...patch,needsAction:false,lastCompletedAt:null,revision:0}]}),now);
}
export function setNeedsAction(state,listId,itemId,enabled,expectedRevision,now=new Date().toISOString()){
 return itemChange(state,listId,itemId,expectedRevision,item=>({...item,needsAction:bool(enabled)}),now);
}
export function completeManagementItem(state,listId,itemId,expectedRevision,now=new Date().toISOString()){
 let undo;
 const next=itemChange(state,listId,itemId,expectedRevision,item=>{
  if(!item.needsAction)fail('この項目は対応済みです');
  undo={listId,itemId,revision:item.revision+1,previousCompletedAt:item.lastCompletedAt};
  return {...item,needsAction:false,lastCompletedAt:date(now)};
 },now);
 return {state:next,undo};
}
export function undoManagementCompletion(state,undo,now=new Date().toISOString()){
 return itemChange(state,undo.listId,undo.itemId,undo.revision,item=>{
  if(item.needsAction)fail('項目が変更されています。元に戻せません。');
  return {...item,needsAction:true,lastCompletedAt:undo.previousCompletedAt};
 },now);
}
export function deleteManagementItem(state,listId,itemId,expectedRevision,now=new Date().toISOString()){
 // Validate the same revision as the confirmation screen before removal.
 const checked=itemChange(state,listId,itemId,expectedRevision,item=>item,now);
 return change(checked,listId,list=>({...list,items:list.items.filter(item=>item.id!==itemId)}),now);
}
export function deleteManagementList(state,listId){
 const lists=managementLists(state);if(!lists.some(list=>list.id===listId))fail('管理リストが見つかりません');
 return save(state,lists.filter(list=>list.id!==listId));
}
export function reorderManagementItems(state,listId,from,to,now=new Date().toISOString()){
 return change(state,listId,list=>{
  if(list.orderLocked)fail('並び順がロックされています。解除してから移動してください。');
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=list.items.length||to>=list.items.length)fail('並べ替え位置が不正です');
  const items=[...list.items],[moved]=items.splice(from,1);items.splice(to,0,moved);return {...list,items};
 },now);
}
