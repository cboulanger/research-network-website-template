import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZoteroGroupId, fetchZoteroItems } from '../scripts/lib/zotero.mjs';

test('parseZoteroGroupId accepts a numeric id or a group URL', () => {
  assert.equal(parseZoteroGroupId(2211429), '2211429');
  assert.equal(parseZoteroGroupId('2211429'), '2211429');
  assert.equal(parseZoteroGroupId('https://www.zotero.org/groups/2211429'), '2211429');
  assert.equal(parseZoteroGroupId('https://www.zotero.org/groups/2211429/some-name/library'), '2211429');
  assert.throws(() => parseZoteroGroupId('https://www.zotero.org/groups/some-name'), /numeric group id/);
});

test('fetchZoteroItems pages through the whole library with the configured style', async () => {
  const all = Array.from({ length: 150 }, (_, i) => ({ key: `K${i}` }));
  const requested = [];
  const fakeFetch = async (url, options) => {
    requested.push({ url: new URL(url), headers: options.headers });
    const u = new URL(url);
    const start = Number(u.searchParams.get('start'));
    const limit = Number(u.searchParams.get('limit'));
    return {
      ok: true,
      headers: new Map([['total-results', String(all.length)]]),
      json: async () => all.slice(start, start + limit),
    };
  };
  const items = await fetchZoteroItems({ groupId: '42', style: 'apa', locale: 'de-DE', apiKey: 'k', fetchImpl: fakeFetch });
  assert.equal(items.length, 150);
  assert.equal(requested.length, 2);
  const first = requested[0].url;
  assert.equal(first.pathname, '/groups/42/items/top');
  assert.equal(first.searchParams.get('style'), 'apa');
  assert.equal(first.searchParams.get('locale'), 'de-DE');
  assert.equal(first.searchParams.get('include'), 'bib,data');
  assert.equal(first.searchParams.get('linkwrap'), '1');
  assert.equal(requested[0].headers['Zotero-API-Key'], 'k');
});

test('fetchZoteroItems explains a 403 (library not public)', async () => {
  const fakeFetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden', headers: new Map() });
  await assert.rejects(() => fetchZoteroItems({ groupId: '42', style: 'apa', fetchImpl: fakeFetch }), /403.*public/s);
});

test('fetchZoteroItems gives up on a stalled server after the timeout', async () => {
  // Like a real pending request, keep the event loop alive until aborted
  // (AbortSignal.timeout's own timer doesn't).
  const hangingFetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      const keepAlive = setInterval(() => {}, 1000);
      signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        reject(signal.reason);
      });
    });
  await assert.rejects(
    () => fetchZoteroItems({ groupId: '42', style: 'apa', fetchImpl: hangingFetch, timeoutMs: 50 }),
    /timed out after 0\.05s/
  );
});
