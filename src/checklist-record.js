import {emptyState,validateState} from './domain.js';
import {getTimeZone} from './dates.js';
import {APP_VERSION} from './version.js';

function base64(text){
  let binary='';
  for(const byte of new TextEncoder().encode(text))binary+=String.fromCharCode(byte);
  return btoa(binary);
}
const encodedBody=text=>base64(text).match(/.{1,76}/g)?.join('\r\n')??'';
function encodedSubject(text){
  // Each encoded word is independent UTF-8 and fits RFC 2047's 75-character limit.
  const chunks=[];let chunk='',length=0;
  for(const char of text.replace(/[\r\n\t]/g,' ')){
    const size=new TextEncoder().encode(char).length;
    if(length+size>42){chunks.push(chunk);chunk='';length=0;}
    chunk+=char;length+=size;
  }
  if(chunk)chunks.push(chunk);
  return chunks.map(value=>'=?UTF-8?B?'+base64(value)+'?=').join('\r\n ');
}
export function createChecklistRecord(value,{now=new Date().toISOString(),timeZone=getTimeZone()}={}){
  const checklist=validateState({...emptyState(),checklists:[value]}).checklists[0];
  const exportedAt=new Date(now).toISOString();
  const format=new Intl.DateTimeFormat('ja-JP',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const date=(value,empty='なし')=>value?`${format.format(new Date(value))} (${timeZone}) [${value}]`:empty;
  const record={schemaVersion:1,kind:'checklist-record',appVersion:APP_VERSION,exportedAt,timeZone,checklist};
  const json=JSON.stringify(record,null,2),subject=checklist.title;
  const text=[subject,'',`状態: ${checklist.status==='settled'?'完了':'進行中'}`,`完了日時: ${date(checklist.settledAt,'未完了')}`,`期限: ${date(checklist.dueAt)}`,`作成日時: ${date(checklist.createdAt)}`,`更新日時: ${date(checklist.updatedAt)}`,`備考更新日時: ${date(checklist.remarksUpdatedAt)}`,`出力日時: ${date(exportedAt)}`,`チェックリストID: ${checklist.id}`,'','備考',checklist.remarks||'（なし）','','チェックリストの内容',...checklist.items.flatMap((item,index)=>[`${index+1}. [${item.checked?'チェック済み':'未チェック'}] ${item.label}`,...(item.note?['コメント:',item.note]:[]),'']),`NOT EQUAL TEMPALIST v${APP_VERSION}`,'日時は端末の時計に基づく記録です。完了後も備考は追記・変更できます。'].join('\n');
  const stem=`tempalist-${checklist.id}-${exportedAt.replace(/[-:.]/g,'')}`;
  const jsonName=stem+'.json',emlName=stem+'.eml';
  const boundary='tempalist_'+crypto.randomUUID();
  const eml=[`Subject: ${encodedSubject(subject)}`,`Date: ${new Date(exportedAt).toUTCString()}`,'X-Unsent: 1','MIME-Version: 1.0','Content-Type: multipart/mixed;',` boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody(text.replace(/\r?\n/g,'\r\n')),`--${boundary}`,'Content-Type: application/json;',' name="'+jsonName+'"','Content-Disposition: attachment;',' filename="'+jsonName+'"','Content-Transfer-Encoding: base64','',encodedBody(json),`--${boundary}--`,''].join('\r\n');
  return {subject,text,json,eml,jsonName,emlName};
}
