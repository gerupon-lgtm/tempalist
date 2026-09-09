import {deadlineFields,getTimeZone,parseDeadline} from './dates.js';
import {escapeHTML as e,icon} from './ui.js';

export function formatDateTimeEntry(value,kind,{deleting=false}={}){
 const allowed=kind==='date'?/^[\d/\-]*$/:/^[\d:]*$/;
 if(!allowed.test(value))return value;
 const digits=value.replace(/\D/g,''),limit=kind==='date'?8:4;
 if(digits.length>limit)return value;
 const boundaries=kind==='date'?[4,6]:[2],separator=kind==='date'?'/':':';
 let formatted='';
 for(let index=0;index<digits.length;index++){
  formatted+=digits[index];
  if(boundaries.includes(index+1)&&(index+1<digits.length||!deleting))formatted+=separator;
 }
 return formatted;
}

function inputField(kind,label,value,placeholder,pickerLabel){
 return `<div class="field date-time-field"><label for="deadline-${kind}">${label}</label><div class="input-with-picker"><input id="deadline-${kind}" name="${kind}" value="${e(value)}" placeholder="${placeholder}" inputmode="numeric" autocomplete="off" aria-describedby="deadline-input-help"><button type="button" data-open-picker="${kind}" aria-label="${pickerLabel}" title="${pickerLabel}">${icon(kind==='date'?'calendar':'clock')}</button><input type="${kind}" class="native-picker" data-picker="${kind}" aria-label="${kind==='date'?'日付':'時刻'}ピッカー" tabindex="-1"></div></div>`;
}
export function deadlineForm(entity={dueAt:null,dueHasTime:false}){
 const {date,time}=deadlineFields(entity.dueAt,entity.dueHasTime);
 return `<div class="form-grid deadline-fields">${inputField('date','期限の日付',date.replaceAll('-','/'),'2026/09/10','カレンダーを開く')}${inputField('time','時刻',time,'09:00','時計を開く')}</div><p id="deadline-input-help" class="secondary-text">数字を入力すると /・: を補います。右端のアイコンからも選べます。時刻省略時は09:00です。${e(getTimeZone())}</p>`;
}
export function bindPickers(root){
 for(const picker of root.querySelectorAll('[data-picker]')){
  const kind=picker.dataset.picker,input=root.querySelector(`[name=${kind}]`),button=root.querySelector(`[data-open-picker=${kind}]`);
  function format(event){
   if(event.isComposing)return;
   const before=input.value,position=input.selectionStart??before.length;
   const count=before.slice(0,position).replace(/\D/g,'').length;
   const next=formatDateTimeEntry(before,kind,{deleting:event.inputType?.startsWith('delete')});
   if(next===before)return;
   input.value=next;
   let caret=0,seen=0;
   while(caret<next.length&&seen<count){if(/\d/.test(next[caret]))seen++;caret++;}
   if(!event.inputType?.startsWith('delete'))while(caret<next.length&&/[/\-:]/.test(next[caret]))caret++;
   input.setSelectionRange(caret,caret);
  }
  input.addEventListener('input',format);
  input.addEventListener('compositionend',format);
  input.addEventListener('focus',()=>input.select());
  input.addEventListener('click',()=>input.select());
  input.addEventListener('blur',()=>{
   try{
    if(kind==='date'){parseDeadline(input.value);input.value=formatDateTimeEntry(input.value,kind);}
    else if(/^([01]\d|2[0-3])[0-5]\d$/.test(input.value))input.value=formatDateTimeEntry(input.value,kind);
   }catch{/* Preserve invalid or partial input for correction. */}
  });
  picker.addEventListener('change',()=>{
   input.value=kind==='date'?picker.value.replaceAll('-','/'):picker.value;
   input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  button.addEventListener('click',()=>{
   const normalized=formatDateTimeEntry(input.value,kind);
   picker.value=kind==='date'?normalized.replaceAll('/','-'):normalized;
   try{
    if(typeof picker.showPicker!=='function')throw new Error('unsupported');
    picker.showPicker();
   }catch{
    picker.closest('.input-with-picker').classList.add('picker-fallback');
    picker.tabIndex=0;picker.focus();picker.click();
   }
  });
 }
}
