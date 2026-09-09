export function installHelp(env=globalThis){
 const nav=env.navigator??{};
 if(/iPhone|iPad|iPod/.test(nav.userAgent??'')||(/Macintosh/.test(nav.userAgent??'')&&nav.maxTouchPoints>1))return 'ブラウザの共有メニューから「ホーム画面に追加」を選び、追加したアイコンから開いてください。';
 return 'Chromeの右上の「⋮」から「ホーム画面に追加」または「アプリをインストール」を選べます。インストールボタンが出ない場合は、通常タブでこの操作をお試しください。';
}

export function createPwaController({env=globalThis,onChange=()=>{},hasUnsaved=()=>false,reload=()=>env.location.reload()}={}){
 let registration=null,prompt=null,dismissed=false,installed=Boolean(env.navigator?.standalone||env.matchMedia?.('(display-mode: standalone)').matches);
 let controlled=Boolean(env.navigator?.serviceWorker?.controller),reloadPending=false,checking=false,message='更新を確認できます。';
 const cleanup=[];
 const listen=(target,event,handler)=>{target?.addEventListener(event,handler);cleanup.push(()=>target?.removeEventListener(event,handler));};
 const state=()=>({installed,canInstall:Boolean(prompt)&&!installed,showInstall:Boolean(prompt)&&!installed&&!dismissed,canUpdate:Boolean(registration?.waiting)||reloadPending,checking,message});
 const publish=()=>onChange(state());
 listen(env,'beforeinstallprompt',event=>{event.preventDefault();prompt=event;publish();});
 listen(env,'appinstalled',()=>{installed=true;prompt=null;publish();});
 listen(env.navigator?.serviceWorker,'controllerchange',()=>{
  if(controlled){reloadPending=true;if(!hasUnsaved())reload();else message='新しい版を読み込めます。入力を保存してから更新してください。';}
  controlled=true;publish();
 });
 function observeWorker(worker){
  if(!worker)return;
  listen(worker,'statechange',()=>{
   if(worker.state==='redundant')message='新版の準備に失敗しました。通信を確認して再試行してください。';
   else if(worker.state==='installed')message='新版の準備ができました。';
   publish();
  });
 }
 return {
  state,
  bind(reg){registration=reg;observeWorker(reg.installing);listen(reg,'updatefound',()=>{message='新しい版をダウンロードしています…';observeWorker(reg.installing);publish();});publish();},
  async check(){
   if(checking)return;
   if(!registration){message='更新の準備中です。通信できる状態で、少し待ってからお試しください。';publish();return;}
   checking=true;message='更新を確認しています…';publish();let timer;
   try{
    await Promise.race([registration.update(),new Promise((_,reject)=>{timer=env.setTimeout(()=>reject(new Error('timeout')),15000);})]);
    message=registration.waiting?'新しいバージョンを使えます。':registration.installing?'新しい版をダウンロードしています…':reloadPending?'新しい版を読み込めます。':'更新を確認しました。現在の版を利用できます。';
   }catch{message='更新を確認できませんでした。通信を確認して再試行してください。';}
   finally{env.clearTimeout(timer);checking=false;publish();}
  },
  apply(){
   if(hasUnsaved()){message='入力を保存してから更新してください。';publish();return;}
   if(reloadPending){reload();return;}
   if(registration?.waiting){message='更新を適用しています…';publish();registration.waiting.postMessage({type:'tempalist:activate-update'});}
  },
  dismissInstall(){dismissed=true;publish();},
  async install(){
   const event=prompt;if(!event||installed)return;
   prompt=null;publish();
   try{await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted')dismissed=true;}
   catch{message='インストールを開始できませんでした。設定の案内からブラウザのメニューをお試しください。';}
   publish();
  },
  dispose(){for(const stop of cleanup)stop();},
 };
}
