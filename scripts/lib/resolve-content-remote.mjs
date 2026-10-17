import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchWithTimeout, timeoutFromEnv } from './fetch-with-timeout.mjs';
import { isExternalLink, isValidDocFilename } from '../../assets/js/shared.js';
import { authHeaders, readContentFile } from './content-store.mjs';

const DATA_FILES = ['site', 'members', 'projects', 'events', 'news'];
const OPTIONAL_DATA_FILES = ['publications'];

function fetchContent(url) {
  return fetchWithTimeout(url, { headers: authHeaders() }, { timeoutMs: timeoutFromEnv('CONTENT_TIMEOUT_MS', 30000) });
}

async function fetchOk(url) {
  const res = await fetchContent(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res;
}

// events.url/news.url/projects.url store either an external URL or a bare
// page filename (see assets/js/shared.js's resolvePageLink).
function referencedPageNames(newsItems, eventsItems, projectItems) {
  const names = new Set(['about.md']);
  for (const item of [...newsItems, ...eventsItems, ...projectItems]) {
    if (typeof item.url === 'string' && isValidDocFilename(item.url)) names.add(item.url);
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
    const text = await readContentFile(baseUrl, `data/${name}.json`);
    await writeFile(path.join(dir, 'data', `${name}.json`), text, 'utf8');
    data[name] = JSON.parse(text);
  }

  for (const name of OPTIONAL_DATA_FILES) {
    const url = `${baseUrl}/data/${name}.json`;
    const res = await fetchContent(url);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    await writeFile(path.join(dir, 'data', `${name}.json`), await res.text(), 'utf8');
  }

  for (const name of referencedPageNames(data.news, data.events, data.projects)) {
    let text;
    try {
      text = await readContentFile(baseUrl, `pages/${name}`);
    } catch (err) {
      if (err.status === 404) {
        console.warn(`Warning: page "${name}" is referenced from news/events/projects but no longer exists in the content store; skipping it (the link will 404).`);
        continue;
      }
      throw err;
    }
    await writeFile(path.join(dir, 'pages', name), text, 'utf8');
  }

  const portraitImages = data.members.map((m) => m.portrait_url).filter((url) => url && !isExternalLink(url));
  const projectImages = (data.projects ?? []).map((p) => p.image_url).filter((url) => url && !isExternalLink(url));
  for (const name of new Set([data.site.favicon, data.site.logo, ...portraitImages, ...projectImages].filter(Boolean))) {
    const buffer = Buffer.from(await (await fetchOk(`${baseUrl}/images/${name}`)).arrayBuffer());
    await writeFile(path.join(dir, 'images', name), buffer);
  }

  return dir;
}
