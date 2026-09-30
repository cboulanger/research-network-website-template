import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphData, filterMatches, buildProjectListItems, renderListView, sanitizeGraphData, parseMemberHash, participantsInclude } from '../assets/js/projects-graph.js';

const members = [
  { firstname: 'Ada', lastname: 'Adler', id: 'adler-ada', email: 'ada@example.org' },
  { firstname: 'Bo', lastname: 'Bergman', id: 'bergman-bo', email: 'bo@example.org' },
];
const projects = [
  { id: 'p1', title: 'Project One', participants: ['adler-ada', 'bergman-bo'] },
  { id: 'p2', title: 'Project Two', participants: ['adler-ada', 'ghost-id'] },
];

test('buildGraphData creates one node per project and per unique scholar', () => {
  const { nodes } = buildGraphData(projects, members);
  assert.equal(nodes.filter((n) => n.type === 'project').length, 2);
  assert.equal(nodes.filter((n) => n.type === 'scholar').length, 2);
});

test('buildGraphData skips participants with no matching member record', () => {
  const { links } = buildGraphData(projects, members);
  const p2Links = links.filter((l) => l.source === 'project:p2');
  assert.equal(p2Links.length, 1);
});

test('buildGraphData creates a link per project-participant pair', () => {
  const { links } = buildGraphData(projects, members);
  assert.equal(links.length, 3);
});

test('filterMatches matches project titles case-insensitively', () => {
  const node = { type: 'project', data: { title: 'A History of the CLFN' } };
  assert.equal(filterMatches('history', node), true);
  assert.equal(filterMatches('nomatch', node), false);
});

test('filterMatches matches scholar names', () => {
  const node = { type: 'scholar', data: { firstname: 'Ada', lastname: 'Adler' } };
  assert.equal(filterMatches('adler', node), true);
});

test('filterMatches treats an empty query as matching everything', () => {
  const node = { type: 'project', data: { title: 'Anything' } };
  assert.equal(filterMatches('', node), true);
});

test('buildProjectListItems attaches resolved participant names', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[0].participantNames.map((p) => p.name), ['Ada Adler', 'Bo Bergman']);
});

test('buildProjectListItems drops unknown participants', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[1].participantNames.map((p) => p.name), ['Ada Adler']);
});

test('buildProjectListItems attaches a slug instead of an email', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[0].participantNames.map((p) => p.slug), ['adler-ada', 'bergman-bo']);
  assert.equal('email' in items[0].participantNames[0], false);
});

test('renderListView links participants by slug, not email', () => {
  const container = {};
  renderListView(projects, members, container);
  assert.match(container.innerHTML, /href="members.html#adler-ada"/);
  assert.doesNotMatch(container.innerHTML, /ada%40example\.org/);
});

test('sanitizeGraphData drops email and keeps a slug on scholar nodes', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const scholar = sanitized.find((n) => n.type === 'scholar');
  assert.equal('email' in scholar.data, false);
  assert.equal(scholar.data.slug, 'adler-ada');
});

test('sanitizeGraphData drops the participants list from project nodes', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const project = sanitized.find((n) => n.type === 'project');
  assert.equal('participants' in project.data, false);
});

test('sanitizeGraphData does not leak the email into the scholar node id', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const scholar = sanitized.find((n) => n.type === 'scholar');
  assert.equal(scholar.id, 'scholar:adler-ada');
  assert.doesNotMatch(scholar.id, /@/);
});

test('sanitizeGraphData rewrites link source/target to match the sanitized scholar node ids', () => {
  const { nodes, links } = buildGraphData(projects, members);
  const { links: sanitizedLinks } = sanitizeGraphData(nodes, links);
  const linkToAda = sanitizedLinks.find((l) => l.source === 'project:p1' && l.target === 'scholar:adler-ada');
  assert.ok(linkToAda, 'expected a link from project:p1 to scholar:adler-ada');
  assert.equal(sanitizedLinks.some((l) => l.source.includes('@') || l.target.includes('@')), false);
});

test('renderListView tags each project with its participant slugs', () => {
  const container = {};
  renderListView(projects, members, container);
  assert.match(container.innerHTML, /data-participants="adler-ada bergman-bo"/);
  assert.match(container.innerHTML, /data-participants="adler-ada"/);
  assert.match(container.innerHTML, /<a href="members.html#bergman-bo" data-slug="bergman-bo">/);
});

test('parseMemberHash extracts the slug from a member hash', () => {
  assert.equal(parseMemberHash('#member=jane-doe'), 'jane-doe');
  assert.equal(parseMemberHash('member=jane-doe'), 'jane-doe');
  assert.equal(parseMemberHash('#member=jos%C3%A9-doe'), 'josé-doe');
});

test('parseMemberHash returns null for anything else', () => {
  assert.equal(parseMemberHash(''), null);
  assert.equal(parseMemberHash('#'), null);
  assert.equal(parseMemberHash('#member='), null);
  assert.equal(parseMemberHash('#other=x'), null);
  assert.equal(parseMemberHash('#member=%E0%A4%A'), null);
  assert.equal(parseMemberHash(undefined), null);
});

test('participantsInclude matches whole slugs only', () => {
  assert.equal(participantsInclude('adler-ada bergman-bo', 'bergman-bo'), true);
  assert.equal(participantsInclude('adler-ada', 'bergman-bo'), false);
  assert.equal(participantsInclude('anna-x', 'ann'), false);
  assert.equal(participantsInclude('', 'adler-ada'), false);
  assert.equal(participantsInclude(undefined, 'adler-ada'), false);
});
