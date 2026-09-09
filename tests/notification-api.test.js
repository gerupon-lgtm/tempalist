import {describe,it,expect,vi} from 'vitest';
import {createNotificationApi,NotificationApiError} from '../src/notification/api.js';

const publicKey='BA'+'A'.repeat(85);
const response=(value,status=200)=>({status,ok:status>=200&&status<300,json:async()=>value});
describe('notification public-key connection',()=>{
  it('uses the fixed v2 app path without cookies, redirects, or business data',async()=>{
    const fetch=vi.fn(async()=>response({publicKey}));
    expect(await createNotificationApi({fetch}).getPublicKey()).toEqual({publicKey});
    const [url,options]=fetch.mock.calls[0];
    expect(url).toBe('https://api.atoqueue.sikumilab.com/v2/apps/tempalist/push/public-key');
    expect(options).toMatchObject({method:'GET',credentials:'omit',redirect:'error',cache:'no-store'});
    expect(options.body).toBeUndefined();
    expect(options.headers).toEqual({Accept:'application/json'});
  });
  it.each([{publicKey,extra:'unexpected'},{publicKey:'invalid'},{publicKey:'AA'+'A'.repeat(85)},null,[]])('rejects an invalid successful response %j',async value=>{
    const api=createNotificationApi({fetch:async()=>response(value)});
    await expect(api.getPublicKey()).rejects.toMatchObject({kind:'protocol',retryable:false});
  });
  it('reports an unregistered app without leaking server messages',async()=>{
    const api=createNotificationApi({fetch:async()=>response({error:{code:'APP_NOT_FOUND',message:'private-server-details',requestId:'req_test'}},404)});
    await expect(api.getPublicKey()).rejects.toMatchObject({kind:'http',status:404,code:'APP_NOT_FOUND',retryable:false,message:'通知基盤へのアプリ登録が必要です。'});
  });
  it('handles network and CORS errors without exposing exception text',async()=>{
    const api=createNotificationApi({fetch:async()=>{throw new Error('secret endpoint');}});
    const error=await api.getPublicKey().catch(e=>e);
    expect(error).toBeInstanceOf(NotificationApiError);
    expect(error).toMatchObject({kind:'network',retryable:true});
    expect(error.message).not.toContain('secret');
  });
  it.each([400,403,409,413,501])('does not mark HTTP %s for automatic retry',async status=>{
    await expect(createNotificationApi({fetch:async()=>response({},status)}).getPublicKey()).rejects.toMatchObject({status,retryable:false});
  });
  it.each([429,500,503])('classifies HTTP %s as temporary',async status=>{
    await expect(createNotificationApi({fetch:async()=>response({},status)}).getPublicKey()).rejects.toMatchObject({status,retryable:true});
  });
  it('rejects malformed JSON as a protocol error',async()=>{
    await expect(createNotificationApi({fetch:async()=>({status:200,ok:true,json:async()=>{throw new Error('raw body');}})}).getPublicKey()).rejects.toMatchObject({kind:'protocol',retryable:false});
  });
  it('aborts a slow request and clears its timer',async()=>{
    vi.useFakeTimers();
    try{
      const api=createNotificationApi({timeoutMs:50,fetch:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort'))))});
      const outcome=api.getPublicKey().catch(e=>e);
      await vi.advanceTimersByTimeAsync(50);
      expect(await outcome).toMatchObject({kind:'network'});
      expect(vi.getTimerCount()).toBe(0);
    }finally{vi.useRealTimers();}
  });
});
