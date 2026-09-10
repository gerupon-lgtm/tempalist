import {buildChecklistLink} from '../src/checklist-link.js';
console.log(buildChecklistLink({
 schemaVersion:1,kind:'checklist-create',source:'atoqueue',
 requestId:'11111111-1111-4111-8111-111111111111',title:'連携テスト・買い物',
 items:[{sourceTaskId:'test-milk',label:'牛乳を買う',note:'1リットルを2本'},{sourceTaskId:'test-battery',label:'電池を買う',note:'単3を4本'}]
}));
