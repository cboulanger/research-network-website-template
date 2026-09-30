import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML, getInitials, hashColor, navHTML, isExternalLink, resolvePortraitUrl, computeMemberId, textMatchesQuery, skipLinkHTML, isValidDocFilename, getDocType, titleFromFilename } from '../assets/js/shared.js';

test('getInitials combines first letters of first and last name', () => {
  assert.equal(getInitials('Jordan', 'Lee'), 'JL');
});

test('getInitials handles missing names gracefully', () => {
  assert.equal(getInitials('', ''), '');
  assert.equal(getInitials(undefined, 'Lee'), 'L');
});

test('hashColor is deterministic for the same key', () => {
  const a = hashColor('jordan.lee@example.org');
  const b = hashColor('jordan.lee@example.org');
  assert.equal(a, b);
});

test('hashColor returns a color from the given palette', () => {
  const palette = ['#111111', '#222222'];
  const color = hashColor('someone@example.org', palette);
  assert.ok(palette.includes(color));
});

test('navHTML marks the active page link', () => {
  const html = navHTML('members');
  assert.match(html, /<a href="members.html" class="active">Members<\/a>/);
});

test('navHTML has no active class when page does not match any link', () => {
  const html = navHTML('nonexistent');
  assert.doesNotMatch(html, /class="active"/);
});

test('navHTML defaults to the fallback banner label when none is given', () => {
  const html = navHTML('members');
  assert.match(html, /<span class="site-title">Site<\/span>/);
});

test('navHTML uses a custom banner label when provided', () => {
  const html = navHTML('members', 'Custom Site Name');
  assert.match(html, /<span class="site-title">Custom Site Name<\/span>/);
});

test('isExternalLink recognizes absolute http(s) URLs', () => {
  assert.equal(isExternalLink('https://example.org'), true);
  assert.equal(isExternalLink('http://example.org'), true);
});

test('isExternalLink treats relative links as internal', () => {
  assert.equal(isExternalLink('pages.html?doc=about.md'), false);
});

test('resolvePortraitUrl keeps http(s) URLs unchanged', () => {
  assert.equal(resolvePortraitUrl('https://example.org/a.jpg'), 'https://example.org/a.jpg');
});

test('resolvePortraitUrl maps a bare filename into images/', () => {
  assert.equal(resolvePortraitUrl('murayama.jpg'), 'images/murayama.jpg');
});

test('computeMemberId builds a lowercase hyphenated id from lastname and firstname', () => {
  assert.equal(computeMemberId('Ada', 'Adler'), 'adler-ada');
});

test('computeMemberId strips characters that are not letters or digits', () => {
  assert.equal(computeMemberId("O'Brien", 'Smith-Jones'), 'smith-jones-o-brien');
});

test('computeMemberId transliterates accented letters instead of dropping them', () => {
  assert.equal(computeMemberId('Patrícia', 'André'), 'andre-patricia');
  assert.equal(computeMemberId('Balázs', 'Fekete'), 'fekete-balazs');
});

test('textMatchesQuery treats an empty query as matching everything', () => {
  assert.equal(textMatchesQuery('', 'ada adler'), true);
  assert.equal(textMatchesQuery('   ', 'ada adler'), true);
});

test('textMatchesQuery matches a substring case-insensitively', () => {
  assert.equal(textMatchesQuery('ADLER', 'ada adler institute'), true);
  assert.equal(textMatchesQuery('nomatch', 'ada adler institute'), false);
});

test('skipLinkHTML links to #main-content', () => {
  assert.match(skipLinkHTML(), /href="#main-content"/);
  assert.match(skipLinkHTML(), /class="skip-link"/);
});

test('isValidDocFilename accepts simple .md and .html filenames', () => {
  assert.equal(isValidDocFilename('about.md'), true);
  assert.equal(isValidDocFilename('example.html'), true);
  assert.equal(isValidDocFilename('my-page_v2.md'), true);
});

test('isValidDocFilename rejects path traversal and unsafe characters', () => {
  assert.equal(isValidDocFilename('../content/members.json'), false);
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

test('navHTML leaves out excluded pages', () => {
  assert.match(navHTML('home'), /publications\.html/);
  assert.doesNotMatch(navHTML('home', 'Site', ['publications']), /publications\.html/);
});
