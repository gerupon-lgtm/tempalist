import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {attachReorder} from '../src/reorder.js';

let container,handle,move,dispose;
function pointer(type,x=300,y=240,id=1) {
  const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});
  Object.defineProperty(event,'pointerId',{value:id});
  handle.dispatchEvent(event);
}
beforeEach(()=>{
  vi.useFakeTimers();
  document.body.innerHTML='<main><ol>'+[0,1,2].map(i=>`<li class="item-row" data-index="${i}"><label class="row-check"><input type="checkbox"></label><span class="item-copy">項目 ${i}</span><div class="row-controls"><button>上へ</button></div></li>`).join('')+'</ol></main>';
  container=document.querySelector('main');handle=container.querySelector('.item-row');move=vi.fn();
  handle.setPointerCapture=vi.fn();handle.hasPointerCapture=()=>true;handle.releasePointerCapture=vi.fn();
  container.querySelectorAll('li').forEach((row,i)=>row.getBoundingClientRect=()=>({left:20,top:200+i*80,bottom:280+i*80,width:330,height:80}));
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  dispose=attachReorder(container,move);
});
afterEach(()=>{dispose();vi.useRealTimers();vi.unstubAllGlobals();});
it('requires a long press; a short tap never lifts or moves a row',()=>{
  pointer('pointerdown');expect(container.querySelector('.dragging')).toBeNull();
  vi.advanceTimersByTime(100);pointer('pointerup');vi.advanceTimersByTime(600);
  expect(document.querySelector('.drag-preview')).toBeNull();expect(move).not.toHaveBeenCalled();
});
it('lifts a noninteractive card and saves the destination only on release',()=>{
  pointer('pointerdown');vi.advanceTimersByTime(500);
  const ghost=document.querySelector('.drag-preview');expect(ghost).not.toBeNull();
  expect(ghost.getAttribute('aria-hidden')).toBe('true');expect(ghost.hasAttribute('inert')).toBe(true);
  pointer('pointermove',305,410);expect(ghost.style.transform).toContain('170px');
  expect(move).not.toHaveBeenCalled();pointer('pointerup',305,410);
  expect(move).toHaveBeenCalledExactlyOnceWith(0,2);expect(document.querySelector('.drag-preview')).toBeNull();
});
it('cancels a swipe before activation',()=>{
  pointer('pointerdown');pointer('pointermove',330,242);vi.advanceTimersByTime(600);
  expect(document.querySelector('.drag-preview')).toBeNull();pointer('pointerup');expect(move).not.toHaveBeenCalled();
});
it.each(['pointercancel','lostpointercapture','escape','dispose'])('cancels without saving on %s',reason=>{
  pointer('pointerdown');vi.advanceTimersByTime(500);pointer('pointermove',300,410);
  if(reason==='escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  else if(reason==='dispose')dispose();else pointer(reason);
  pointer('pointerup');expect(move).not.toHaveBeenCalled();expect(document.querySelector('.drag-preview')).toBeNull();
});
it('ignores another pointer while dragging',()=>{
  pointer('pointerdown');vi.advanceTimersByTime(500);pointer('pointermove',300,410,2);pointer('pointerup',300,410,2);
  expect(document.querySelector('.drag-preview')).not.toBeNull();pointer('pointerup');expect(move).not.toHaveBeenCalled();
});
it('leaves checkbox input alone',()=>{
  container.querySelector('input').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));
  vi.advanceTimersByTime(500);expect(document.querySelector('.drag-preview')).toBeNull();
});

it.each(['.row-check','.row-controls','.row-controls button'])('excludes the checkbox and right controls (%s)',selector=>{
  container.querySelector(selector).dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));
  vi.advanceTimersByTime(500);expect(document.querySelector('.drag-preview')).toBeNull();
});
it('starts from the item text as well as row padding',()=>{
  const event=new MouseEvent('pointerdown',{bubbles:true,button:0,clientX:200,clientY:240});
  Object.defineProperty(event,'pointerId',{value:1});container.querySelector('.item-copy').dispatchEvent(event);
  vi.advanceTimersByTime(500);expect(document.querySelector('.drag-preview')).not.toBeNull();
});

function touch(type,x=200,y=240,count=1) {
  const event=new Event(type,{bubbles:true,cancelable:true});
  const point={identifier:7,clientX:x,clientY:y};
  Object.defineProperties(event,{changedTouches:{value:[point]},touches:{value:type==='touchend'?[]:Array.from({length:count},()=>point)}});
  handle.dispatchEvent(event);return event;
}
it('allows touch scrolling before lift and prevents it only while dragging',()=>{
  expect(touch('touchstart').defaultPrevented).toBe(false);
  vi.advanceTimersByTime(100);expect(touch('touchmove',200,245).defaultPrevented).toBe(false);
  vi.advanceTimersByTime(400);expect(document.querySelector('.drag-preview')).not.toBeNull();
  expect(touch('touchmove',200,410).defaultPrevented).toBe(true);touch('touchend',200,410);
  expect(move).toHaveBeenCalledExactlyOnceWith(0,2);
});
it('lets an ordinary touch swipe scroll without reordering',()=>{
  touch('touchstart');expect(touch('touchmove',200,270).defaultPrevented).toBe(false);
  vi.advanceTimersByTime(500);expect(document.querySelector('.drag-preview')).toBeNull();touch('touchend');
  expect(move).not.toHaveBeenCalled();
});
it('cancels a lifted touch card on a second finger',()=>{
  touch('touchstart');vi.advanceTimersByTime(500);expect(document.querySelector('.drag-preview')).not.toBeNull();
  touch('touchstart',200,410,2);expect(document.querySelector('.drag-preview')).toBeNull();touch('touchend');
  expect(move).not.toHaveBeenCalled();
});
