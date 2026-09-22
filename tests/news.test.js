import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNewsByDateDesc, isExternalLink, renderNewsItem } from '../assets/js/news.js';

const items = [
  { date: '2024-09-04', title: 'Old news', url: 'https://example.org' },
  { date: '2026-11-10', title: 'New news', url: 'pages.html?doc=about.md' },
  { date: '2023-01-15', title: 'Oldest news', url: 'https://example.org/a' },
];

test('sortNewsByDateDesc orders newest first', () => {
  const sorted = sortNewsByDateDesc(items);
  assert.deepEqual(sorted.map((e) => e.date), ['2026-11-10', '2024-09-04', '2023-01-15']);
});

test('isExternalLink recognizes absolute http(s) URLs', () => {
  assert.equal(isExternalLink('https://example.org'), true);
  assert.equal(isExternalLink('http://example.org'), true);
});

test('isExternalLink treats relative links as internal', () => {
  assert.equal(isExternalLink('pages.html?doc=about.md'), false);
});

test('renderNewsItem adds target=_blank only for external links', () => {
  const external = renderNewsItem(items[0]);
  const internal = renderNewsItem(items[1]);
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
});
