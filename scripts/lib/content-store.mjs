// Reads/writes a single file inside a CONTENT_PATH tree, which is either a
// local directory or a remote http(s) URL (WebDAV). Shared by the build's
// remote-content fetcher and any tool that needs to write content back
// (migration scripts, the local data editor).
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
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
    if (!res.ok) throw Object.assign(new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`), { status: res.status });
    return res.text();
  }
  return readFile(path.join(contentPath, relPath), 'utf8');
}

export async function writeContentFile(contentPath, relPath, content, contentType = 'application/json') {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(
      url,
      { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': contentType }, body: content },
      timeoutOpts()
    );
    if (!res.ok) throw new Error(`Failed to write ${url}: ${res.status} ${res.statusText}`);
    return;
  }
  const fullPath = path.join(contentPath, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

export async function deleteContentFile(contentPath, relPath) {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(url, { method: 'DELETE', headers: authHeaders() }, timeoutOpts());
    if (!res.ok) throw new Error(`Failed to delete ${url}: ${res.status} ${res.statusText}`);
    return;
  }
  await unlink(path.join(contentPath, relPath));
}

// Lists the basenames of the files directly inside a content-tree directory
// (no recursion). Remote listing uses WebDAV PROPFIND (Depth: 1); the
// response is a multistatus XML document, which is parsed with a targeted
// regex rather than a full XML parser — the <href> tag's namespace prefix
// varies by server ("d:href", "D:href", or none with a default namespace),
// so the prefix is optional in the pattern. A <href> ending in "/" denotes a
// collection (directory), not a file — this is how the directory's own
// self-entry (always present in a Depth: 1 PROPFIND response) is
// distinguished and excluded from the result, along with any nested
// subdirectories.
export async function listContentDir(contentPath, relPath) {
  if (isRemoteContentPath(contentPath)) {
    const dirPath = relPath.replace(/\/+$/, '') + '/';
    const url = remoteUrl(contentPath, dirPath);
    const res = await fetchWithTimeout(
      url,
      { method: 'PROPFIND', headers: { ...authHeaders(), Depth: '1' } },
      timeoutOpts()
    );
    if (!res.ok) throw new Error(`Failed to list ${url}: ${res.status} ${res.statusText}`);
    const text = await res.text();
    const names = new Set();
    for (const match of text.matchAll(/<(?:[^:>]*:)?href>([^<]+)<\/(?:[^:>]*:)?href>/gi)) {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.endsWith('/')) continue; // collection (directory) entry, including the dir's own self-entry
      const basename = decoded.split('/').filter(Boolean).pop();
      if (basename) names.add(basename);
    }
    return [...names];
  }
  return readdir(path.join(contentPath, relPath));
}
