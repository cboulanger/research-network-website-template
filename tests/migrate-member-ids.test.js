import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateMemberIds } from '../scripts/migrate-member-ids.mjs';

const baseMembers = [
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'ada@example.org' },
  { firstname: 'Bo', lastname: 'Bergman', affiliation: 'Y', email: 'bo@example.org' },
];

test('migrateMemberIds assigns a lastname-firstname id to members without one', () => {
  const { members, assignedIds } = migrateMemberIds(baseMembers, []);
  assert.deepEqual(members.map((m) => m.id), ['adler-ada', 'bergman-bo']);
  assert.deepEqual(assignedIds, [
    { name: 'Ada Adler', id: 'adler-ada' },
    { name: 'Bo Bergman', id: 'bergman-bo' },
  ]);
});

test('migrateMemberIds leaves an existing valid id untouched (idempotent)', () => {
  const members = [{ ...baseMembers[0], id: 'adler-ada' }];
  const { members: migrated, assignedIds } = migrateMemberIds(members, []);
  assert.equal(migrated[0].id, 'adler-ada');
  assert.deepEqual(assignedIds, []);
});

test('migrateMemberIds resolves a same-id collision with a numeric suffix', () => {
  const members = [
    { firstname: 'Ada', lastname: 'Adler', email: 'ada1@example.org' },
    { firstname: 'Ada', lastname: 'Adler', email: 'ada2@example.org' },
  ];
  const { members: migrated } = migrateMemberIds(members, []);
  assert.deepEqual(migrated.map((m) => m.id), ['adler-ada', 'adler-ada-2']);
});

test('migrateMemberIds rewrites project participants from email to the matching member id', () => {
  const projects = [{ id: 'p1', title: 'P', participants: ['ada@example.org', 'bo@example.org'] }];
  const { projects: migrated, rewrittenParticipants } = migrateMemberIds(baseMembers, projects);
  assert.deepEqual(migrated[0].participants, ['adler-ada', 'bergman-bo']);
  assert.equal(rewrittenParticipants, 2);
});

test('migrateMemberIds leaves an already-migrated participant id untouched (idempotent)', () => {
  const projects = [{ id: 'p1', title: 'P', participants: ['adler-ada'] }];
  const members = [{ ...baseMembers[0], id: 'adler-ada' }];
  const { projects: migrated, rewrittenParticipants, warnings } = migrateMemberIds(members, projects);
  assert.deepEqual(migrated[0].participants, ['adler-ada']);
  assert.equal(rewrittenParticipants, 0);
  assert.deepEqual(warnings, []);
});

test('migrateMemberIds warns about a participant email/id matching no member', () => {
  const projects = [{ id: 'p1', title: 'P', participants: ['ghost@example.org'] }];
  const { warnings } = migrateMemberIds(baseMembers, projects);
  assert.deepEqual(warnings, ['Project "p1" references unknown participant "ghost@example.org"']);
});

test('migrateMemberIds does not mutate its input arrays', () => {
  const membersCopy = JSON.parse(JSON.stringify(baseMembers));
  const projects = [{ id: 'p1', title: 'P', participants: ['ada@example.org'] }];
  const projectsCopy = JSON.parse(JSON.stringify(projects));
  migrateMemberIds(baseMembers, projects);
  assert.deepEqual(baseMembers, membersCopy);
  assert.deepEqual(projects, projectsCopy);
});
