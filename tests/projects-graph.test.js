import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphData, filterMatches, buildProjectListItems } from '../assets/js/projects-graph.js';

const members = [
  { firstname: 'Ada', lastname: 'Adler', email: 'ada@example.org' },
  { firstname: 'Bo', lastname: 'Bergman', email: 'bo@example.org' },
];
const projects = [
  { id: 'p1', title: 'Project One', participants: ['ada@example.org', 'bo@example.org'] },
  { id: 'p2', title: 'Project Two', participants: ['ada@example.org', 'ghost@example.org'] },
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
  const node = { type: 'project', data: { title: 'A History of the RCSL' } };
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
