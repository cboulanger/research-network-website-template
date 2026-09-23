import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { materializeRemote } from '../scripts/lib/resolve-content-remote.mjs';

const FIXTURE_SITE = { bannerLabel: 'CLFN', title: 'Test', subtitle: 'Test', favicon: 'favicon.ico', logo: 'logo.png' };
const FIXTURE_NEWS = [{ date: '2026-01-01', title: 'x', url: 'pages.html?doc=about.md' }];
const FIXTURE_EVENTS = [];

function fakeFetch(files) {
  return async (url, options = {}) => {
    const key = url.replace(/^https:\/\/example\.org\/content\//, '');
    if (!(key in files)) {
      return { ok: false, status: 404, statusText: 'Not Found' };
    }
    const body = files[key];
    return {
      ok: true,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      arrayBuffer: async () => new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)).buffer,
    };
  };
}

test('materializeRemote fetches known JSON files, referenced pages, and referenced images', async () => {
  const files = {
    'data/site.json': FIXTURE_SITE,
    'data/members.json': [],
    'data/projects.json': [],
    'data/events.json': FIXTURE_EVENTS,
    'data/news.json': FIXTURE_NEWS,
    'pages/about.md': '# About',
    'images/favicon.ico': 'fake-ico-bytes',
    'images/logo.png': 'fake-png-bytes',
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(files);
  try {
    const dir = await materializeRemote('https://example.org/content');
    const site = JSON.parse(await readFile(path.join(dir, 'data', 'site.json'), 'utf8'));
    assert.equal(site.bannerLabel, 'CLFN');
    const about = await readFile(path.join(dir, 'pages', 'about.md'), 'utf8');
    assert.equal(about, '# About');
    const favicon = await readFile(path.join(dir, 'images', 'favicon.ico'), 'utf8');
    assert.equal(favicon, 'fake-ico-bytes');
    await rm(dir, { recursive: true, force: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('materializeRemote throws with the failing URL when a fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch({});
  try {
    await assert.rejects(() => materializeRemote('https://example.org/content'), /data\/site\.json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
