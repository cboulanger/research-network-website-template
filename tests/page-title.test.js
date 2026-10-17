import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPageTitle } from '../scripts/lib/page-title.mjs';

test('extractPageTitle takes the first markdown heading as-is', () => {
  assert.equal(extractPageTitle('# About the Network\n\nBody text.', 'about.md'), 'About the Network');
});

test('extractPageTitle decodes HTML entities marked.parse introduces while escaping heading text', () => {
  assert.equal(
    extractPageTitle('# A new Working Group: "Histories of Law"\n\nBody text.', 'announcement.md'),
    'A new Working Group: "Histories of Law"'
  );
  assert.equal(extractPageTitle("# Rock & Roll's History\n\nBody.", 'music.md'), "Rock & Roll's History");
  assert.equal(extractPageTitle('# A < B and C > D\n\nBody.', 'compare.md'), 'A < B and C > D');
});

test('extractPageTitle strips inline markdown formatting tags from the heading', () => {
  assert.equal(extractPageTitle('# A **Bold** Title\n\nBody.', 'bold.md'), 'A Bold Title');
});

test('extractPageTitle falls back to a title-cased filename when there is no heading', () => {
  assert.equal(extractPageTitle('No heading here, just text.', 'no-heading.md'), 'No Heading');
});

test('extractPageTitle reads a literal, unescaped <h1> directly out of a raw HTML page', () => {
  assert.equal(extractPageTitle('<h1>A "quoted" title</h1>', 'quoted.html'), 'A "quoted" title');
});

test('extractPageTitle also decodes entities an HTML-page author wrote directly, same as a markdown heading', () => {
  assert.equal(extractPageTitle('<h1>A &quot;quoted&quot; title</h1>', 'quoted.html'), 'A "quoted" title');
});

test('extractPageTitle decodes &amp; last, so an entity reference typed on purpose is not unescaped twice', () => {
  // The author typed the literal text "&amp;lt;", meaning for "&lt;" to show up as visible
  // text in the heading (not for it to render as "<") — marked.parse() would re-escape the
  // "&" in their "&amp;lt;" to "&amp;amp;lt;"; decoding "&amp;" before "&lt;" would collapse
  // this all the way down to a bare "<", which is wrong.
  assert.equal(extractPageTitle('<h1>See &amp;lt; for details</h1>', 'entities.html'), 'See &lt; for details');
});

test('extractPageTitle falls back to the filename for a raw HTML page with no <h1>', () => {
  assert.equal(extractPageTitle('<p>no heading here</p>', 'no-heading.html'), 'No Heading');
});
