// This entry point deliberately imports no cached application modules from older releases.
const button=document.querySelector('#repair-update'),status=document.querySelector('#update-status');
function installed(reg){
 if(reg.waiting||!reg.installing)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const worker=reg.installing;
  const changed=()=>{if(worker.state==='installed'){worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){worker.removeEventListener('statechange',changed);reject(new Error('install failed'));}};
  worker.addEventListener('statechange',changed);changed();
 });
}
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='新しいファイルを取得しています…';let timer;
 const perform=async()=>{
  if(!('serviceWorker' in navigator))throw new Error('unsupported');
  const reg=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
  await reg.update();await installed(reg);
  if(reg.waiting){
   const worker=reg.waiting;
   await new Promise((resolve,reject)=>{
    const changed=()=>{if(worker.state==='activated'){worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){worker.removeEventListener('statechange',changed);reject(new Error('activation failed'));}};
    worker.addEventListener('statechange',changed);worker.postMessage({type:'tempalist:activate-update'});changed();
   });
  }
 };
 try{
  await Promise.race([perform(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
  status.textContent='更新の確認・適用が完了しました。「アプリへ戻る」から開いてください。';
 }catch{status.textContent='更新を完了できませんでした。通信を確認してもう一度お試しください。保存済みデータは削除していません。';}
 finally{clearTimeout(timer);button.disabled=false;}
});
