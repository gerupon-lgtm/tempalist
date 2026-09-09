// Menus dismiss outside; only visually truncated notes need an expanded reader.
export function attachCardInteractions(container, itemFor) {
  const panel=document.createElement('section');
  panel.id='note-panel';panel.hidden=true;panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','note-panel-title');
  panel.innerHTML='<div class="note-panel-heading"><h2 id="note-panel-title"></h2><button type="button" aria-label="メモを閉じる">閉じる</button></div><p class="note-panel-body"></p>';
  document.body.append(panel);
  let selected=null,suppressClick=false,disposed=false;
  function close(restore=false){
    panel.hidden=true;selected?.setAttribute('aria-expanded','false');
    if(restore&&selected?.isConnected)selected.focus({preventScroll:true});
    selected=null;
  }
  function closeMenus(except=null){container.querySelectorAll('.item-menu[open]').forEach(menu=>{if(menu!==except)menu.open=false;});}
  function read(trigger,keyboard=false){
    const item=itemFor(trigger.closest('[data-item]').dataset.item);if(!item?.note)return;
    if(selected===trigger&&!panel.hidden){close(keyboard);return;}
    close();closeMenus();selected=trigger;
    panel.querySelector('h2').textContent=item.label;
    panel.querySelector('.note-panel-body').textContent=item.note;
    trigger.setAttribute('aria-expanded','true');panel.hidden=false;
    if(keyboard)panel.querySelector('button').focus({preventScroll:true});
  }
  function measure(){
    if(disposed)return;
    container.querySelectorAll('.item-note').forEach(note=>{
      const trigger=note.closest('.item-copy');
      const clipped=note.scrollHeight>note.clientHeight+1;
      if(clipped){
        trigger.dataset.noteTrigger='';trigger.tabIndex=0;trigger.setAttribute('role','button');
        trigger.setAttribute('aria-controls','note-panel');
        if(!trigger.hasAttribute('aria-expanded'))trigger.setAttribute('aria-expanded','false');
        if(!trigger.querySelector('.note-more')){
          const hint=document.createElement('span');hint.className='note-more';hint.textContent='続きを読む';trigger.append(hint);
        }
      }else{
        if(selected===trigger)close();
        delete trigger.dataset.noteTrigger;
        for(const attr of ['tabindex','role','aria-controls','aria-expanded'])trigger.removeAttribute(attr);
        trigger.querySelector('.note-more')?.remove();
      }
    });
  }
  function pointer(event){
    suppressClick=false;
    closeMenus(event.target.closest('.item-menu'));
    if(!panel.contains(event.target)&&!selected?.contains(event.target))close();
  }
  function consumed(){suppressClick=true;close();closeMenus();}
  function click(event){
    const row=event.target.closest('.item-row');
    if(suppressClick&&row&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();return;}
    const menu=event.target.closest('.item-menu');closeMenus(menu);
    if(event.target.closest('[data-action]'))closeMenus();
    if(panel.contains(event.target))return;
    if(event.target.closest('.row-check,.row-controls,input,button,a,label,summary,details')){close();return;}
    const trigger=row?.querySelector('[data-note-trigger]');
    if(trigger)read(trigger);else close();
  }
  function key(event){
    if(event.key==='Escape'){close(true);closeMenus();return;}
    const trigger=event.target.closest('[data-note-trigger]');
    if(trigger&&(event.key==='Enter'||event.key===' ')){event.preventDefault();read(trigger,true);}
  }
  panel.querySelector('button').onclick=()=>close(true);
  document.addEventListener('pointerdown',pointer);
  document.addEventListener('click',click,true);
  document.addEventListener('keydown',key);
  container.addEventListener('card-gesture-consumed',consumed);
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  container.querySelectorAll('.item-note').forEach(note=>resize?.observe(note));
  measure();document.fonts?.ready.then(measure);
  return ()=>{
    disposed=true;resize?.disconnect();close();panel.remove();
    document.removeEventListener('pointerdown',pointer);document.removeEventListener('click',click,true);
    document.removeEventListener('keydown',key);container.removeEventListener('card-gesture-consumed',consumed);
  };
}
