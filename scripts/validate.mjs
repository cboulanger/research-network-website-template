import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveContent } from './lib/resolve-content.mjs';

const isWindows = process.platform === 'win32';
const SCHEMAS =['site', 'members', 'projects', 'events', 'news'];

async function main() {
  const contentDir = await resolveContent();
  let failed = false;
  for (const name of SCHEMAS) {
    const schema = path.join('schema', `${name}.schema.json`);
    const data = path.join(contentDir, 'data', `${name}.json`);
    const args = ['--yes', 'ajv-cli', 'validate', '-s', schema, '-d', data];
    // On Windows, npx is a .cmd shim that Node can only launch through a
    // shell; quote the arguments so paths with spaces survive.
    const result = isWindows
      ? spawnSync('npx', args.map((a) => `"${a}"`), { stdio: 'inherit', shell: true })
      : spawnSync('npx', args, { stdio: 'inherit' });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main();
