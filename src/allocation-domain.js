// Current assignments only: vacant slots are represented by the quantity, not stored rows.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=message=>{throw new Error(message);};
function text(value,label){if(typeof value!=='string'||!value.trim())fail(`${label}を入力してください`);return value.trim();}
export function quantity(value){if(!Number.isSafeInteger(value)||value<0)fail('保有数は0以上の整数で入力してください');return value;}
function timestamp(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('利用枠の日時が不正です');return value;}
export function sanitizeAllocationLists(value){
 if(!Array.isArray(value))fail('利用枠管理データが不正です');
 const ids=new Set();
 return value.map(list=>{
  if(!list||typeof list!=='object'||typeof list.id!=='string'||!UUID.test(list.id)||ids.has(list.id))fail('利用枠管理のIDが不正です');ids.add(list.id);
  const total=quantity(list.quantity);
  if(!Number.isSafeInteger(list.revision)||list.revision<0||!Array.isArray(list.assignments))fail('利用枠管理の状態が不正です');
  const slots=new Set();
  const assignments=list.assignments.map(entry=>{
   if(!entry||!Number.isSafeInteger(entry.slot)||entry.slot<1||entry.slot>total||slots.has(entry.slot))fail('利用枠の割り当てが不正です');slots.add(entry.slot);
   return {slot:entry.slot,assignee:text(entry.assignee,'割り当て先')};
  }).sort((a,b)=>a.slot-b.slot);
  return {id:list.id,name:text(list.name,'対象名'),...(list.slotName!==undefined?{slotName:text(list.slotName,'番号の名称')}:{}),quantity:total,assignments,revision:list.revision,createdAt:timestamp(list.createdAt),updatedAt:timestamp(list.updatedAt)};
 });
}
export const allocationCounts=list=>({total:list.quantity,used:list.assignments.length,available:list.quantity-list.assignments.length});
function save(state,lists){return {...state,schemaVersion:Math.max(state.schemaVersion,lists.some(list=>list.slotName!==undefined)?5:4),managementLists:state.managementLists??[],allocationLists:sanitizeAllocationLists(lists)};}
export function createAllocationList(state,{name,quantity:total,slotName},now=new Date().toISOString()){
 return save(state,[...(state.allocationLists??[]),{id:crypto.randomUUID(),name,...(slotName!==undefined?{slotName}:{}),quantity:quantity(total),assignments:[],revision:0,createdAt:now,updatedAt:now}]);
}
function change(state,id,expectedRevision,mutate,now){
 const lists=sanitizeAllocationLists(state.allocationLists??[]),list=lists.find(entry=>entry.id===id);
 if(!list)fail('利用枠管理が見つかりません');
 if(list.revision!==expectedRevision)fail('別の画面で利用状況が更新されました。入力を控えて、画面を開き直してください。');
 const updated=mutate(list);
 return save(state,updated===null?lists.filter(entry=>entry.id!==id):lists.map(entry=>entry.id===id?{...updated,revision:list.revision+1,updatedAt:now}:entry));
}
export function updateAllocationList(state,id,{name,quantity:total,slotName},expectedRevision,now=new Date().toISOString()){
 quantity(total);
 return change(state,id,expectedRevision,list=>{
  if(total<list.assignments.length)fail(`現在${list.assignments.length}枠が使用中です。先に使用を解除してから保有数を減らしてください。`);
  const retained=list.assignments.filter(entry=>entry.slot<=total),occupied=new Set(retained.map(entry=>entry.slot));
  let vacant=1;
  for(const entry of list.assignments.filter(entry=>entry.slot>total)){
   while(occupied.has(vacant))vacant++;
   retained.push({...entry,slot:vacant});occupied.add(vacant);
  }
  return {...list,name,...(slotName!==undefined?{slotName}:{}),quantity:total,assignments:retained};
 },now);
}
export function assignAllocation(state,id,slot,assignee,expectedRevision,now=new Date().toISOString()){
 const label=text(assignee,'割り当て先');
 return change(state,id,expectedRevision,list=>{
  if(!Number.isSafeInteger(slot)||slot<1||slot>list.quantity)fail('利用枠が見つかりません');
  if(list.assignments.some(entry=>entry.slot===slot))fail('この枠は既に使用中です');
  return {...list,assignments:[...list.assignments,{slot,assignee:label}]};
 },now);
}
export function updateAllocationAssignee(state,id,slot,assignee,expectedRevision,now=new Date().toISOString()){
 const label=text(assignee,'割り当て先');
 return change(state,id,expectedRevision,list=>{
  if(!list.assignments.some(entry=>entry.slot===slot))fail('この枠は既に空きです');
  return {...list,assignments:list.assignments.map(entry=>entry.slot===slot?{...entry,assignee:label}:entry)};
 },now);
}
export function releaseAllocation(state,id,slot,expectedRevision,now=new Date().toISOString()){
 return change(state,id,expectedRevision,list=>{
  if(!list.assignments.some(entry=>entry.slot===slot))fail('この枠は既に空きです');
  return {...list,assignments:list.assignments.filter(entry=>entry.slot!==slot)};
 },now);
}
export function deleteAllocationList(state,id,expectedRevision,now=new Date().toISOString()){
 return change(state,id,expectedRevision,()=>null,now);
}
