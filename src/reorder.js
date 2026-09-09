// A dedicated handle preserves ordinary scrolling and checkbox taps on the row.
export function attachReorder(container, move) {
  let active=null, timer=0, frame=0;
  function stop() {
    clearTimeout(timer);cancelAnimationFrame(frame);
    const previous=active;active=null;
    container.querySelectorAll('[data-drop]').forEach(row=>delete row.dataset.drop);
    previous?.row.classList.remove('dragging','drag-pending');
    previous?.ghost?.remove();
    if(previous?.handle.hasPointerCapture(previous.pointerId))previous.handle.releasePointerCapture(previous.pointerId);
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
  function down(event) {
    const handle=event.target.closest('.drag-handle');
    if(active||!handle||event.button!==0)return;
    const row=handle.closest('[data-index]');
    if(!row)return;
    active={row,handle,pointerId:event.pointerId,from:Number(row.dataset.index),to:Number(row.dataset.index),x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};
    handle.setPointerCapture(event.pointerId);row.classList.add('drag-pending');
    timer=setTimeout(lift,450);event.preventDefault();
  }
  function moving(event) {
    if(!active||event.pointerId!==active.pointerId)return;
    active.x=event.clientX;active.y=event.clientY;
    const dx=active.x-active.startX,dy=active.y-active.startY;
    if(!active.ghost){if(Math.hypot(dx,dy)>10)stop();return;}
    active.ghost.style.transform=`translate(${dx}px, ${dy}px)`;target();event.preventDefault();
  }
  function up(event) {
    if(!active||event.pointerId!==active.pointerId)return;
    const {from,to,ghost}=active;stop();if(ghost&&from!==to)move(from,to);
  }
  function cancel(event){if(active&&event.pointerId===active.pointerId)stop();}
  function escape(event){if(event.key==='Escape')stop();}
  function contextMenu(event){if(event.target.closest('.drag-handle'))event.preventDefault();}
  const listeners={pointerdown:down,pointermove:moving,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,contextmenu:contextMenu};
  Object.entries(listeners).forEach(([type,listener])=>container.addEventListener(type,listener));
  document.addEventListener('keydown',escape);window.addEventListener('blur',stop);
  return ()=>{
    stop();Object.entries(listeners).forEach(([type,listener])=>container.removeEventListener(type,listener));
    document.removeEventListener('keydown',escape);window.removeEventListener('blur',stop);
  };
}
