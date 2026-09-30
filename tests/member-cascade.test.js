import test from 'node:test';
import assert from 'node:assert/strict';
import { findProjectsReferencingMember, cascadeDeleteMember } from '../scripts/lib/member-cascade.mjs';

const members = [{ id: 'adler-ada' }, { id: 'bergman-bo' }];
const projects = [
  { id: 'p1', title: 'One', participants: ['adler-ada', 'bergman-bo'] },
  { id: 'p2', title: 'Two', participants: ['bergman-bo'] },
  { id: 'p3', title: 'Three', participants: [] },
];

test('findProjectsReferencingMember returns only projects listing the given member id', () => {
  const found = findProjectsReferencingMember(projects, 'adler-ada');
  assert.deepEqual(found.map((p) => p.id), ['p1']);
});

test('findProjectsReferencingMember returns an empty array when no project references the member', () => {
  assert.deepEqual(findProjectsReferencingMember(projects, 'ghost'), []);
});

test('cascadeDeleteMember removes the member and strips their id from every project', () => {
  const result = cascadeDeleteMember(members, projects, 'bergman-bo');
  assert.deepEqual(result.members.map((m) => m.id), ['adler-ada']);
  assert.deepEqual(result.projects.find((p) => p.id === 'p1').participants, ['adler-ada']);
  assert.deepEqual(result.projects.find((p) => p.id === 'p2').participants, []);
  assert.deepEqual(result.projects.find((p) => p.id === 'p3').participants, []);
});

test('cascadeDeleteMember does not mutate its input arrays', () => {
  const membersCopy = JSON.parse(JSON.stringify(members));
  const projectsCopy = JSON.parse(JSON.stringify(projects));
  cascadeDeleteMember(members, projects, 'bergman-bo');
  assert.deepEqual(members, membersCopy);
  assert.deepEqual(projects, projectsCopy);
});
