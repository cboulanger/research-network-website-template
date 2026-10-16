import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readContentFile, writeContentFile, deleteContentFile, listContentDir, isRemoteContentPath, authHeaders } from '../scripts/lib/content-store.mjs';

test('isRemoteContentPath recognizes http(s) URLs and rejects local paths', () => {
  assert.equal(isRemoteContentPath('https://example.org/content'), true);
  assert.equal(isRemoteContentPath('http://example.org/content'), true);
  assert.equal(isRemoteContentPath('./content'), false);
  assert.equal(isRemoteContentPath('/abs/path'), false);
});

test('authHeaders is empty without credentials and Basic-encoded with them', () => {
  const originalUser = process.env.CONTENT_USERNAME;
  const originalPass = process.env.CONTENT_PASSWORD;
  delete process.env.CONTENT_USERNAME;
  delete process.env.CONTENT_PASSWORD;
  assert.deepEqual(authHeaders(), {});
  process.env.CONTENT_USERNAME = 'alice';
  process.env.CONTENT_PASSWORD = 'secret';
  assert.deepEqual(authHeaders(), { Authorization: `Basic ${Buffer.from('alice:secret').toString('base64')}` });
  if (originalUser === undefined) delete process.env.CONTENT_USERNAME;
  else process.env.CONTENT_USERNAME = originalUser;
  if (originalPass === undefined) delete process.env.CONTENT_PASSWORD;
  else process.env.CONTENT_PASSWORD = originalPass;
});

test('readContentFile reads a local file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await writeFile(path.join(dir, 'data.json'), '{"a":1}', 'utf8');
  assert.equal(await readContentFile(dir, 'data.json'), '{"a":1}');
  await rm(dir, { recursive: true, force: true });
});

test('writeContentFile writes a local file, creating parent directories', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await writeContentFile(dir, 'data/members.json', '[]');
  assert.equal(await readFile(path.join(dir, 'data', 'members.json'), 'utf8'), '[]');
  await rm(dir, { recursive: true, force: true });
});

test('readContentFile fetches a remote file with auth headers', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => 'remote content' };
  };
  process.env.CONTENT_USERNAME = 'alice';
  process.env.CONTENT_PASSWORD = 'secret';
  try {
    const text = await readContentFile('https://example.org/content', 'data/members.json');
    assert.equal(text, 'remote content');
    assert.equal(requests[0].url, 'https://example.org/content/data/members.json');
    assert.equal(requests[0].options.headers.Authorization, `Basic ${Buffer.from('alice:secret').toString('base64')}`);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CONTENT_USERNAME;
    delete process.env.CONTENT_PASSWORD;
  }
});

test('readContentFile throws a descriptive error on a failed remote fetch', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
  try {
    await assert.rejects(
      () => readContentFile('https://example.org/content', 'data/members.json'),
      /Failed to fetch https:\/\/example\.org\/content\/data\/members\.json: 404 Not Found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeContentFile PUTs a remote file with the given content', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    await writeContentFile('https://example.org/content', 'data/members.json', '[]');
    assert.equal(requests[0].url, 'https://example.org/content/data/members.json');
    assert.equal(requests[0].options.method, 'PUT');
    assert.equal(requests[0].options.body, '[]');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeContentFile throws a descriptive error on a failed remote PUT', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
  try {
    await assert.rejects(
      () => writeContentFile('https://example.org/content', 'data/members.json', '[]'),
      /Failed to write https:\/\/example\.org\/content\/data\/members\.json: 403 Forbidden/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listContentDir lists local files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await mkdir(path.join(dir, 'pages'));
  await writeFile(path.join(dir, 'pages', 'about.md'), '# About', 'utf8');
  await writeFile(path.join(dir, 'pages', 'example.html'), '<h1>Example</h1>', 'utf8');
  const names = await listContentDir(dir, 'pages');
  assert.deepEqual(names.sort(), ['about.md', 'example.html']);
  await rm(dir, { recursive: true, force: true });
});

test('listContentDir sends a PROPFIND to a remote directory and extracts filenames from the multistatus response', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/files/user/content/pages/</d:href></d:response>
  <d:response><d:href>/dav/files/user/content/pages/about.md</d:href></d:response>
  <d:response><d:href>/dav/files/user/content/pages/example.html</d:href></d:response>
</d:multistatus>`,
    };
  };
  try {
    const names = await listContentDir('https://example.org/content', 'pages');
    assert.deepEqual(names.sort(), ['about.md', 'example.html']);
    assert.equal(requests[0].url, 'https://example.org/content/pages/');
    assert.equal(requests[0].options.method, 'PROPFIND');
    assert.equal(requests[0].options.headers.Depth, '1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listContentDir handles a multistatus response with no namespace prefix on <href>', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => `<?xml version="1.0"?>
<multistatus xmlns="DAV:">
  <response><href>/content/pages/</href></response>
  <response><href>/content/pages/about.md</href></response>
</multistatus>`,
  });
  try {
    const names = await listContentDir('https://example.org/content', 'pages');
    assert.deepEqual(names, ['about.md']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listContentDir throws a descriptive error on a failed remote PROPFIND', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
  try {
    await assert.rejects(
      () => listContentDir('https://example.org/content', 'pages'),
      /Failed to list https:\/\/example\.org\/content\/pages\/: 404 Not Found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteContentFile removes a local file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await writeFile(path.join(dir, 'about.md'), '# About', 'utf8');
  await deleteContentFile(dir, 'about.md');
  await assert.rejects(() => readFile(path.join(dir, 'about.md'), 'utf8'));
  await rm(dir, { recursive: true, force: true });
});

test('deleteContentFile DELETEs a remote file', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    await deleteContentFile('https://example.org/content', 'pages/about.md');
    assert.equal(requests[0].url, 'https://example.org/content/pages/about.md');
    assert.equal(requests[0].options.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteContentFile throws a descriptive error on a failed remote DELETE', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
  try {
    await assert.rejects(
      () => deleteContentFile('https://example.org/content', 'pages/about.md'),
      /Failed to delete https:\/\/example\.org\/content\/pages\/about\.md: 403 Forbidden/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeContentFile sends a custom Content-Type when given one', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    await writeContentFile('https://example.org/content', 'pages/about.md', '# About', 'text/markdown');
    assert.equal(requests[0].options.headers['Content-Type'], 'text/markdown');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
