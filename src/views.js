import {escapeHTML as e,icon} from './ui.js';
import {formatDateTime,isOverdue} from './dates.js';
export const statusName={active:'使用中',draft:'下書き',archived:'アーカイブ'};
export const button=(action,label,style='',extra='')=>`<button data-action="${action}" class="${style}" ${extra}>${label}</button>`;
export const heading=(title,sub,action='',className='')=>`<div class="page-heading ${e(className)}"><div><h1>${e(title)}</h1><p>${e(sub)}</p></div>${action}</div>`;
function labelUnits(text){
  // Approximate full-width character units; Latin letters need less room than Japanese.
  const units=Array.from(text).reduce((width,char)=>width+(/[\u0020-\u007e\uff61-\uff9f]/.test(char)?.6:/\p{Mark}/u.test(char)?0:1),0);
  return [8,10,12,14,16,18,20,24,32,48,64].find(size=>size>=units)??64;
}
export function items(entity,kind) {
  const locked=kind==='checklist' && entity.status==='settled';
  const orderLocked=kind==='checklist' && entity.orderLocked;
  if(!entity.items.length)return '<div class="empty-state"><h2>項目を追加しましょう</h2><p>ひとつずつ、必要な確認を書き留められます。</p></div>';
  return `${locked||orderLocked||kind==='checklist'?'':'<p class="reorder-hint">カードを長押しして移動 ／ 右端の↑↓でも移動</p>'}<ol class="items">${entity.items.map((item,index)=>`<li class="item-row ${locked||orderLocked?'':'reorderable'} ${item.checked?'checked':''}" data-index="${index}" data-item="${item.id}">
    ${kind==='checklist'?`<label class="row-check"><input type="checkbox" data-check="${item.id}" aria-label="${e(item.label)}" ${item.checked?'checked':''} ${locked?'disabled':''}></label>`:`<span class="item-number">${index+1}</span>`}
    <div class="item-copy"><span class="item-label" data-label-units="${labelUnits(item.label)}">${e(item.label)}</span>${item.note?`<span class="item-note">${e(item.note)}</span>`:''}</div>
    ${locked?'':`<div class="row-controls"><details class="item-menu"><summary aria-label="${e(item.label)}の操作">⋯</summary><div class="menu-actions">${button('edit-item','編集')}${button('delete-item','削除','danger')}</div></details><div class="row-stepper" ${orderLocked?'hidden':''}>${button('up',icon('up',18),'step-button',`aria-label="上へ" title="上へ" ${index===0?'disabled':''}`)}${button('down',icon('down',18),'step-button',`aria-label="下へ" title="下へ" ${index===entity.items.length-1?'disabled':''}`)}</div></div>`}
  </li>`).join('')}</ol>`;
}
export function listCard(list) {
  const checked=list.items.filter(i=>i.checked).length;
  return `<a class="list-card" href="#/checklist/${list.id}"><div class="card-copy"><h2>${e(list.title)}</h2><div class="meta-line">${list.status==='settled'?`<span>完了 ${e(formatDateTime(list.settledAt))}</span>`:`<span>${icon('clock',15)} ${e(formatDateTime(list.dueAt,{dateOnly:!list.dueHasTime}))}</span>${isOverdue(list.dueAt)?'<span class="badge overdue">期限を過ぎています</span>':''}`}</div><div class="progress-track"><progress max="${list.items.length||1}" value="${checked}" aria-label="チェックの進捗"></progress></div></div><span class="progress-count">${checked} / ${list.items.length}</span>${icon('arrow',18)}</a>`;
}
export function lists(state,tab) {
  const active=state.checklists.filter(c=>c.status==='active'),settled=state.checklists.filter(c=>c.status==='settled');
  const shown=tab==='active'?active.sort((a,b)=>(a.dueAt??'z').localeCompare(b.dueAt??'z')):settled.sort((a,b)=>b.settledAt.localeCompare(a.settledAt));
  return heading('いつもの段取りを、ひとつずつ。','今日の確認も、次の準備も。',button('new-list','リストを作る','primary'))+
    `<div class="tabs" role="tablist" aria-label="リストの状態">${['active','settled'].map((s,i)=>button('list-tab',`${i?'完了':'進行中'} <span class="count">${i?settled.length:active.length}</span>`,'',`role="tab" aria-selected="${s===tab}" data-value="${s}"`)).join('')}</div>`+
    (shown.length?`<div class="list-stack">${shown.map(listCard).join('')}</div>`:`<div class="empty-state"><div class="empty-mark">${icon('list',33)}</div><h2>${tab==='active'?'いま、進行中のリストはありません':'完了したリストがここに並びます'}</h2><p>${tab==='active'?'テンプレートから、または空のリストから。必要な確認だけを、手元に。':'チェックを終えたら「完了を確定する」で保存できます。'}</p>${button('new-list','リストを作る','primary')}</div>`)+
    `<section class="template-start"><div class="section-head"><h2>テンプレートから始める</h2><a href="#/templates">すべて見る</a></div><div class="template-grid">${state.templates.filter(t=>t.status==='active').map(t=>button('from-template',`<span class="tile-icon">${icon('template')}</span><span>${e(t.name)}</span><small>${t.items.length}項目</small>`,'template-tile',`data-id="${t.id}"`)).join('')||'<p class="muted">使用中のテンプレートがありません。</p>'}</div></section>`;
}
export function templates(state,tab) {
  const shown=state.templates.filter(t=>t.status===tab);
  return heading('テンプレート','繰り返す段取りを、自分の型に。',button('new-template','新しく作る','primary'))+
    `<div class="tabs" role="tablist" aria-label="テンプレートの状態">${Object.entries(statusName).map(([s,n])=>button('template-tab',`${n} <span class="count">${state.templates.filter(t=>t.status===s).length}</span>`,'',`role="tab" aria-selected="${s===tab}" data-value="${s}"`)).join('')}</div>`+
    `<div class="list-stack">${shown.map(t=>`<a class="list-card" href="#/template/${t.id}"><div class="card-copy"><h2>${e(t.name)}</h2><span class="meta-line">${t.items.length}項目 · 更新 ${e(formatDateTime(t.updatedAt,{dateOnly:true}))}</span></div>${icon('arrow')}</a>`).join('')||`<div class="empty-state"><h2>${statusName[tab]}のテンプレートはありません</h2>${button('new-template','テンプレートを作る','primary')}</div>`}</div>`;
}
function orderLockControl(entity,kind) {
  const template=kind==='template',on=template?entity.defaultOrderLocked:entity.orderLocked;
  const disabled=!template&&entity.status==='settled';
  const label=template?'作成するリストの並び順ロック':'並び順ロック';
  return `<section class="order-lock-setting"><div><strong>${label}</strong><p>${template?'新しいリストの初期設定です。作成後も切り替えられます。':disabled?'完了確定済みです。切り替えるには再開してください。':on?'並べ替えを防ぎます。チェック・編集はそのまま使えます。':'カードの長押しや↑↓で並べ替えできます。'}</p></div>${button('toggle-order-lock',`<span class="switch-track" aria-hidden="true"></span><span>${on?'ON':'OFF'}</span>`,'order-lock-switch',`role="switch" aria-label="${label}" aria-checked="${Boolean(on)}" ${disabled?'disabled':''}`)}</section>`;
}
export function detail(entity,kind) {
  const checklist=kind==='checklist',locked=checklist&&entity.status==='settled',checked=entity.items.filter(i=>i.checked).length;
  return `<a class="back" href="#/${checklist?'lists':'templates'}">${icon('back',16)} 一覧に戻る</a>`+
    heading(entity.title??entity.name,checklist?'ひとつずつ確認していきましょう。':`${statusName[entity.status]} · チェックリストのひな型`,locked?'':button('edit-meta','編集'),'detail-heading')+
    (locked?`<div class="lock-note">${icon('check')} 完了 ${e(formatDateTime(entity.settledAt))} · 備考はこのまま編集できます。項目を変更するには再開してください。</div>`:'')+
    (checklist?`<div class="detail-info"><div><p>${icon('clock',18)} ${e(formatDateTime(entity.dueAt,{dateOnly:!entity.dueHasTime}))}</p><p class="notification-note">通知：${entity.notificationEnabled?'ON':'OFF'} ${locked?'':button('notification-settings','通知を設定','notification-link')}</p></div><span class="progress-count">${checked} / ${entity.items.length}</span></div>`:`<div class="actions template-actions">${entity.status==='active'?button('from-template','この型でリストを作る','primary',`data-id="${entity.id}"`):''}${button('duplicate','複製')}${button('share','共有')}</div>`)+
    orderLockControl(entity,kind)+items(entity,kind)+(locked?'':button('add-item',`${icon('plus',18)} 項目を追加`,'add-item'))+
    (checklist?`<section class="checklist-remarks" aria-labelledby="remarks-label"><label id="remarks-label" for="checklist-remarks">リスト全体の備考</label><textarea id="checklist-remarks" rows="3" aria-describedby="remarks-help remarks-status" placeholder="確認事項や申し送りを記入">${e(entity.remarks)}</textarea><p id="remarks-help" class="secondary-text">完了前・完了後とも編集できます。</p><div class="actions">${button('save-remarks','備考を保存','','disabled')}<span id="remarks-status" role="status" class="secondary-text">保存済み</span></div>${button('export-checklist','メール・記録を書き出す','record-export')}</section>`:'')+
    `<div class="detail-bottom"><div class="actions">${checklist?button('write-back','テンプレートに書き戻す'):''}${button('delete-entity',checklist?'リストを削除':'テンプレートを削除','danger-link')}</div>${checklist?button(locked?'reopen':'settle',locked?'再開する':'完了を確定する','primary'):''}</div>`;
}
export function settings(state,bytes,version) {
  return heading('設定とデータ','この端末のブラウザに保存しています。')+pwaSettings()+`<div class="settings-grid"><section class="settings-panel"><h2>完了リストの保持期間</h2><label for="retention">完了を確定した日から</label><select id="retention">${[['30d','30日'],['90d','90日'],['365d','1年（365日）'],['keep','削除しない']].map(([v,n])=>`<option value="${v}" ${v===state.settings.completedRetention?'selected':''}>${n}</option>`).join('')}</select><p>期間を過ぎた完了リストは、起動時に削除します。進行中のリストとテンプレートは対象外です。</p></section><section class="settings-panel"><h2>バックアップと取り込み</h2><p>ブラウザのデータを消すと、リストも失われます。大切なデータはファイルに保存してください。</p><div class="actions">${button('export','JSONを書き出す')}${button('import','JSONを取り込む')}</div><p>共有された .json.txt ファイルも取り込めます。</p><input class="file-input" id="import-file" type="file" accept=".json,.txt,application/json,text/plain"></section><section class="settings-panel"><h2>保存容量の整理</h2><p>使用量の目安 ${(bytes/1024).toFixed(1)} KB<br>保存できる量はブラウザによって異なります。</p>${button('capacity','完了リストを整理する')}</section><section class="settings-panel"><h2>通知</h2><p data-notification-status></p><p data-notification-support></p><div class="actions">${button('enable-notifications','この端末で通知を使う')}${button('retry-notifications','通知の同期を再試行')}${button('stop-notifications','この端末の通知を停止')}</div><p>通知を受け取りたいリストで「通知を設定」を開き、24時間前・1時間前・期限ちょうどから選んでください。通信できない間は予約・取消が保留されます。</p>${button('check-notification-connection','接続を確認する')}<p id="notification-connection-status" role="status" aria-live="polite">まだ確認していません。</p></section><section class="settings-panel"><h2>このアプリについて</h2><p>NOT EQUAL TEMPALIST<br>バージョン ${e(version)}<br>通知の内容は端末内で表示します。</p><p>テンプレートとチェック内容はサーバーに送信しません。</p></section></div>`;
}

function pwaSettings(){
 return `<section class="settings-panel pwa-settings"><h2>アプリのインストール・更新</h2><p data-install-help></p><button type="button" data-pwa-action="install" hidden>アプリをインストール</button><div class="actions"><button type="button" data-pwa-action="check">更新を確認する</button><button type="button" data-pwa-action="update" class="primary" hidden>新しいバージョンに更新</button></div><p data-pwa-message role="status"></p><p>更新しても保存済みリスト・テンプレートは残ります。</p><a href="/update/">更新できない場合はこちら</a></section>`;
}
