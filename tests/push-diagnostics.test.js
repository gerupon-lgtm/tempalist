// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const payload={version:2,appId:'tempalist',type:'reminder_due',reminderId:'11111111-1111-4111-8111-111111111111',notificationKey:'deadline_imminent',routeKey:'list',groupId:'abcdef0123456789'};
function storage(){const data=new Map();return {has:async()=>data.has('record'),open:async()=>({match:async()=>data.has('record')?new Response(data.get('record')):undefined,put:async(_key,response)=>data.set('record',await response.text())})};}
function worker(caches=storage(),showNotification=vi.fn(async()=>{})){
 const handlers={},self={location:{origin:'https://tempalist.sikumilab.com'},registration:{showNotification},clients:{claim:async()=>{}},addEventListener:(key,handler)=>handlers[key]=handler};
 vm.runInNewContext(source,{self,caches,Response,URL,console});
 const push=async value=>{let pending;handlers.push({data:{text:()=>JSON.stringify(value)},waitUntil:p=>pending=p});await pending;};
 const message=async type=>{let pending,result;handlers.message({data:{type},source:{url:'https://tempalist.sikumilab.com/#/settings'},ports:[{postMessage:value=>result=value}],waitUntil:p=>pending=p});await pending;return result;};
 return {push,message,showNotification,handlers};
}
it('persists push arrival and display API success across worker restarts without private payload fields',async()=>{
 const cache=storage(),w=worker(cache);await w.push(payload);
 const result=await worker(cache).message('tempalist:inspect-push');
 expect(result.historyAvailable).toBe(true);expect(result.events.map(e=>e.event)).toEqual(['push-received','display-accepted']);
 expect(result.events.every(e=>e.reminderId===payload.reminderId&&e.source==='push')).toBe(true);
 await w.push({...payload,title:'PRIVATE',deviceSecret:'PRIVATE',endpoint:'PRIVATE'});
 const invalid=await w.message('tempalist:inspect-push');expect(invalid.events.at(-2).validPayload).toBe(false);expect(JSON.stringify(invalid)).not.toContain('PRIVATE');
});
it('records display rejection and preserves the rejected push promise',async()=>{
 const error=new Error('PRIVATE');error.name='NotAllowedError';const w=worker(storage(),vi.fn(async()=>{throw error;}));
 await expect(w.push(payload)).rejects.toBe(error);
 const result=await w.message('tempalist:inspect-push');expect(result.events.at(-1)).toMatchObject({event:'display-failed',errorName:'NotAllowedError'});expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('distinguishes a user-triggered local display test from received Push',async()=>{
 const w=worker();expect(await w.message('tempalist:test-display')).toMatchObject({displayRequest:'accepted'});
 const result=await w.message('tempalist:inspect-push');expect(result.events).toHaveLength(1);expect(result.events[0]).toMatchObject({event:'display-accepted',source:'local-test'});expect(result.events[0].reminderId).toBeUndefined();
});
it('does not gate display on diagnostic storage success and bounds retained entries',async()=>{
 const w=worker({has:async()=>{throw new Error('unavailable');}});await w.push(payload);expect(w.showNotification).toHaveBeenCalledTimes(1);
 const normal=worker();for(let i=0;i<55;i++)await normal.push(payload);expect((await normal.message('tempalist:inspect-push')).events).toHaveLength(100);
});
it('does not accept display test messages from another origin',async()=>{
 const w=worker(),postMessage=vi.fn(),waitUntil=vi.fn();
 w.handlers.message({data:{type:'tempalist:test-display'},source:{url:'https://other.example'},ports:[{postMessage}],waitUntil});
 expect(w.showNotification).not.toHaveBeenCalled();expect(postMessage).not.toHaveBeenCalled();expect(waitUntil).not.toHaveBeenCalled();
});
it('keeps diagnostic receipt storage when a new shell activates',async()=>{
 const caches={...storage(),keys:async()=>['tempalist-shell-old','tempalist-push-diagnostics-v1'],delete:vi.fn(async()=>true)},w=worker(caches);
 await w.push(payload);let pending;w.handlers.activate({waitUntil:p=>pending=p});await pending;
 expect(caches.delete.mock.calls).toEqual([['tempalist-shell-old']]);
 expect((await w.message('tempalist:inspect-push')).events).toHaveLength(2);
});
