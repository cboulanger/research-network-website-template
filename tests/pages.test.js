import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDocFilename, getDocType } from '../assets/js/pages.js';

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
