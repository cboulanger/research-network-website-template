import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DATA_FILES = ['site', 'members', 'projects', 'events', 'news'];

function authHeaders() {
  const username = process.env.CONTENT_USERNAME;
  const password = process.env.CONTENT_PASSWORD;
  if (!username && !password) return {};
  const token = Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function fetchOk(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res;
}

function referencedPageNames(newsItems, eventsItems) {
  const names = new Set(['about.md']);
  const pattern = /^pages\.html\?doc=(.+)$/;
  for (const item of [...newsItems, ...eventsItems]) {
    const match = typeof item.url === 'string' ? item.url.match(pattern) : null;
    if (match) names.add(match[1]);
  }
  return [...names];
}

export async function materializeRemote(baseUrl) {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-'));
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'pages'), { recursive: true });
  await mkdir(path.join(dir, 'images'), { recursive: true });

  const data = {};
  for (const name of DATA_FILES) {
    const text = await (await fetchOk(`${baseUrl}/data/${name}.json`)).text();
    await writeFile(path.join(dir, 'data', `${name}.json`), text, 'utf8');
    data[name] = JSON.parse(text);
  }

  for (const name of referencedPageNames(data.news, data.events)) {
    const text = await (await fetchOk(`${baseUrl}/pages/${name}`)).text();
    await writeFile(path.join(dir, 'pages', name), text, 'utf8');
  }

  for (const name of [data.site.favicon, data.site.logo].filter(Boolean)) {
    const buffer = Buffer.from(await (await fetchOk(`${baseUrl}/images/${name}`)).arrayBuffer());
    await writeFile(path.join(dir, 'images', name), buffer);
  }

  return dir;
}
