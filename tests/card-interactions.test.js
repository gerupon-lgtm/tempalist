import {afterEach,beforeEach,expect,it} from 'vitest';
import {attachCardInteractions} from '../src/card-interactions.js';

let dispose,main;
beforeEach(()=>{
 document.body.innerHTML='<main>'+[0,1].map(i=>`<div class="item-row" data-item="${i}"><label class="row-check"><input type="checkbox"></label><div class="item-copy" data-note-trigger tabindex="0" role="button">項目</div><div class="row-controls"><details class="item-menu"><summary>操作</summary><button>編集</button></details></div></div>`).join('')+'</main><button id="outside">外側</button>';
 main=document.querySelector('main');
 dispose=attachCardInteractions(main,id=>({label:`項目 ${id}`,note:'確認のメモ\n<img src=x onerror=alert(1)>'}));
});
afterEach(()=>dispose());
it('closes menus on outside click, but leaves inside clicks alone',()=>{
 const menu=main.querySelector('details');menu.open=true;menu.querySelector('summary').dispatchEvent(new Event('pointerdown',{bubbles:true}));expect(menu.open).toBe(true);
 document.querySelector('#outside').click();expect(menu.open).toBe(false);
});
it('keeps only the selected menu open and closes it with Escape',()=>{
 const menus=[...main.querySelectorAll('details')];menus[0].open=true;menus[1].querySelector('summary').click();
 expect(menus[0].open).toBe(false);expect(menus[1].open).toBe(true);
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(menus[1].open).toBe(false);
});
it('shows a note as text on a tap and closes on outside click',()=>{
 const trigger=main.querySelector('[data-note-trigger]');trigger.click();
 const panel=document.querySelector('#note-panel');expect(panel.hidden).toBe(false);
 expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');expect(panel.querySelector('img')).toBeNull();
 expect(trigger.getAttribute('aria-expanded')).toBe('true');
 document.querySelector('#outside').click();expect(panel.hidden).toBe(true);
});
it('does not open notes from checkbox or controls',()=>{
 main.querySelector('input').click();expect(document.querySelector('#note-panel').hidden).toBe(true);
 main.querySelector('summary').click();expect(document.querySelector('#note-panel').hidden).toBe(true);
});
it('suppresses the click following a drag but allows the next deliberate tap',()=>{
 const trigger=main.querySelector('[data-note-trigger]');
 main.dispatchEvent(new Event('card-gesture-consumed',{bubbles:true}));
 trigger.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));expect(document.querySelector('#note-panel').hidden).toBe(true);
 trigger.dispatchEvent(new Event('pointerdown',{bubbles:true}));trigger.click();expect(document.querySelector('#note-panel').hidden).toBe(false);
});
it('supports keyboard access and closes on Escape',()=>{
 const trigger=main.querySelector('[data-note-trigger]');trigger.focus();
 trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));expect(document.querySelector('#note-panel').hidden).toBe(false);
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(document.querySelector('#note-panel').hidden).toBe(true);
 expect(document.activeElement).toBe(trigger);
});
