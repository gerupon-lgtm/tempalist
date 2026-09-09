export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function icon(name, size = 20) {
  const paths = {
    check:'<path d="m5 12 4 4L19 6"/>',
    list:'<path d="m3 6 2 2 3-4M11 6h10M3 14l2 2 3-4M11 14h10M11 21h10"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    up:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
    down:'<path d="M12 5v14m-6-6 6 6 6-6"/>',
    grip:'<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="3"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>',
    back:'<path d="m14 5-7 7 7 7"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    template:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 16h6"/>',
    shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.list}</svg>`;
}
export function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message; node.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('visible'), 4000);
}
export function openDialog(title, body, {submit='保存する', onSubmit, onCancel, cancel='キャンセル', destructive=false} = {}) {
  const dialog = document.querySelector('#dialog');
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<form id="dialog-form"><h2 id="dialog-title">${escapeHTML(title)}</h2>${body}<p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" data-dialog-cancel>${escapeHTML(cancel)}</button>${onSubmit ? `<button type="submit" class="${destructive ? 'danger' : 'primary'}">${escapeHTML(submit)}</button>` : ''}</div></form>`;
  const form=dialog.querySelector('form');
  dialog.dataset.initialForm=JSON.stringify([...new FormData(form)]);
  const close = () => {
    if(onSubmit && JSON.stringify([...new FormData(form)])!==dialog.dataset.initialForm){
      if(dialog.querySelector('[data-discard]'))return;
      const confirmation=document.createElement('div');confirmation.className='notice';
      confirmation.innerHTML='<p>保存していない入力があります。</p><button type="button" data-discard>入力を破棄して閉じる</button> <button type="button" data-continue>編集を続ける</button>';
      form.append(confirmation);
      confirmation.querySelector('[data-discard]').onclick=()=>{dialog.close();onCancel?.();};
      confirmation.querySelector('[data-continue]').onclick=()=>confirmation.remove();
      confirmation.querySelector('[data-continue]').focus();return;
    }
    dialog.close(); onCancel?.();
  };
  dialog.querySelector('[data-dialog-cancel]').onclick = close;
  dialog.oncancel = event => { event.preventDefault(); close(); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = dialog.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const result = await onSubmit(new FormData(event.currentTarget));
      if (result !== false && dialog.open) dialog.close();
    } catch (error) { dialog.querySelector('.form-error').textContent = error.message; }
    finally { if (button.isConnected) button.disabled = false; }
  };
  dialog.showModal();
  return dialog;
}
export function confirmAction(title, message, action, submit='実行する', destructive=false) {
  return openDialog(title, `<p>${escapeHTML(message)}</p>`, {submit, destructive, onSubmit:action});
}
export function download(name, text, type='application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
let fieldSequence=0;
export function field(label,content,hint=''){
  const hintId=`field-hint-${++fieldSequence}`;
  if(hint)content=content.replace(/<(input|textarea|select)\b/,`<$1 aria-describedby="${hintId}"`);
  return `<label class="field"><span>${escapeHTML(label)}</span>${content}</label>${hint?`<p class="secondary-text field-hint" id="${hintId}">${escapeHTML(hint)}</p>`:''}`;
}
window.addEventListener('beforeunload',event=>{
  const dialog=document.querySelector('#dialog[open]'),form=dialog?.querySelector('form');
  if(form && dialog.querySelector('[type=submit]') && JSON.stringify([...new FormData(form)])!==dialog.dataset.initialForm){event.preventDefault();event.returnValue='';}
});
