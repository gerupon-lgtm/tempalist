// Only handles start a drag. Checkboxes and horizontal swipes remain ordinary input.
export function attachReorder(container, move) {
  let active=null, frame=0;
  function stop() {
    cancelAnimationFrame(frame);
    container.querySelectorAll('[data-drop]').forEach(row=>delete row.dataset.drop);
    active?.row.classList.remove('dragging');
    active=null;
  }
  function target() {
    if (!active) return;
    const rows=[...container.querySelectorAll('[data-index]')];
    let index=rows.findIndex(row=>active.y < row.getBoundingClientRect().bottom);
    if (index<0) index=rows.length-1;
    active.to=index;
    rows.forEach(row=>delete row.dataset.drop);
    if(index!==active.from) rows[index].dataset.drop=index>active.from?'below':'above';
  }
  function scroll() {
    if(!active)return;
    const edge=85, y=active.y;
    const speed=y<edge ? -Math.ceil((edge-y)/5) : y>innerHeight-edge ? Math.ceil((y-innerHeight+edge)/5) : 0;
    if(speed) { window.scrollBy(0,speed);target(); }
    frame=requestAnimationFrame(scroll);
  }
  container.onpointerdown=event=>{
    const handle=event.target.closest('.drag-handle');
    if(!handle || event.button!==0)return;
    const row=handle.closest('[data-index]');
    active={row,handle,from:Number(row.dataset.index),to:Number(row.dataset.index),y:event.clientY};
    handle.setPointerCapture(event.pointerId); row.classList.add('dragging');
    frame=requestAnimationFrame(scroll);event.preventDefault();
  };
  container.onpointermove=event=>{if(active){active.y=event.clientY;target();}};
  container.onpointerup=()=>{
    if(!active)return;
    const {from,to}=active;stop();if(from!==to)move(from,to);
  };
  container.onpointercancel=stop;
  container.onlostpointercapture=stop;
  return stop;
}
