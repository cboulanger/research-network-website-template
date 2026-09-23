import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveContent } from './lib/resolve-content.mjs';

const SCHEMAS = ['site', 'members', 'projects', 'events', 'news'];

async function main() {
  const contentDir = await resolveContent();
  let failed = false;
  for (const name of SCHEMAS) {
    const schema = path.join('schema', `${name}.schema.json`);
    const data = path.join(contentDir, 'data', `${name}.json`);
    const result = spawnSync('npx', ['--yes', 'ajv-cli', 'validate', '-s', schema, '-d', data], {
      stdio: 'inherit',
    });
    if (result.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main();
