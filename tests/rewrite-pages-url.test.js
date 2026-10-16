import test from 'node:test';
import assert from 'node:assert/strict';
import { rewritePagesUrl, rewritePagesLinksInHTML } from '../scripts/lib/rewrite-pages-url.mjs';

test('rewritePagesUrl rewrites a pages.html?doc= URL to a static pages/ URL', () => {
  assert.equal(rewritePagesUrl('pages.html?doc=about.md'), 'pages/about.html');
  assert.equal(rewritePagesUrl('pages.html?doc=example.html'), 'pages/example.html');
});

test('rewritePagesUrl leaves other URLs unchanged', () => {
  assert.equal(rewritePagesUrl('https://example.org'), 'https://example.org');
  assert.equal(rewritePagesUrl(undefined), undefined);
});

test('rewritePagesLinksInHTML rewrites every pages.html?doc= link in a block of HTML to a static pages/ URL', () => {
  const html = '<a href="pages.html?doc=about.md">About</a> and <a href="pages.html?doc=example.html">Example</a>';
  assert.equal(
    rewritePagesLinksInHTML(html),
    '<a href="pages/about.html">About</a> and <a href="pages/example.html">Example</a>'
  );
});

test('rewritePagesLinksInHTML leaves external links and plain text unchanged', () => {
  const html = '<a href="https://example.org">Ext</a><span>no links here</span>';
  assert.equal(rewritePagesLinksInHTML(html), html);
});

test('rewritePagesLinksInHTML does not rewrite the text "pages.html?doc=..." when it is not inside an href', () => {
  const html = '<span class="event-title">Launching pages.html?doc=about.md support</span>';
  assert.equal(rewritePagesLinksInHTML(html), html);
});
