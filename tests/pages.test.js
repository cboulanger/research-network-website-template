import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDocFilename, getDocType, titleFromFilename, resolveBackLink } from '../assets/js/pages.js';

test('isValidDocFilename accepts simple .md and .html filenames', () => {
  assert.equal(isValidDocFilename('about.md'), true);
  assert.equal(isValidDocFilename('example.html'), true);
  assert.equal(isValidDocFilename('my-page_v2.md'), true);
});

test('isValidDocFilename rejects path traversal and unsafe characters', () => {
  assert.equal(isValidDocFilename('../data/members.json'), false);
  assert.equal(isValidDocFilename('about.md/../evil'), false);
  assert.equal(isValidDocFilename('a b.md'), false);
  assert.equal(isValidDocFilename('script.js'), false);
});

test('isValidDocFilename rejects non-string or empty input', () => {
  assert.equal(isValidDocFilename(''), false);
  assert.equal(isValidDocFilename(null), false);
  assert.equal(isValidDocFilename(undefined), false);
});

test('getDocType returns markdown or html for valid filenames', () => {
  assert.equal(getDocType('about.md'), 'markdown');
  assert.equal(getDocType('example.html'), 'html');
});

test('getDocType returns null for invalid filenames', () => {
  assert.equal(getDocType('../evil'), null);
  assert.equal(getDocType('script.js'), null);
});

test('titleFromFilename strips the extension and title-cases hyphen/underscore-separated words', () => {
  assert.equal(titleFromFilename('about.md'), 'About');
  assert.equal(titleFromFilename('example.html'), 'Example');
  assert.equal(titleFromFilename('my-page_v2.md'), 'My Page V2');
});

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
