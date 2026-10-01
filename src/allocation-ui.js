import * as model from './allocation-domain.js';
import {escapeHTML as e,icon,field,openDialog,toast} from './ui.js';
import {heading} from './views.js';
const button=(action,label,style='',extra='')=>`<button type="button" data-allocation-action="${action}" class="${style}" ${extra}>${label}</button>`;
export const allocationFields=(name='',quantity=10)=>field('対象名',`<input name="allocationName" value="${e(name)}" required autocomplete="off" placeholder="ソフトウェアA">`)+field('保有数',`<input type="number" name="quantity" value="${quantity}" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" inputmode="numeric" required>`);
export function allocationSummary(list){const count=model.allocationCounts(list);return `保有 ${count.total} ／ 使用中 ${count.used} ／ 空き ${count.available}`;}
export function createAllocationUI({main,getState,commit,go}){
 const pages=new Map(),pageSize=50;
 const find=id=>getState().allocationLists?.find(list=>list.id===id);
 function html(id){
  const list=find(id);if(!list)return '<h1>利用枠管理が見つかりません</h1><a href="#/management">管理一覧に戻る</a>';
  const lastPage=Math.max(0,Math.ceil(list.quantity/pageSize)-1),page=Math.min(pages.get(id)??0,lastPage);pages.set(id,page);
  const start=page*pageSize,length=Math.min(pageSize,list.quantity-start),assignments=new Map(list.assignments.map(entry=>[entry.slot,entry.assignee]));
  return `<a class="back" href="#/management">${icon('back',16)} 管理一覧に戻る</a>`+heading(list.name,'チェックして割り当て先を入力。解除すると空きに戻ります。',button('edit','編集','detail-edit'),'detail-heading')+
   `<div class="allocation-counts" role="status" aria-label="利用状況">${allocationSummary(list)}</div>`+
   (list.quantity?`<ol class="items allocation-items" start="${start+1}">${Array.from({length},(_,index)=>{
    const slot=start+index+1,assignee=assignments.get(slot);
    return `<li class="item-row ${assignee?'allocation-used':''}"><label class="row-check"><input type="checkbox" data-allocation-slot="${slot}" aria-label="枠${slot}の使用" ${assignee?'checked':''}></label><div class="item-copy"><span class="item-label">枠${slot}</span><span class="allocation-assignee">${assignee?e(assignee):'空き'}</span></div><span class="allocation-state">${assignee?'使用中':'未使用'}</span></li>`;
   }).join('')}</ol>`:'<div class="empty-state"><h2>保有数は0です</h2><p>「編集」で保有数を増やすと、利用枠が表示されます。</p></div>')+
   (list.quantity>pageSize?`<nav class="allocation-pages" aria-label="利用枠のページ">${button('previous','前へ','',page===0?'disabled':'')}<span>${start+1}〜${start+length} / ${list.quantity}枠</span>${button('next','次へ','',page===lastPage?'disabled':'')}</nav>`:'')+
   `<div class="detail-bottom">${button('delete','利用枠管理を削除','danger-link')}</div>`;
 }
 main.addEventListener('change',event=>{
  const node=event.target.closest('[data-allocation-slot]');if(!node)return;
  const list=find(location.hash.split('/')[2]);if(!list)return;
  const slot=Number(node.dataset.allocationSlot),assignment=list.assignments.find(entry=>entry.slot===slot);
  node.checked=Boolean(assignment); // Persist only after the dialog succeeds; cancellation changes nothing.
  if(assignment){
   openDialog('使用を解除',`<p>枠${slot}の「${e(assignment.assignee)}」をクリアして、空きに戻します。</p>`,{submit:'解除する',lockWhileSaving:true,onSubmit:async()=>{await commit(state=>model.releaseAllocation(state,list.id,slot,list.revision));toast('使用を解除しました');}});
  }else{
   openDialog('使用を開始',`<p>枠${slot}の割り当て先を入力してください。</p>`+field('割り当て先','<input name="assignee" required autocomplete="off" placeholder="人名・部署・端末名など">'),{submit:'使用する',lockWhileSaving:true,onSubmit:async form=>{await commit(state=>model.assignAllocation(state,list.id,slot,form.get('assignee'),list.revision));toast('割り当て先を保存しました');}});
  }
 });
 main.addEventListener('click',event=>{
  const node=event.target.closest('[data-allocation-action]');if(!node)return;
  const list=find(location.hash.split('/')[2]);if(!list)return;
  const action=node.dataset.allocationAction;
  if(action==='previous'||action==='next'){
   pages.set(list.id,(pages.get(list.id)??0)+(action==='next'?1:-1));main.innerHTML=html(list.id);main.querySelector('.allocation-pages')?.scrollIntoView({block:'nearest'});return;
  }
  if(action==='edit')openDialog('利用枠管理を編集',allocationFields(list.name,list.quantity)+'<p class="secondary-text">保有数を減らすと空き枠から減らします。使用中の割り当ては保持します。枠番号が変わる場合があります。</p>',{lockWhileSaving:true,onSubmit:form=>commit(state=>model.updateAllocationList(state,list.id,{name:form.get('allocationName'),quantity:Number(form.get('quantity'))},list.revision))});
  if(action==='delete')openDialog('利用枠管理を削除',`<p>「${e(list.name)}」と現在の割り当て${list.assignments.length}件を削除します。この操作は取り消せません。</p>`,{submit:'削除する',destructive:true,lockWhileSaving:true,onSubmit:async()=>{await commit(state=>model.deleteAllocationList(state,list.id,list.revision));go('management');}});
 });
 return {html};
}
