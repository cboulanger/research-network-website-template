// Reads/writes a single file inside a CONTENT_PATH tree, which is either a
// local directory or a remote http(s) URL (WebDAV). Shared by the build's
// remote-content fetcher and any tool that needs to write content back
// (migration scripts, the local data editor).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithTimeout, timeoutFromEnv } from './fetch-with-timeout.mjs';

export function isRemoteContentPath(contentPath) {
  return /^https?:\/\//i.test(contentPath);
}

export function authHeaders() {
  const username = process.env.CONTENT_USERNAME;
  const password = process.env.CONTENT_PASSWORD;
  if (!username && !password) return {};
  const token = Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

function timeoutOpts() {
  return { timeoutMs: timeoutFromEnv('CONTENT_TIMEOUT_MS', 30000) };
}

function remoteUrl(contentPath, relPath) {
  return `${contentPath.replace(/\/+$/, '')}/${relPath}`;
}

export async function readContentFile(contentPath, relPath) {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(url, { headers: authHeaders() }, timeoutOpts());
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return res.text();
  }
  return readFile(path.join(contentPath, relPath), 'utf8');
}

export async function writeContentFile(contentPath, relPath, content) {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(
      url,
      { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: content },
      timeoutOpts()
    );
    if (!res.ok) throw new Error(`Failed to write ${url}: ${res.status} ${res.statusText}`);
    return;
  }
  const fullPath = path.join(contentPath, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}
