import test from 'node:test';
import assert from 'node:assert/strict';
import { rewritePagesUrl } from '../scripts/lib/rewrite-pages-url.mjs';

test('rewritePagesUrl rewrites a pages.html?doc= URL to a static pages/ URL', () => {
  assert.equal(rewritePagesUrl('pages.html?doc=about.md'), 'pages/about.html');
  assert.equal(rewritePagesUrl('pages.html?doc=example.html'), 'pages/example.html');
});

test('rewritePagesUrl leaves other URLs unchanged', () => {
  assert.equal(rewritePagesUrl('https://example.org'), 'https://example.org');
  assert.equal(rewritePagesUrl(undefined), undefined);
});
