import * as model from './management-domain.js';
import {escapeHTML as e,icon,field,openDialog,toast} from './ui.js';
import {heading} from './views.js';
import {formatDateTime} from './dates.js';
import {attachReorder} from './reorder.js';
import {attachCardInteractions} from './card-interactions.js';
const button=(action,label,classes='',extra='')=>`<button type="button" data-management-action="${action}" class="${classes}" ${extra}>${label}</button>`;
const input=(name,value)=>`<input name="${name}" value="${e(value)}" required autocomplete="off">`;
const confirmDeletion=(title,body,onSubmit)=>openDialog(title,body,{submit:'削除する',destructive:true,lockWhileSaving:true,onSubmit});
const findList=(state,id)=>(state.managementLists??[]).find(list=>list.id===id);
const unchanged=list=>state=>JSON.stringify(findList(state,list.id))===JSON.stringify(list);

export function createManagementUI({main,getState,commit,go,render}){
 let undo=null,busy=false;
 function undoNotice(){
  if(!undo)return '';
  const item=findList(getState(),undo.listId)?.items.find(item=>item.id===undo.itemId);
  if(!item||item.revision!==undo.revision||item.needsAction){undo=null;return '';}
  return `<aside class="management-undo" role="status"><span>「${e(undo.label)}」を対応済みにしました。</span>${button('undo','元に戻す')}</aside>`;
 }
 function overview(){
  const lists=getState().managementLists??[],count=model.actionItems(getState()).length;
  return heading('管理','不足や必要な対応を、ひとつに。',button('new','管理リストを作る','primary'))+
   `<a class="list-card management-actions-link" href="#/actions"><div class="card-copy"><h2>対応リスト</h2><p class="secondary-text">すべての管理リストから集めています</p></div><span class="badge">要対応 ${count}件</span>${icon('arrow')}</a>`+
   undoNotice()+`<h2 class="management-section-title">管理リスト</h2><div class="list-stack">${lists.map(list=>`<a class="list-card" href="#/management/${list.id}"><div class="card-copy"><h2>${e(list.name)}</h2><span class="secondary-text">${list.items.length}項目 · 要対応 ${list.items.filter(item=>item.needsAction).length}件</span></div>${icon('arrow')}</a>`).join('')||'<div class="empty-state"><h2>管理リストを作りましょう</h2><p>冷蔵庫や猫用品など、分けて管理できます。<br>いつものテンプレートも使えます。</p></div>'}</div>`;
 }
 function controls(list,item,index){
  return `<div class="row-controls"><details class="item-menu"><summary aria-label="${e(item.label)}の操作">⋯</summary><div class="menu-actions">${button('edit-item','編集')}${button('delete-item','削除','danger')}</div></details>${list.orderLocked?'':`<div class="row-stepper">${button('up',icon('up',18),'step-button',`aria-label="上へ" ${index===0?'disabled':''}`)}${button('down',icon('down',18),'step-button',`aria-label="下へ" ${index===list.items.length-1?'disabled':''}`)}</div>`}</div>`;
 }
 function detail(list){
  return `<a class="back" href="#/management">${icon('back',16)} 管理一覧に戻る</a>`+
   heading(list.name,'不足・対応が必要なものにチェックしてください。',button('edit-list','編集'),'detail-heading')+
   `<a class="management-action-shortcut" href="#/actions">対応リストを見る（全体 ${model.actionItems(getState()).length}件） ${icon('arrow',16)}</a>`+undoNotice()+
   `<section class="order-lock-setting"><div><strong>並び順ロック</strong><p>${list.orderLocked?'並べ替えを防ぎます。チェック・編集はそのまま使えます。':'カードの長押しや↑↓で並べ替えできます。'}</p></div>${button('lock',`<span class="switch-track" aria-hidden="true"></span><span>${list.orderLocked?'ON':'OFF'}</span>`,'order-lock-switch',`role="switch" aria-label="並び順ロック" aria-checked="${list.orderLocked}"`)}</section>`+
   `<ol class="items management-items">${list.items.map((item,index)=>`<li class="item-row ${list.orderLocked?'':'reorderable'} ${item.needsAction?'needs-action':''}" data-item="${item.id}" data-list="${list.id}" data-index="${index}"><label class="row-check"><input type="checkbox" data-management-check="need" data-revision="${item.revision}" aria-label="${e(item.label)}を要対応にする" ${item.needsAction?'checked':''}></label><div class="item-copy"><span class="item-label">${e(item.label)}</span>${item.note?`<span class="item-note">${e(item.note)}</span>`:''}<small class="management-last">前回対応：${item.lastCompletedAt?e(formatDateTime(item.lastCompletedAt)):'未記録'}</small></div>${controls(list,item,index)}</li>`).join('')||'<li class="empty-state">項目を追加してください。</li>'}</ol>`+
   button('add-item',`${icon('plus',18)} 項目を追加`,'add-item')+`<div class="detail-bottom">${button('delete-list','管理リストを削除','danger-link')}</div>`;
 }
 function actions(){
  const entries=model.actionItems(getState());
  return `<a class="back" href="#/management">${icon('back',16)} 管理一覧に戻る</a>`+heading('対応リスト','購入・補充などが済んだものにチェックしてください。')+undoNotice()+
   `<p class="secondary-text">要対応 ${entries.length}件 · 元の管理リスト順に表示</p><ol class="items management-items">${entries.map(({listId,listName,item})=>`<li class="item-row" data-item="${item.id}" data-list="${listId}"><label class="row-check"><input type="checkbox" data-management-check="complete" data-revision="${item.revision}" aria-label="${e(listName)}の${e(item.label)}を対応済みにする"></label><div class="item-copy"><span class="item-label">${e(item.label)}</span><a class="management-source" href="#/management/${listId}">${e(listName)}</a>${item.note?`<span class="item-note">${e(item.note)}</span>`:''}</div></li>`).join('')||'<li class="empty-state"><h2>必要な対応はありません</h2><p>管理リストでチェックすると、ここに集まります。</p></li>'}</ol>`;
 }
 function newList(){
  const templates=getState().templates.filter(template=>template.status==='active');
  const dialog=openDialog('管理リストを作る',field('テンプレート',`<select name="source" aria-label="テンプレート"><option value="">空から作る</option>${templates.map(template=>`<option value="${template.id}">${e(template.name)}</option>`).join('')}</select>`)+field('管理リスト名',input('name',''))+'<p class="secondary-text">項目・コメント・並び順ロックの初期値をコピーします。要対応チェックと前回対応日時は空で始まります。</p><p data-template-warning role="status"></p>',{submit:'作成する',lockWhileSaving:true,onSubmit:async form=>{
   const saved=await commit(state=>model.createManagementList(state,{name:form.get('name'),sourceTemplateId:form.get('source')||null}));
   go('management/'+saved.managementLists.at(-1).id);toast('管理リストを作成しました');
  }});
  dialog.querySelector('[name=source]').onchange=event=>{
   const template=templates.find(template=>template.id===event.target.value),warning=dialog.querySelector('[data-template-warning]');warning.textContent='';
   if(template){dialog.querySelector('[name=name]').value=template.name;try{model.assertUniqueNames(template.items);}catch(error){warning.textContent=error.message+' キャンセルしてテンプレートタブで修正してから、作り直してください。';}}
  };
 }
 function editItem(list,item){
  openDialog(item?'管理項目を編集':'管理項目を追加',field('項目名',input('label',item?.label??''))+field('メモ',`<textarea name="note">${e(item?.note??'')}</textarea>`),{lockWhileSaving:true,onSubmit:form=>commit(state=>model.saveManagementItem(state,list.id,item?.id,{label:form.get('label'),note:form.get('note')},item?.revision),unchanged(list))});
 }
 async function run(task){if(busy)return;busy=true;try{await task();}catch(error){toast(error.message);}finally{busy=false;}}
 main.addEventListener('change',event=>{
  const node=event.target.closest('[data-management-check]');if(!node)return;
  const row=node.closest('[data-item]'),listId=row.dataset.list,itemId=row.dataset.item,revision=Number(node.dataset.revision),enabled=node.checked,type=node.dataset.managementCheck;
  if(busy){render();return;}
  const list=findList(getState(),listId),item=list?.items.find(item=>item.id===itemId);node.disabled=true;
  void run(async()=>{
   try{
    if(type==='complete'){
     let result;await commit(state=>{result=model.completeManagementItem(state,listId,itemId,revision);return result.state;});
     undo={...result.undo,label:item.label};render();
    }else await commit(state=>model.setNeedsAction(state,listId,itemId,enabled,revision));
   }catch(error){render();throw error;}
  });
 });
 main.addEventListener('click',event=>{
  const node=event.target.closest('[data-management-action]');if(!node)return;
  const action=node.dataset.managementAction,listId=location.hash.split('/')[2],list=findList(getState(),listId),row=node.closest('[data-item]'),item=list?.items.find(item=>item.id===row?.dataset.item),index=Number(row?.dataset.index);
  void run(async()=>{
   if(action==='new')return newList();
   if(action==='undo'){
    if(!undo)return;const token=undo;await commit(state=>model.undoManagementCompletion(state,token));undo=null;render();toast('対応前の状態に戻しました');return;
   }
   if(!list)throw new Error('管理リストが見つかりません');
   if(action==='edit-list')return openDialog('管理リストを編集',field('管理リスト名',input('name',list.name)),{lockWhileSaving:true,onSubmit:form=>commit(state=>model.updateManagementList(state,list.id,{name:form.get('name')}),unchanged(list))});
   if(action==='add-item'||action==='edit-item')return editItem(list,item);
   if(action==='lock')return commit(state=>model.updateManagementList(state,list.id,{orderLocked:!list.orderLocked}),unchanged(list));
   if(action==='up'||action==='down')return commit(state=>model.reorderManagementItems(state,list.id,index,index+(action==='up'?-1:1)),unchanged(list));
   if(action==='delete-item')return confirmDeletion('管理項目を削除',`「${e(item.label)}」を削除します。対応リストからも外れ、前回対応日時も消えます。`,()=>commit(state=>model.deleteManagementItem(state,list.id,item.id,item.revision),unchanged(list)));
   if(action==='delete-list')return confirmDeletion('管理リストを削除',`「${e(list.name)}」と全項目を削除します。対応リストからも外れます。この操作は取り消せません。`,async()=>{await commit(state=>model.deleteManagementList(state,list.id),unchanged(list));go('management');});
  });
 });
 return {
  html(page,id){if(page==='actions')return actions();if(!id)return overview();const list=findList(getState(),id);return list?detail(list):'<h1>管理リストが見つかりません</h1><a href="#/management">管理一覧に戻る</a>';},
  attach(page,id){
   const list=findList(getState(),id);
   const stopCards=attachCardInteractions(main,itemId=>page==='actions'?model.actionItems(getState()).find(entry=>entry.item.id===itemId)?.item:list?.items.find(item=>item.id===itemId));
   const stopDrag=list&&!list.orderLocked?attachReorder(main,(from,to)=>void run(()=>commit(state=>model.reorderManagementItems(state,list.id,from,to),unchanged(list)))):()=>{};
   return ()=>{stopDrag();stopCards();};
  }
 };
}
