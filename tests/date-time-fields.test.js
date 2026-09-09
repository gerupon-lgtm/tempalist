import {beforeEach,it,expect,vi} from 'vitest';
import {deadlineForm,bindPickers} from '../src/date-time-fields.js';
beforeEach(()=>{document.body.innerHTML='<div id="fields">'+deadlineForm()+'</div>';bindPickers(document.querySelector('#fields'));});
function enter(input,value,inputType='insertText',caret=value.length){input.value=value;input.setSelectionRange(caret,caret);input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType}));}
it('adds separators immediately after the year, month, and hour while typing',()=>{
 const date=document.querySelector('[name=date]'),time=document.querySelector('[name=time]');
 for(const [typed,expected] of [['202','202'],['2026','2026/'],['2026/0','2026/0'],['2026/09','2026/09/'],['2026/09/10','2026/09/10']]){enter(date,typed);expect(date.value).toBe(expected);expect(date.selectionStart).toBe(expected.length);}
 enter(time,'14');expect(time.value).toBe('14:');expect(time.selectionStart).toBe(3);
 enter(time,'14:30');expect(time.value).toBe('14:30');
});
it('selects the entire value on focus and repeated taps',()=>{
 for(const kind of ['date','time']){const input=document.querySelector(`[name=${kind}]`);input.value=kind==='date'?'2026/09/10':'14:30';input.focus();expect(input.selectionStart).toBe(0);expect(input.selectionEnd).toBe(input.value.length);input.setSelectionRange(2,2);input.click();expect(input.selectionStart).toBe(0);expect(input.selectionEnd).toBe(input.value.length);}
});
it('normalizes pasted digits and ISO dates without discarding invalid or excess input',()=>{
 const date=document.querySelector('[name=date]'),time=document.querySelector('[name=time]');
 for(const value of ['20260910','2026-09-10']){enter(date,value,'insertFromPaste');expect(date.value).toBe('2026/09/10');}
 enter(time,'0930','insertFromPaste');expect(time.value).toBe('09:30');
 for(const value of ['202609101','abc']){enter(date,value,'insertFromPaste');expect(date.value).toBe(value);}
});
it('allows deleting a trailing separator and moving backwards through an internal separator',()=>{
 const date=document.querySelector('[name=date]');
 enter(date,'2026','deleteContentBackward');expect(date.value).toBe('2026');expect(date.selectionStart).toBe(4);
 enter(date,'202','deleteContentBackward');expect(date.value).toBe('202');
 enter(date,'2026/0910','deleteContentBackward',7-1);expect(date.value).toBe('2026/09/10');expect(date.selectionStart).toBe(7-1);
 enter(date,'','deleteContentBackward');expect(date.value).toBe('');
});
it('seeds the native date/time pickers from compact keyboard input without changing it on cancel',()=>{
 const date=document.querySelector('[name=date]'),time=document.querySelector('[name=time]'),datePicker=document.querySelector('[data-picker=date]'),timePicker=document.querySelector('[data-picker=time]');
 date.value='20260910';time.value='1430';datePicker.showPicker=vi.fn();timePicker.showPicker=vi.fn();
 document.querySelector('[data-open-picker=date]').click();document.querySelector('[data-open-picker=time]').click();
 expect(datePicker.value).toBe('2026-09-10');expect(timePicker.value).toBe('14:30');
 expect(datePicker.showPicker).toHaveBeenCalledOnce();expect(timePicker.showPicker).toHaveBeenCalledOnce();
 expect(date.value).toBe('20260910');expect(time.value).toBe('1430');
});
it('copies picker changes into the submitted fields, including clearing them',()=>{
 for(const [kind,picked,display] of [['date','2026-10-11','2026/10/11'],['time','09:45','09:45']]){
  const picker=document.querySelector(`[data-picker=${kind}]`),input=document.querySelector(`[name=${kind}]`);
  picker.value=picked;picker.dispatchEvent(new Event('change'));expect(input.value).toBe(display);
  picker.value='';picker.dispatchEvent(new Event('change'));expect(input.value).toBe('');
 }
});
it('formats valid typed dates and times while keeping invalid input available to correct',()=>{
 const date=document.querySelector('[name=date]'),time=document.querySelector('[name=time]');
 date.value='20260910';date.dispatchEvent(new Event('blur'));expect(date.value).toBe('2026/09/10');
 time.value='0930';time.dispatchEvent(new Event('blur'));expect(time.value).toBe('09:30');
 date.value='20260230';date.dispatchEvent(new Event('blur'));expect(date.value).toBe('20260230');
 time.value='2560';time.dispatchEvent(new Event('blur'));expect(time.value).toBe('2560');
});
it('does not reuse an earlier picker value after keyboard input is cleared or invalid',()=>{
 const input=document.querySelector('[name=date]'),picker=document.querySelector('[data-picker=date]');picker.showPicker=vi.fn();
 picker.value='2026-09-10';input.value='';document.querySelector('[data-open-picker=date]').click();expect(picker.value).toBe('');
 input.value='20260230';document.querySelector('[data-open-picker=date]').click();expect(picker.value).toBe('');expect(input.value).toBe('20260230');
});
it('provides a visible native fallback when showPicker is unavailable',()=>{
 const picker=document.querySelector('[data-picker=date]');picker.showPicker=undefined;
 document.querySelector('[data-open-picker=date]').click();
 expect(picker.closest('.input-with-picker').classList.contains('picker-fallback')).toBe(true);
 expect(picker.tabIndex).toBe(0);expect(document.activeElement).toBe(picker);
});
