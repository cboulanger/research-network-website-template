import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitials, hashColor, navHTML } from '../assets/js/shared.js';

test('getInitials combines first letters of first and last name', () => {
  assert.equal(getInitials('Christian', 'Boulanger'), 'CB');
});

test('getInitials handles missing names gracefully', () => {
  assert.equal(getInitials('', ''), '');
  assert.equal(getInitials(undefined, 'Boulanger'), 'B');
});

test('hashColor is deterministic for the same key', () => {
  const a = hashColor('boulanger@lhlt.mpg.de');
  const b = hashColor('boulanger@lhlt.mpg.de');
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
