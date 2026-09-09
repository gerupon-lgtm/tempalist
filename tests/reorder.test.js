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
  document.body.innerHTML='<main><ol>'+[0,1,2].map(i=>`<li class="item-row" data-index="${i}"><input type="checkbox"><span>項目 ${i}</span><button class="drag-handle">移動</button></li>`).join('')+'</ol></main>';
  container=document.querySelector('main');handle=container.querySelector('.drag-handle');move=vi.fn();
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
