import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4173';
for(const path of ['/','/list','/list/']){
 const response=await fetch(origin+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.match(await response.text(),/NOT EQUAL TEMPALIST/);
}
for(const path of ['/src/nonexistent.js','/docs/data-model.md','/package.json','/.git/config'])assert.equal((await fetch(origin+path)).status,404);
assert.equal((await fetch(origin+'/')).status,200);
assert.match((await fetch(origin+'/src/app.js')).headers.get('content-type'),/javascript/);
console.log('Serving: app routes OK, missing asset stays 404 without crashing, private development files unavailable.');
