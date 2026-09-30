import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readContentFile, writeContentFile, isRemoteContentPath, authHeaders } from '../scripts/lib/content-store.mjs';

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
