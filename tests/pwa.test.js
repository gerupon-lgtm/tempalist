import {it,expect,vi} from 'vitest';
import {createPwaController,installHelp} from '../src/pwa.js';
function setup({installed=false,dirty=false}={}){
 const env=new EventTarget(),sw=new EventTarget();sw.controller={};
 Object.assign(env,{navigator:{serviceWorker:sw,userAgent:'Android Chrome'},matchMedia:()=>({matches:installed}),setTimeout,clearTimeout});
 const reload=vi.fn(),onChange=vi.fn();
 const controller=createPwaController({env,reload,onChange,hasUnsaved:()=>dirty});
 return {env,sw,reload,controller,setDirty:value=>dirty=value};
}
it('offers install only after an available browser prompt and consumes it once',async()=>{
 const {env,controller}=setup();const event=new Event('beforeinstallprompt',{cancelable:true});
 event.prompt=vi.fn(async()=>{});event.userChoice=Promise.resolve({outcome:'dismissed'});
 expect(controller.state().canInstall).toBe(false);env.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(true);expect(controller.state().showInstall).toBe(true);
 await controller.install();expect(event.prompt).toHaveBeenCalledTimes(1);expect(controller.state().canInstall).toBe(false);
 await controller.install();expect(event.prompt).toHaveBeenCalledTimes(1);controller.dispose();
});
it('hides installation promotion in standalone mode and after appinstalled',()=>{
 const standalone=setup({installed:true});expect(standalone.controller.state().installed).toBe(true);standalone.controller.dispose();
 const {env,controller}=setup();env.dispatchEvent(new Event('appinstalled'));
 expect(controller.state().installed).toBe(true);expect(controller.state().showInstall).toBe(false);controller.dispose();
});
it('detects a waiting worker that already exists when registration attaches',()=>{
 const {controller}=setup(),reg=new EventTarget();reg.waiting={postMessage:vi.fn()};
 controller.bind(reg);expect(controller.state().canUpdate).toBe(true);controller.dispose();
});
it('protects unsaved input when applying an update or another tab activates it',async()=>{
 const {controller,sw,reload,setDirty}=setup({dirty:true});const reg=new EventTarget();reg.waiting={postMessage:vi.fn()};controller.bind(reg);
 controller.apply();expect(reg.waiting.postMessage).not.toHaveBeenCalled();expect(controller.state().message).toContain('保存');
 reg.waiting=null;sw.dispatchEvent(new Event('controllerchange'));expect(reload).not.toHaveBeenCalled();expect(controller.state().canUpdate).toBe(true);
 setDirty(false);controller.apply();expect(reload).toHaveBeenCalledOnce();controller.dispose();
});
it('reloads clean pages after activation and catches failed update checks',async()=>{
 const {controller,sw,reload}=setup(),reg=new EventTarget();reg.update=vi.fn(async()=>{throw Error('offline');});controller.bind(reg);
 await controller.check();expect(controller.state().message).toContain('通信');
 sw.dispatchEvent(new Event('controllerchange'));expect(reload).toHaveBeenCalledOnce();controller.dispose();
});
it('provides manual Android and iOS instructions without depending on an install event',()=>{
 expect(installHelp({navigator:{userAgent:'Android Chrome'}})).toContain('ホーム画面に追加');
 expect(installHelp({navigator:{userAgent:'iPhone'}})).toContain('共有');
});
