import * as domain from './domain.js';
import {parseDeadline,deadlineFields,getTimeZone} from './dates.js';
import {createStore,storageUsage,WARNING_BYTES,StorageFailure} from './storage.js';
import {exportBackup,importBackup,shareTemplate,readSharedTemplate,parseTransfer} from './transfer.js';
import {APP_VERSION,COPYRIGHT} from './version.js';
import {SAMPLE_TEMPLATES} from './samples.js';
import {escapeHTML as e,openDialog,confirmAction,toast,download,field} from './ui.js';
import * as view from './views.js';
import {attachReorder} from './reorder.js';
import {attachCardInteractions} from './card-interactions.js';
import {createNotificationApi} from './notification/api.js';
import {isUuid} from './notification/api.js';
import {createNotificationRuntime} from './notification/runtime.js';
import {createBrowserDevice,notificationSupport} from './notification/device.js';
const notificationApi=createNotificationApi();
let notificationRuntime=null,notificationBusy=false,serviceWorkerRegistration=null;
function updateNotificationStatus(){
  if(!notificationRuntime)return;
  const info=notificationRuntime.status();
  document.querySelectorAll('[data-notification-status]').forEach(node=>{node.textContent=info.message+(info.pending?`（未同期 ${info.pending}件）`:'');});
  const stop=document.querySelector('[data-action=stop-notifications]');if(stop)stop.disabled=!info.registered;
  const support=document.querySelector('[data-notification-support]');if(support)support.textContent=notificationSupport();
  const update=document.querySelector('[data-action=update-app]');if(update)update.hidden=!serviceWorkerRegistration?.waiting;
}
async function notificationTask(node,task){
  if(notificationBusy)return;notificationBusy=true;node.disabled=true;
  try{await task();}finally{notificationBusy=false;node.disabled=false;updateNotificationStatus();}
}
function notificationSettings(entity){
  openDialog('期限の通知',`<label class="default-lock-field"><input type="checkbox" name="enabled" ${entity.notificationEnabled?'checked':''}>このリストの通知を受け取る</label><p>期限をもとに通知します。通知にはタイトルや項目の内容を表示しません。</p>${[['-24h','24時間前'],['-1h','1時間前']].map(([value,label])=>`<label class="default-lock-field"><input type="checkbox" name="offset" value="${value}" ${entity.offsets.includes(value)?'checked':''}>${label}</label>`).join('')}<p>${e(notificationSupport()||'初回はブラウザから通知の許可を求めます。')}</p>`,{submit:'保存する',onSubmit:async f=>{
    const enabled=f.has('enabled'),offsets=f.getAll('offset');
    // Validate the intended schedule before requesting permission or registering a device.
    domain.setChecklistNotification(domain.updateChecklist(store.read(),entity.id,{offsets}),entity.id,enabled);
    if(enabled)await notificationRuntime.enable();
    await commit(s=>domain.setChecklistNotification(domain.updateChecklist(s,entity.id,{offsets}),entity.id,enabled));
    toast(enabled?'通知設定を保存しました。同期状況は設定画面で確認できます。':'通知をOFFにしました。');
  }});
}
function openReminder(id){
  let checklistId;try{checklistId=isUuid(id)?notificationRuntime?.findChecklist(id):null;}catch{/* Missing mappings fall back to the list overview. */}
  go(checklistId&&state.checklists.some(list=>list.id===checklistId)?'checklist/'+checklistId:'lists');
}
async function checkNotificationConnection(button){
  const status=document.querySelector('#notification-connection-status');
  if(!status||button.disabled)return;
  button.disabled=true;status.textContent='接続を確認しています…';
  try{
    await notificationApi.getPublicKey();
    status.textContent='通知基盤に接続できました。通知は各リストの「通知を設定」からONにできます。';
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
}
const main=document.querySelector('main');
let lastChecklistId=null;
try{lastChecklistId=sessionStorage.getItem('tempalist:last-checklist');}catch{/* Navigation memory is optional. */}
function rememberChecklist(page,id){
  if(page==='lists')lastChecklistId=null;
  else if(page==='checklist')lastChecklistId=id;
  if(!state.checklists.some(list=>list.id===lastChecklistId))lastChecklistId=null;
  try{if(lastChecklistId)sessionStorage.setItem('tempalist:last-checklist',lastChecklistId);else sessionStorage.removeItem('tempalist:last-checklist');}catch{/* Keep the in-memory value when session storage is unavailable. */}
  document.querySelector('[data-nav=lists]').href=lastChecklistId?'#/checklist/'+lastChecklistId:'#/lists';
}
document.querySelector('#version').textContent=`v${APP_VERSION}`;
document.querySelector('#copyright').textContent=COPYRIGHT;
let store,state,listTab='active',templateTab='active',stopDrag=()=>{},stopCards=()=>{},celebrate=false;
const entityIn=(s,kind,id)=>(kind==='template'?s.templates:s.checklists).find(x=>x.id===id);
const locationInfo=()=>{const [,page='lists',id]=location.hash.split('/');return {page,id};};
const go=path=>{location.hash='/'+path;};
function backup(){download(`tempalist-${new Date().toISOString().slice(0,10)}.json`,exportBackup(store.read()));}
async function commit(change,expected=null) {
  const save=()=>{
    const current=store.read();
    if(expected!==null&&!expected(current))throw new StorageFailure('別の画面で更新されました。入力は残っています。内容を控えてから画面を開き直してください。','conflict');
    let next=change(current);
    const expired=domain.expiredChecklistIds(next);
    if(expired.length)next=domain.removeChecklists(next,expired);
    state=store.save(next,current.revision);render();void notificationRuntime?.sync();return state;
  };
  try {return navigator.locks?await navigator.locks.request('tempalist:data',save):save();}
  catch(error){if(error.kind==='quota')capacity(true);throw error;}
}
function action(task){Promise.resolve().then(task).catch(error=>toast(error.message));}
function current(){const {page,id}=locationInfo();return {kind:page,id,entity:entityIn(state,page,id)};}
function input(name,value='',required=false){return `<input name="${name}" value="${e(value)}" ${required?'required':''} autocomplete="off">`;}
function deadlineForm(entity={dueAt:null,dueHasTime:false}) {
  const {date,time}=deadlineFields(entity.dueAt,entity.dueHasTime);
  return `<div class="form-grid">${field('期限の日付',`<input name="date" value="${date}" placeholder="20260910" inputmode="numeric" autocomplete="off">`)}${field('時刻',`<input name="time" value="${time}" placeholder="0900" inputmode="numeric" autocomplete="off">`)}</div><div class="form-grid">${field('カレンダーで選ぶ','<input type="date" data-picker="date" aria-label="日付ピッカー">')}${field('時計で選ぶ','<input type="time" data-picker="time" aria-label="時刻ピッカー">')}</div><p class="secondary-text">日付8桁・時刻4桁でも入力できます。時刻省略時は09:00です。${e(getTimeZone())}</p>`;
}
function bindPickers(dialog){
  dialog.querySelectorAll('[data-picker]').forEach(p=>{p.onchange=()=>{dialog.querySelector(`[name=${p.dataset.picker}]`).value=p.value;};});
  const date=dialog.querySelector('[name=date]'),time=dialog.querySelector('[name=time]');
  if(date)date.onblur=()=>{try{parseDeadline(date.value);if(/^\d{8}$/.test(date.value))date.value=date.value.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1/$2/$3');}catch{/* Partial or invalid input stays editable. */}};
  if(time)time.onblur=()=>{if(/^([01]\d|2[0-3])[0-5]\d$/.test(time.value))time.value=time.value.slice(0,2)+':'+time.value.slice(2);};
}
function newList(templateId=''){
  const templates=state.templates.filter(t=>t.status==='active');
  const selected=templates.find(t=>t.id===templateId);
  const dialog=openDialog('リストを作る',field('テンプレート',`<select name="source"><option value="">空から作る</option>${templates.map(t=>`<option value="${t.id}" ${t.id===templateId?'selected':''}>${e(t.name)}</option>`).join('')}</select>`)+field('タイトル',input('title',selected?.name??'',true))+deadlineForm(),{submit:'作成する',onSubmit:async f=>{
    const saved=await commit(s=>domain.createChecklist(s,{title:f.get('title'),sourceTemplateId:f.get('source')||null,...parseDeadline(f.get('date'),f.get('time'))}));
    go('checklist/'+saved.checklists.at(-1).id);toast('リストを作成しました');
  }});
  dialog.querySelector('[name=source]').onchange=event=>{const t=templates.find(t=>t.id===event.target.value);if(t)dialog.querySelector('[name=title]').value=t.name;};
  bindPickers(dialog);
}
function newTemplate(){openDialog('テンプレートを作る',field('テンプレート名',input('name','',true))+'<label class="default-lock-field"><input type="checkbox" name="defaultOrderLocked"> 作成するリストの並び順をロックする</label>'+field('項目（1行に1項目）','<textarea name="items" placeholder="必要な確認を入力"></textarea>','あとからメモや項目を追加できます。'),{submit:'作成する',onSubmit:async f=>{
  const saved=await commit(s=>domain.createTemplate(s,{name:f.get('name'),defaultOrderLocked:f.has('defaultOrderLocked'),items:f.get('items').split(/\r?\n/).filter(x=>x.trim()).map(label=>({label,note:''}))}));go('template/'+saved.templates.at(-1).id);
}});}
function editMeta(){
  const {kind,id,entity}=current(),unchanged=s=>JSON.stringify(entityIn(s,kind,id))===JSON.stringify(entity);
  const dialog=openDialog(kind==='template'?'テンプレートを編集':'タイトルと期限',kind==='template'?field('テンプレート名',input('name',entity.name,true))+field('状態',`<select name="status">${Object.entries(view.statusName).map(([v,n])=>`<option value="${v}" ${v===entity.status?'selected':''}>${n}</option>`).join('')}</select>`):field('タイトル',input('title',entity.title,true))+deadlineForm(entity),{onSubmit:async f=>{
    await commit(s=>kind==='template'?domain.updateTemplate(s,id,{name:f.get('name'),status:f.get('status'),items:entity.items}):domain.updateChecklist(s,id,{title:f.get('title'),...parseDeadline(f.get('date'),f.get('time'))}),unchanged);
  }});bindPickers(dialog);
}
function mutateItems(s,kind,id,items){return kind==='template'?domain.updateTemplate(s,id,{...entityIn(s,kind,id),items}):domain.updateChecklist(s,id,{items});}
function editItem(itemId){
  const {kind,id,entity}=current(),unchanged=s=>JSON.stringify(entityIn(s,kind,id))===JSON.stringify(entity),item=entity.items.find(i=>i.id===itemId);
  openDialog(item?'項目を編集':'項目を追加',field('項目名',input('label',item?.label??'',true))+field('メモ',`<textarea name="note">${e(item?.note??'')}</textarea>`),{onSubmit:async f=>{
    const value={...(item??{}),label:f.get('label'),note:f.get('note')};
    await commit(s=>mutateItems(s,kind,id,item?entity.items.map(i=>i.id===itemId?value:i):[...entity.items,value]),unchanged);
  }});
}
function writeBack(){
  const {id,entity}=current();const source=state.templates.find(t=>t.id===entity.sourceTemplateId);
  const checklistUnchanged=s=>JSON.stringify(entityIn(s,'checklist',id))===JSON.stringify(entity);
  const sourceUnchanged=s=>source&&JSON.stringify(entityIn(s,'template',source.id))===JSON.stringify(source);
  openDialog('テンプレートに書き戻す',`<p>項目・メモ・並び順を保存します。チェック状態・タイトル・期限は書き戻しません。</p>`+field('保存方法',`<select name="mode">${source?`<option value="overwrite">元の「${e(source.name)}」に上書き</option>`:''}<option value="new">新しいテンプレートとして登録</option></select>`)+field('新規登録する場合の名前',input('name',entity.title,true))+(source?`<p class="notice">上書きを選ぶと元の項目を置き換えます。${source.status==='archived'?'アーカイブから使用中に戻します。':source.status==='draft'?'下書きの状態を維持します。':''}</p>`:''),{submit:'書き戻す',onSubmit:async f=>{
    const mode=f.get('mode');
    await commit(s=>domain.writeBack(s,id,{mode,name:f.get('name')}),s=>checklistUnchanged(s)&&(mode!=='overwrite'||sourceUnchanged(s)));
    toast('テンプレートに保存しました');
  }});
}
function share(){
  const {entity}=current(),data=shareTemplate(entity);
  const dialog=openDialog('テンプレートを共有',`<p class="notice">名前・項目・メモが相手に渡ります。個人情報や社外に出せない情報がないか確認してください。</p>${data.url?field('共有リンク',`<textarea class="share-text" readonly>${e(data.url)}</textarea>`):'<p>共有リンクが長すぎるため、JSONファイルで共有してください。</p>'}<div class="actions">${data.url?'<button type="button" id="copy-link">リンクをコピー</button>':''}<button type="button" id="share-json">共有JSONを保存</button></div>`,{cancel:'閉じる'});
  dialog.querySelector('#share-json').onclick=()=>download('tempalist-template.json',data.json);
  const copy=dialog.querySelector('#copy-link');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(data.url);toast('リンクをコピーしました');}catch{dialog.querySelector('textarea').select();toast('リンクを選択しました。コピーしてください');}};
}
function importPreview(value){
  const shared=value.kind==='template';
  openDialog(shared?'共有テンプレートの確認':'バックアップの取り込み',shared?`<h3>${e(value.name)}</h3><ol class="preview-items">${value.items.map(i=>`<li>${e(i.label)}${i.note?`<br><small>${e(i.note)}</small>`:''}</li>`).join('')}</ol><p>下書きとして追加します。内容を確認してから使用中に切り替えてください。</p>`:`<p>テンプレート ${value.templates.length}件、リスト ${value.checklists.length}件を追加します。</p><p>同じファイルも別データとして追加されます。設定はこの端末のものを維持し、通知はオフになります。現在の保持期間により、期限を過ぎた完了リストは削除されます。</p>`,{submit:shared?'下書きに追加':'追加する',onSubmit:async()=>{
    const saved=await commit(s=>shared?domain.createTemplate(s,{name:value.name,items:value.items,defaultOrderLocked:value.defaultOrderLocked,status:'draft'}):importBackup(s,value));
    go(shared?'template/'+saved.templates.at(-1).id:'lists');toast('データを追加しました');
  }});
}
// A separate modal preserves the underlying form and all unsaved input on quota failure.
function capacity(quota=false){
  if(document.querySelector('#capacity-dialog'))return;
  const saved=store.read(),candidates=saved.checklists.filter(c=>c.status==='settled').sort((a,b)=>a.settledAt.localeCompare(b.settledAt));
  const dialog=document.createElement('dialog');dialog.id='capacity-dialog';dialog.setAttribute('aria-label','保存容量の整理');
  dialog.innerHTML=`<h2>保存容量の整理</h2><p class="${quota?'notice':''}">次のリストを作成するには、保存済みデータを削除して空き容量を確保する必要があります。書き出すだけでは空き容量は増えません。</p><p>完了リスト ${candidates.length}件から削除対象を選んでください。進行中のリストとテンプレートはここでは削除しません。${saved.settings.completedRetention==='keep'?'「削除しない」の設定中です。自動選択・自動削除は行いません。':''}</p><div class="preview-items">${candidates.map(c=>`<label class="capacity-choice"><input type="checkbox" value="${c.id}"> ${e(c.title)}</label>`).join('')||'<p>削除できる完了リストがありません。</p>'}</div><p role="alert" class="form-error"></p><div class="dialog-actions"><button id="capacity-export">JSONを書き出す</button><button id="capacity-cancel">キャンセル</button><button id="capacity-delete" class="danger" disabled>選択した0件を削除</button></div>`;
  document.body.append(dialog);const close=()=>{dialog.close();dialog.remove();};
  dialog.oncancel=event=>{event.preventDefault();close();};dialog.querySelector('#capacity-cancel').onclick=close;
  dialog.querySelector('#capacity-export').onclick=()=>action(backup);
  const ids=()=>[...dialog.querySelectorAll('input:checked')].map(i=>i.value),del=dialog.querySelector('#capacity-delete');
  dialog.onchange=()=>{del.textContent=`選択した${ids().length}件を削除`;del.disabled=!ids().length;};
  del.onclick=async()=>{del.disabled=true;try{await commit(s=>domain.removeChecklists(s,ids()));close();toast('削除しました。保存をもう一度お試しください。');}catch(error){dialog.querySelector('.form-error').textContent=error.message;del.disabled=false;}};
  dialog.showModal();
}
function render(){
  stopDrag();stopCards();if(!state)return;
  const {page,id}=locationInfo();
  rememberChecklist(page,id);
  document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===(page==='template'?'templates':page==='checklist'?'lists':page))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  let bytes=0;try{bytes=storageUsage(localStorage);}catch{/* read errors handled by the store */}
  if(page==='lists')main.innerHTML=view.lists(state,listTab);
  else if(page==='templates')main.innerHTML=view.templates(state,templateTab);
  else if(page==='settings')main.innerHTML=view.settings(state,bytes,APP_VERSION);
  else if(page==='template'||page==='checklist'){
    const entity=entityIn(state,page,id);
    main.innerHTML=entity?view.detail(entity,page):'<div class="empty-state"><h1>リストが見つかりません</h1><p>削除されたか、この端末に保存されていません。</p><a href="#/lists">一覧に戻る</a></div>';
    if(entity)stopCards=attachCardInteractions(main,itemId=>entity.items.find(item=>item.id===itemId));
    if(entity&&(page==='template'||entity.status==='active'&&!entity.orderLocked))stopDrag=attachReorder(main,(from,to)=>action(()=>commit(s=>domain.reorderItems(s,page,id,from,to))));
  } else main.innerHTML='<h1>ページが見つかりません</h1><a href="#/lists">リストへ</a>';
  if(bytes>=WARNING_BYTES)main.insertAdjacentHTML('afterbegin','<div class="notice">保存容量が少なくなっています。バックアップを保存し、不要なデータを整理してください。 <button data-action="capacity">容量を整理する</button></div>');
  const retention=document.querySelector('#retention');if(retention)retention.onchange=()=>{
    const value=retention.value;
    retention.value=state.settings.completedRetention;
    confirmAction('保持期間を変更',value==='keep'?'完了リストを自動削除しない設定に変更します。':'変更後の保持期間を過ぎた完了リストは削除されます。必要なデータは先に書き出してください。',async()=>{await commit(s=>({...s,settings:{...s.settings,completedRetention:value}}));},'変更する');
  };
  const file=document.querySelector('#import-file');if(file)file.onchange=()=>action(async()=>{const selected=file.files[0];file.value='';if(selected)importPreview(parseTransfer(await selected.text()));});
  updateNotificationStatus();
}
main.addEventListener('change',event=>{
  if(!event.target.matches('[data-check]'))return;
  const itemId=event.target.dataset.check,{id}=current();
  action(async()=>{try{await commit(s=>domain.toggleItem(s,id,itemId));}catch(error){render();throw error;}finally{main.querySelector(`[data-check="${itemId}"]`)?.focus({preventScroll:true});}});
});
main.addEventListener('click',event=>{
  const node=event.target.closest('[data-action]');if(!node)return;
  const name=node.dataset.action,{kind,id,entity}=current(),row=node.closest('[data-item]'),itemId=row?.dataset.item,index=Number(row?.dataset.index);
  action(async()=>{
    switch(name){
      case 'notification-settings':return notificationSettings(entity);
      case 'enable-notifications':return notificationTask(node,async()=>{await notificationRuntime.enable();await notificationRuntime.sync();});
      case 'retry-notifications':return notificationTask(node,()=>notificationRuntime.retry());
      case 'stop-notifications':return confirmAction('この端末の通知を停止','この端末のすべての通知予約を取り消します。通信できない場合は取消が保留され、通知が届くことがあります。',async()=>{
        await commit(s=>({...s,checklists:s.checklists.map(list=>({...list,notificationEnabled:false}))}));await notificationRuntime.disable();
      },'停止する');
      case 'update-app':return serviceWorkerRegistration?.waiting?.postMessage({type:'tempalist:activate-update'});
      case 'check-notification-connection':return checkNotificationConnection(node);
      case 'new-list':return newList();case 'from-template':return newList(node.dataset.id);
      case 'new-template':return newTemplate();
      case 'list-tab':listTab=node.dataset.value;return render();
      case 'template-tab':templateTab=node.dataset.value;return render();
      case 'edit-meta':return editMeta();case 'add-item':return editItem();case 'edit-item':return editItem(itemId);
      case 'toggle-order-lock':return commit(s=>kind==='template'?domain.updateTemplate(s,id,{...entityIn(s,kind,id),defaultOrderLocked:!entity.defaultOrderLocked}):domain.updateChecklist(s,id,{orderLocked:!entity.orderLocked}));
      case 'up':case 'down':return commit(s=>domain.reorderItems(s,kind,id,index,index+(name==='up'?-1:1)));
      case 'delete-item':return confirmAction('項目を削除','この項目を削除します。',()=>commit(s=>mutateItems(s,kind,id,entityIn(s,kind,id).items.filter(i=>i.id!==itemId))),'削除する',true);
      case 'delete-entity':return confirmAction('削除の確認',`「${entity.title??entity.name}」を削除します。この操作は取り消せません。`,async()=>{await commit(s=>kind==='template'?domain.deleteTemplate(s,id):domain.deleteChecklist(s,id));go(kind==='template'?'templates':'lists');},'削除する',true);
      case 'duplicate':{const saved=await commit(s=>domain.duplicateTemplate(s,id));go('template/'+saved.templates.at(-1).id);return;}
      case 'settle':{
        const settle=async()=>{await commit(s=>domain.settleChecklist(s,id));listTab='settled';celebrate=true;go('lists');toast('おつかれさまでした。完了を保存しました');};
        const remaining=entity.items.filter(i=>!i.checked).length;
        if(remaining)return confirmAction('未チェックの項目があります',`${remaining}項目が未チェックです。このまま完了を確定しますか？`,settle,'このまま確定する');
        return settle();
      }
      case 'reopen':await commit(s=>domain.reopenChecklist(s,id));return toast('チェック状態を保持して再開しました');
      case 'write-back':return writeBack();case 'share':return share();
      case 'export':return backup();case 'import':return document.querySelector('#import-file').click();case 'capacity':return capacity();
    }
  });
});
function route(){
  if(location.hash.startsWith('#t=')){
    render();try{importPreview(readSharedTemplate(location.href));}catch(error){toast(error.message);}return;
  }
  render();main.classList.toggle('settled-flash',celebrate);celebrate=false;main.focus({preventScroll:true});window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);
window.addEventListener('online',()=>void notificationRuntime?.sync());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void notificationRuntime?.sync();void serviceWorkerRegistration?.update();}});
window.addEventListener('storage',event=>{if(event.key==='tempalist:notification')updateNotificationStatus();});
window.addEventListener('storage',event=>{if(event.key==='tempalist:data'){try{state=store.read();render();toast('別の画面の変更を反映しました');}catch(error){toast(error.message);}}});
try {
  store=createStore(localStorage,domain.validateState);
  const initialize=()=>{
    let initial=domain.emptyState();for(const template of SAMPLE_TEMPLATES)initial=domain.createTemplate(initial,template);
    state=store.initialize(initial);
    const expired=domain.expiredChecklistIds(state);if(expired.length)state=store.save(domain.removeChecklists(state,expired),state.revision);
  };
  if(navigator.locks)await navigator.locks.request('tempalist:data',initialize);else initialize();
  notificationRuntime=createNotificationRuntime({storage:localStorage,api:notificationApi,device:createBrowserDevice(),readLists:()=>store.read().checklists,onChange:updateNotificationStatus});
  route();
  const reminderId=new URL(location.href).searchParams.get('reminderId');
  if(reminderId){history.replaceState(null,'',location.pathname+location.hash);openReminder(reminderId);}
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',event=>{if(event.source?.scriptURL===new URL('/sw.js',location.origin).href&&event.data?.type==='tempalist:notification-click')openReminder(event.data.reminderId);});
    let controlled=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controlled)location.reload();controlled=true;});
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
      serviceWorkerRegistration=reg;updateNotificationStatus();
      reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',updateNotificationStatus));
      void notificationRuntime.sync();
    }).catch(()=>{toast('オフライン・通知の準備ができませんでした。再読み込みしてください。');});
  }
} catch(error){
  main.innerHTML=`<div class="notice"><h1>保存データを確認してください</h1><p>${e(error.message)}</p><button id="rescue">元データを書き出す</button><p>保存データは上書きしていません。書き出したファイルを保管し、復旧をご相談ください。</p></div>`;
  document.querySelector('#rescue').onclick=()=>action(()=>download('tempalist-recovery.txt',store?.raw()??'保存データにアクセスできません','text/plain'));
}
