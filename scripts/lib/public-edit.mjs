// Public edit/add through ntfy: reads the NTFY_* configuration and writes the
// files the static site needs for it (stripped data + schemas, config, JS).
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_NTFY_SERVER, EDITABLE_TYPES } from '../../assets/js/ntfy.js';
import { stripPrivateRecords, toSubmissionSchema } from '../../assets/js/private-fields.js';

const PUBLIC_JS = ['record-form.js', 'ntfy.js', 'edit-page.js', 'edit-mode.js', 'events.js', 'news.js'];

export function getPublicEditConfig(env = process.env) {
  const topic = (env.NTFY_TOPIC || '').trim();
  if (!topic) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    throw new Error('NTFY_TOPIC may only contain letters, digits, "-" and "_" (at most 64 characters)');
  }
  const server = (env.NTFY_SERVER || '').trim().replace(/\/+$/, '') || DEFAULT_NTFY_SERVER;
  if (!/^https?:\/\/[^\s"'<>]+$/.test(server)) throw new Error('NTFY_SERVER must be an http(s) URL');
  return { server, topic };
}

export async function writePublicEditAssets({ publicDir, schemaDir, content, config }) {
  const dataDir = path.join(publicDir, 'assets', 'data');
  const schemaOut = path.join(publicDir, 'assets', 'schema');
  const jsDir = path.join(publicDir, 'assets', 'js');
  await Promise.all([dataDir, schemaOut, jsDir].map((dir) => mkdir(dir, { recursive: true })));
  for (const type of EDITABLE_TYPES) {
    const schema = JSON.parse(readFileSync(path.join(schemaDir, `${type}.schema.json`), 'utf8'));
    await writeFile(path.join(dataDir, `${type}.json`), JSON.stringify(stripPrivateRecords(schema, content[type])));
    await writeFile(path.join(schemaOut, `${type}.schema.json`), JSON.stringify(toSubmissionSchema(schema)));
  }
  await writeFile(path.join(jsDir, 'edit-config.js'), `export default ${JSON.stringify(config)};\n`);
  for (const file of PUBLIC_JS) await cp(path.join('assets', 'js', file), path.join(jsDir, file));
}
