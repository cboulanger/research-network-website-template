import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNewsByDateDesc, isExternalLink, renderNewsItem, renderNews, renderNewsTeaser } from '../assets/js/news.js';

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

test('renderNewsItem escapes a hostile title', () => {
  const html = renderNewsItem({ date: '2024-01-01', title: '<img src=x onerror=alert(1)>', url: 'https://example.org' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('renderNews shows only the empty state for an empty list', () => {
  const container = { innerHTML: '' };
  renderNews([], container);
  assert.match(container.innerHTML, /No news yet\./);
});

test('renderNews renders every item, sorted newest first', () => {
  const container = { innerHTML: '' };
  renderNews(items, container);
  const order = [...container.innerHTML.matchAll(/class="news-date">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['2026-11-10', '2024-09-04', '2023-01-15']);
});

test('renderNewsTeaser shows only the 3 most recent items plus a "See all news" link', () => {
  const fourItems = [
    ...items,
    { date: '2020-01-01', title: 'Ancient news', url: 'https://example.org/old' },
  ];
  const container = { innerHTML: '' };
  renderNewsTeaser(fourItems, container);
  const order = [...container.innerHTML.matchAll(/class="news-date">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['2026-11-10', '2024-09-04', '2023-01-15']);
  assert.match(container.innerHTML, /See all news/);
  assert.match(container.innerHTML, /href="news.html"/);
});

test('renderNewsTeaser shows the empty state for an empty list, with no "See all news" link', () => {
  const container = { innerHTML: '' };
  renderNewsTeaser([], container);
  assert.match(container.innerHTML, /No news yet\./);
  assert.doesNotMatch(container.innerHTML, /See all news/);
});
