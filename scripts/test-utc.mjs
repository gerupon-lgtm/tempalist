import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url)),'run'],{stdio:'inherit',env:{...process.env,TZ:'UTC'}});
process.exit(result.status??1);
