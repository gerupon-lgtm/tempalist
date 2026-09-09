// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const payload={version:2,appId:'tempalist',type:'reminder_due',reminderId:'11111111-1111-4111-8111-111111111111',notificationKey:'deadline_advance',routeKey:'list',groupId:'abcdef0123456789'};
function worker(){
 const handlers={},showNotification=vi.fn(),openWindow=vi.fn(),clients={matchAll:async()=>[],openWindow,claim:async()=>{}};
 const self={location:{origin:'https://tempalist.sikumilab.com'},registration:{showNotification},clients,addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:vi.fn()};
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{self,URL,console,caches:{},fetch:vi.fn()});
 const push=async value=>{let promise;handlers.push({data:{text:()=>typeof value==='string'?value:JSON.stringify(value)},waitUntil:p=>promise=p});await promise;return showNotification.mock.calls.at(-1);};
 return {handlers,push,showNotification,openWindow,clients};
}
it('uses fixed notification text and aggregates by group only',async()=>{
 const w=worker();const [title,options]=await w.push(payload);
 expect(title).toBe('!=テンパリスト');expect(options.body).toBe('期限が近いチェックリストがあります');
 expect(options.tag).toBe('tempalist-advance-abcdef0123456789');
 expect(options.data).toEqual({reminderId:payload.reminderId,routeKey:'list'});
});
it.each([{...payload,version:1},{...payload,appId:'other'},{...payload,type:'other'},{...payload,reminderId:'invalid'},{...payload,notificationKey:'constructor'},{...payload,routeKey:'https://evil.example'},{...payload,groupId:'../evil'},{...payload,title:'private'},'bad JSON'])('falls back for invalid payload %j',async p=>{
 const [,options]=await worker().push(p);expect(options.body).toBe('アプリを開いて確認してください。');expect(options.data).toEqual({});
});
it('opens a fixed local route for a valid click and never trusts a URL in data',async()=>{
 const w=worker();let p;w.handlers.notificationclick({notification:{data:{reminderId:payload.reminderId,routeKey:'list'},close(){}},waitUntil:value=>p=value});await p;
 expect(w.openWindow).toHaveBeenCalledWith(`https://tempalist.sikumilab.com/list/?reminderId=${payload.reminderId}`);
 w.handlers.notificationclick({notification:{data:{url:'https://evil.example'},close(){}},waitUntil:value=>p=value});await p;
 expect(w.openWindow).toHaveBeenLastCalledWith('https://tempalist.sikumilab.com/');
});
it('focuses an existing app and delivers only a validated reminder ID',async()=>{
 const w=worker(),client={url:'https://tempalist.sikumilab.com/#/settings',focus:vi.fn(),postMessage:vi.fn()};w.clients.matchAll=async()=>[client];let p;
 w.handlers.notificationclick({notification:{data:{reminderId:payload.reminderId,routeKey:'list'},close(){}},waitUntil:value=>p=value});await p;
 expect(client.focus).toHaveBeenCalled();expect(client.postMessage).toHaveBeenCalledWith({type:'tempalist:notification-click',reminderId:payload.reminderId});expect(w.openWindow).not.toHaveBeenCalled();
});
it('opens the safe route if an existing client has closed before focus',async()=>{
 const w=worker();w.clients.matchAll=async()=>[{url:'https://tempalist.sikumilab.com/',postMessage(){},focus:async()=>{throw new Error('closed');}}];let p;
 w.handlers.notificationclick({notification:{data:{reminderId:payload.reminderId,routeKey:'list'},close(){}},waitUntil:value=>p=value});
 await p;expect(w.openWindow).toHaveBeenCalledWith(`https://tempalist.sikumilab.com/list/?reminderId=${payload.reminderId}`);
});
