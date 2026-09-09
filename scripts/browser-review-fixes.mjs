import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'chrome',headless:true});

async function withContext(run){
  const context=await browser.newContext({viewport:{width:375,height:812},timezoneId:'Asia/Tokyo'});
  context.setDefaultTimeout(5000);
  const errors=[];
  context.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text());});
  });
  try{
    await run(context);
    assert.deepEqual(errors,[]);
  }finally{
    await context.close();
  }
}

const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('tempalist:data')));
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const dialogDone=page=>page.locator('#dialog').waitFor({state:'hidden'});
async function createListFromSample(page){
  await page.goto(origin);
  await page.getByRole('link',{name:'テンプレート',exact:true}).click();
  await page.getByRole('link',{name:/^おでかけ/}).click();
  const sourceId=(await saved(page)).templates.find(template=>template.name==='おでかけ').id;
  await button(page,'この型でリストを作る').click();
  await button(page,'作成する').click();
  await dialogDone(page);
  const listId=(await saved(page)).checklists.at(-1).id;
  return {sourceId,listId};
}
async function editFirstItem(page,label){
  const row=page.locator('[data-index="0"]');
  await row.locator('summary').click();
  await row.getByRole('button',{name:'編集',exact:true}).click();
  await page.getByLabel('項目名',{exact:true}).fill(label);
  await button(page,'保存する').click();
  await dialogDone(page);
}
async function openWriteBack(page){
  await button(page,'テンプレートに書き戻す').click();
  await page.getByRole('heading',{name:'テンプレートに書き戻す',exact:true}).waitFor();
}

try{
  await withContext(async context=>{
    const page=await context.newPage();
    await page.goto(origin);
    await page.getByRole('link',{name:'設定',exact:true}).click();
    const retention=page.locator('#retention');
    assert.equal((await saved(page)).settings.completedRetention,'90d');

    await retention.selectOption('keep');
    await button(page,'キャンセル').click();
    await dialogDone(page);
    assert.equal(await retention.inputValue(),'90d');
    assert.equal((await saved(page)).settings.completedRetention,'90d');

    await retention.selectOption('keep');
    await page.locator('#dialog').press('Escape');
    await dialogDone(page);
    assert.equal(await retention.inputValue(),'90d');
    assert.equal((await saved(page)).settings.completedRetention,'90d');

    await retention.selectOption('keep');
    await button(page,'変更する').click();
    await dialogDone(page);
    assert.equal(await retention.inputValue(),'keep');
    assert.equal((await saved(page)).settings.completedRetention,'keep');
  });

  await withContext(async context=>{
    const pageA=await context.newPage();
    const {sourceId,listId}=await createListFromSample(pageA);
    await editFirstItem(pageA,'古いリストからの項目');
    await openWriteBack(pageA);

    const pageB=await context.newPage();
    await pageB.goto(`${origin}/#/template/${sourceId}`);
    await editFirstItem(pageB,'別タブの新しい大切な項目');

    await button(pageA,'書き戻す').click();
    await pageA.waitForFunction(()=>!document.querySelector('#dialog').open||document.querySelector('#dialog .form-error').textContent.includes('別の画面で更新されました'));
    const current=await saved(pageA);
    assert.equal(current.templates.find(template=>template.id===sourceId).items[0].label,'別タブの新しい大切な項目');
    assert.equal(current.checklists.find(list=>list.id===listId).items[0].label,'古いリストからの項目');
    await pageA.locator('#dialog .form-error').filter({hasText:'別の画面で更新されました'}).waitFor();
    assert.equal(await pageA.locator('#dialog [name=mode]').inputValue(),'overwrite');
    assert.equal(await pageA.locator('#dialog').getAttribute('open'),'');
  });

  await withContext(async context=>{
    const pageA=await context.newPage();
    const {listId}=await createListFromSample(pageA);
    await openWriteBack(pageA);
    await pageA.locator('#dialog [name=mode]').selectOption('new');
    await pageA.locator('#dialog [name=name]').fill('競合時にも残る入力');
    const templateCount=(await saved(pageA)).templates.length;

    const pageB=await context.newPage();
    await pageB.goto(`${origin}/#/checklist/${listId}`);
    await editFirstItem(pageB,'別タブで変更したリスト項目');

    await button(pageA,'書き戻す').click();
    await pageA.waitForFunction(()=>!document.querySelector('#dialog').open||document.querySelector('#dialog .form-error').textContent.includes('別の画面で更新されました'));
    const current=await saved(pageA);
    assert.equal(current.templates.length,templateCount);
    assert.equal(current.checklists.find(list=>list.id===listId).items[0].label,'別タブで変更したリスト項目');
    await pageA.locator('#dialog .form-error').filter({hasText:'別の画面で更新されました'}).waitFor();
    assert.equal(await pageA.locator('#dialog [name=mode]').inputValue(),'new');
    assert.equal(await pageA.locator('#dialog [name=name]').inputValue(),'競合時にも残る入力');
  });

  await withContext(async context=>{
    const page=await context.newPage();
    const {sourceId,listId}=await createListFromSample(page);
    await editFirstItem(page,'通常の書き戻し');
    await page.getByRole('link',{name:'リスト',exact:true}).click();
    await button(page,'リストを作る').first().click();
    await page.getByLabel('タイトル',{exact:true}).fill('容量整理用');
    await button(page,'作成する').click();
    await dialogDone(page);
    const unrelatedId=(await saved(page)).checklists.at(-1).id;
    await button(page,'完了を確定する').click();
    await page.getByRole('link',{name:/容量整理用/}).waitFor();
    await page.goto(`${origin}/#/checklist/${listId}`);
    await openWriteBack(page);

    const pageB=await context.newPage();
    await pageB.goto(`${origin}/#/settings`);
    await pageB.locator('#retention').selectOption('keep');
    await button(pageB,'変更する').click();
    await dialogDone(pageB);
    await button(pageB,'完了リストを整理する').click();
    await pageB.locator('#capacity-dialog').getByLabel('容量整理用',{exact:true}).check();
    await pageB.locator('#capacity-dialog').getByRole('button',{name:'選択した1件を削除',exact:true}).click();
    await pageB.locator('#capacity-dialog').waitFor({state:'detached'});

    await button(page,'書き戻す').click();
    await dialogDone(page);
    const current=await saved(page);
    assert.equal(current.templates.find(template=>template.id===sourceId).items[0].label,'通常の書き戻し');
    assert.equal(current.checklists.some(list=>list.id===unrelatedId),false);
  });

  console.log('Browser review fixes: retention cancel/Escape/retry and guarded writeback conflicts: OK');
}finally{
  await browser.close();
}
