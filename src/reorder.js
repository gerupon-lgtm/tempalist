// Touch Events let a pending press remain native scrolling until the card is lifted.
export function attachReorder(container, move) {
  let active=null,timer=0,frame=0;
  const excluded='.row-check,.row-controls,input,button,a,label,summary,details';
  function rowAt(target) {
    if(target.closest(excluded))return null;
    return target.closest('.item-row[data-index]');
  }
  function stop() {
    clearTimeout(timer);cancelAnimationFrame(frame);
    const previous=active;active=null;
    container.querySelectorAll('[data-drop]').forEach(row=>delete row.dataset.drop);
    previous?.row.classList.remove('dragging','drag-pending');
    previous?.ghost?.remove();
    if(previous?.input==='pointer'&&previous.row.hasPointerCapture(previous.id))previous.row.releasePointerCapture(previous.id);
  }
  function target() {
    const rows=[...container.querySelectorAll('[data-index]')];
    const others=rows.filter(row=>row!==active.row);
    let index=others.findIndex(row=>active.y < row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);
    if(index<0)index=others.length;
    active.to=index;
    rows.forEach(row=>delete row.dataset.drop);
    if(index!==active.from)rows[index].dataset.drop=index>active.from?'below':'above';
  }
  function scroll() {
    if(!active?.ghost)return;
    const edge=85,y=active.y;
    const speed=y<edge ? -Math.min(18,Math.ceil((edge-y)/5)) : y>innerHeight-edge ? Math.min(18,Math.ceil((y-innerHeight+edge)/5)) : 0;
    if(speed){window.scrollBy(0,speed);target();}
    frame=requestAnimationFrame(scroll);
  }
  function lift() {
    if(!active)return;
    container.dispatchEvent(new Event('card-gesture-consumed'));
    const {row}=active,rect=row.getBoundingClientRect();
    const ghost=row.cloneNode(true);
    ghost.classList.remove('drag-pending');ghost.classList.add('drag-preview');
    ghost.removeAttribute('data-index');ghost.removeAttribute('data-item');
    ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');
    ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    ghost.querySelectorAll('details').forEach(node=>node.removeAttribute('open'));
    ghost.style.left=`${rect.left}px`;ghost.style.top=`${rect.top}px`;
    ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;
    document.body.append(ghost);active.ghost=ghost;
    row.classList.remove('drag-pending');row.classList.add('dragging');
    frame=requestAnimationFrame(scroll);
  }
  function begin(row,input,id,x,y) {
    active={row,input,id,from:Number(row.dataset.index),to:Number(row.dataset.index),x,y,startX:x,startY:y};
    row.classList.add('drag-pending');timer=setTimeout(lift,450);
  }
  function moving(x,y) {
    active.x=x;active.y=y;
    const dx=x-active.startX,dy=y-active.startY;
    if(!active.ghost){if(Math.hypot(dx,dy)>10){container.dispatchEvent(new Event('card-gesture-consumed'));stop();}return;}
    active.ghost.style.transform=`translate(${dx}px, ${dy}px)`;target();
  }
  function finish() {
    const {from,to,ghost}=active;stop();if(ghost&&from!==to)move(from,to);
  }
  function down(event) {
    if(event.pointerType==='touch'||active||event.button!==0)return;
    const row=rowAt(event.target);if(!row)return;
    begin(row,'pointer',event.pointerId,event.clientX,event.clientY);
    row.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function pointerMove(event) {
    if(active?.input!=='pointer'||event.pointerId!==active.id)return;
    moving(event.clientX,event.clientY);event.preventDefault();
  }
  function up(event){if(active?.input==='pointer'&&event.pointerId===active.id)finish();}
  function cancel(event){if(active?.input==='pointer'&&event.pointerId===active.id)stop();}
  function touchStart(event) {
    if(event.touches.length!==1){stop();return;}
    if(active)return;
    const row=rowAt(event.target);if(!row)return;
    const touch=event.changedTouches[0];begin(row,'touch',touch.identifier,touch.clientX,touch.clientY);
  }
  function touchMove(event) {
    if(active?.input!=='touch')return;
    if(event.touches.length!==1){stop();return;}
    const touch=[...event.changedTouches].find(t=>t.identifier===active.id);if(!touch)return;
    if(active.ghost){
      if(!event.cancelable){stop();return;}
      event.preventDefault();
    }
    moving(touch.clientX,touch.clientY);
  }
  function touchEnd(event){if(active?.input==='touch'&&[...event.changedTouches].some(t=>t.identifier===active.id))finish();}
  function touchCancel(){if(active?.input==='touch')stop();}
  function escape(event){if(event.key==='Escape')stop();}
  function contextMenu(event){if(rowAt(event.target))event.preventDefault();}
  const listeners={pointerdown:down,pointermove:pointerMove,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,touchstart:touchStart,touchmove:touchMove,touchend:touchEnd,touchcancel:touchCancel,contextmenu:contextMenu};
  Object.entries(listeners).forEach(([type,listener])=>container.addEventListener(type,listener,{passive:false}));
  document.addEventListener('keydown',escape);window.addEventListener('blur',stop);
  return ()=>{
    stop();Object.entries(listeners).forEach(([type,listener])=>container.removeEventListener(type,listener));
    document.removeEventListener('keydown',escape);window.removeEventListener('blur',stop);
  };
}
