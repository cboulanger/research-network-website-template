import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackLink } from '../assets/js/page-back-link.js';

test('resolveBackLink recognizes a news.html referrer', () => {
  assert.deepEqual(resolveBackLink('https://site.example/news.html'), { label: 'All News', href: 'news.html' });
  assert.deepEqual(resolveBackLink('https://site.example/news.html?x=1'), { label: 'All News', href: 'news.html' });
});

test('resolveBackLink recognizes an events.html referrer', () => {
  assert.deepEqual(resolveBackLink('https://site.example/events.html'), { label: 'All Events', href: 'events.html' });
});

test('resolveBackLink does not false-positive on a similarly-named page', () => {
  assert.equal(resolveBackLink('https://site.example/not-news.html'), null);
});

test('resolveBackLink returns null for an unrelated or missing referrer', () => {
  assert.equal(resolveBackLink('https://site.example/projects.html'), null);
  assert.equal(resolveBackLink(''), null);
  assert.equal(resolveBackLink(undefined), null);
});
