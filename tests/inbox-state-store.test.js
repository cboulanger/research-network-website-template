import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentStateStore, withLegacyFallback } from '../scripts/lib/inbox-state-store.mjs';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'inbox-state-'));

test('content store round-trips through a local content folder; missing file reads as null', async () => {
  const dir = await tempDir();
  const store = contentStateStore(dir);
  assert.equal(await store.read(), null);
  await store.write('{"lastId":"a"}');
  assert.equal(await store.read(), '{"lastId":"a"}');
  assert.equal(await readFile(path.join(dir, 'inbox-state.json'), 'utf8'), '{"lastId":"a"}');
  await store.quarantine('broken');
  assert.equal((await readdir(dir)).filter((f) => f.startsWith('inbox-state.json.corrupt-')).length, 1);
});

test('content store works against a WebDAV-style remote; 404 reads as null, other errors propagate', async () => {
  const files = new Map();
  let failing = false;
  const server = http.createServer((req, res) => {
    if (failing) return res.writeHead(500).end();
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        files.set(req.url, body);
        res.writeHead(201).end();
      });
    } else if (files.has(req.url)) res.writeHead(200).end(files.get(req.url));
    else res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const store = contentStateStore(`http://127.0.0.1:${server.address().port}/share/`);
    assert.equal(await store.read(), null);
    await store.write('state');
    assert.equal(files.get('/share/inbox-state.json'), 'state');
    assert.equal(await store.read(), 'state');
    failing = true;
    await assert.rejects(store.read(), /500/);
  } finally {
    server.close();
  }
});

test('legacy local file is used until the content store has state, and never written to', async () => {
  const dir = await tempDir();
  const legacyPath = path.join(dir, 'legacy.json');
  await writeFile(legacyPath, '{"lastId":"old"}');
  const store = withLegacyFallback(contentStateStore(dir), [path.join(dir, 'missing.json'), legacyPath]);
  assert.equal(await store.read(), '{"lastId":"old"}');
  await store.write('{"lastId":"new"}');
  assert.equal(await store.read(), '{"lastId":"new"}');
  assert.equal(await readFile(legacyPath, 'utf8'), '{"lastId":"old"}');
});
