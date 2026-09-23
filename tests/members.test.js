import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMembersByLastname, renderMemberCard, memberMatches, renderMemberListItem } from '../assets/js/members.js';

const sample = [
  { firstname: 'Christian', lastname: 'Boulanger', affiliation: 'MPI', email: 'a@example.org' },
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'Uni X', email: 'b@example.org' },
];

test('sortMembersByLastname sorts alphabetically by lastname', () => {
  const sorted = sortMembersByLastname(sample);
  assert.deepEqual(sorted.map((m) => m.lastname), ['Adler', 'Boulanger']);
});

test('sortMembersByLastname does not mutate the input array', () => {
  const copy = [...sample];
  sortMembersByLastname(sample);
  assert.deepEqual(sample, copy);
});

test('renderMemberCard links the name when url is present', () => {
  const html = renderMemberCard({ ...sample[0], url: 'https://example.org/cb' });
  assert.match(html, /<a href="https:\/\/example.org\/cb"/);
});

test('renderMemberCard falls back to initials avatar when no portrait_url', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /class="avatar-fallback"/);
  assert.match(html, />CB</);
});

test('renderMemberCard does not expose the email address', () => {
  const html = renderMemberCard(sample[0]);
  assert.doesNotMatch(html, /mailto:/);
  assert.doesNotMatch(html, /a@example\.org/);
});

test('memberMatches matches by name case-insensitively', () => {
  assert.equal(memberMatches('christian', sample[0]), true);
  assert.equal(memberMatches('boulanger', sample[0]), true);
  assert.equal(memberMatches('nomatch', sample[0]), false);
});

test('memberMatches matches by affiliation', () => {
  assert.equal(memberMatches('uni x', sample[1]), true);
});

test('memberMatches treats an empty query as matching everything', () => {
  assert.equal(memberMatches('', sample[0]), true);
  assert.equal(memberMatches('   ', sample[0]), true);
});

test('renderMemberListItem links the name when url is present', () => {
  const html = renderMemberListItem({ ...sample[0], url: 'https://example.org/cb' });
  assert.match(html, /<a href="https:\/\/example.org\/cb"/);
});

test('renderMemberListItem omits the affiliation span when affiliation is missing', () => {
  const { affiliation, ...rest } = sample[0];
  const html = renderMemberListItem(rest);
  assert.doesNotMatch(html, /class="affiliation"/);
});

test('renderMemberListItem does not expose the email address', () => {
  const html = renderMemberListItem(sample[0]);
  assert.doesNotMatch(html, /mailto:/);
  assert.doesNotMatch(html, /a@example\.org/);
});
