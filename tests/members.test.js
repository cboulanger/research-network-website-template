import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMembersByLastname, renderMemberCard, memberMatches, memberSearchText, renderMemberListItem } from '../assets/js/members.js';

const sample = [
  { firstname: 'Jordan', lastname: 'Lee', affiliation: 'MPI', email: 'a@example.org' },
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'Uni X', email: 'b@example.org' },
];

test('sortMembersByLastname sorts alphabetically by lastname', () => {
  const sorted = sortMembersByLastname(sample);
  assert.deepEqual(sorted.map((m) => m.lastname), ['Adler', 'Lee']);
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
  assert.match(html, />JL</);
});

test('renderMemberCard does not expose the email address', () => {
  const html = renderMemberCard(sample[0]);
  assert.doesNotMatch(html, /mailto:/);
  assert.doesNotMatch(html, /a@example\.org/);
});

test('renderMemberCard uses a name-based slug as its id, not the email', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /id="jordan-lee"/);
  assert.doesNotMatch(html, /a%40example\.org/);
});

test('renderMemberCard carries a data-search attribute with name and affiliation', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /data-search="jordan lee mpi"/);
});

test('memberSearchText lowercases name and affiliation', () => {
  assert.equal(memberSearchText(sample[0]), 'jordan lee mpi');
});

test('renderMemberListItem carries a data-search attribute with name and affiliation', () => {
  const html = renderMemberListItem(sample[0]);
  assert.match(html, /data-search="jordan lee mpi"/);
});

test('memberMatches matches by name case-insensitively', () => {
  assert.equal(memberMatches('jordan', sample[0]), true);
  assert.equal(memberMatches('lee', sample[0]), true);
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
