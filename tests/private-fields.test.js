import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isPrivate, stripPrivateSchema, toSubmissionSchema,
  stripPrivateRecord, stripPrivateRecords, pickPrivateRecord,
} from '../assets/js/private-fields.js';

const members = JSON.parse(readFileSync('schema/members.schema.json', 'utf8'));
const events = JSON.parse(readFileSync('schema/events.schema.json', 'utf8'));

test('members.email is flagged private, id is not', () => {
  assert.equal(isPrivate(members.items.properties.email), true);
  assert.equal(isPrivate(members.items.properties.id), false);
  assert.equal(isPrivate(undefined), false);
});

test('stripPrivateSchema removes private props and their required entries, keeps the array wrapper', () => {
  const stripped = stripPrivateSchema(members);
  assert.equal(stripped.type, 'array');
  assert.equal('email' in stripped.items.properties, false);
  assert.equal(stripped.items.required.includes('email'), false);
  assert.equal(stripped.items.required.includes('lastname'), true);
});

test('stripPrivateSchema does not mutate its input and leaves schemas without private fields equal', () => {
  const before = JSON.stringify(members);
  stripPrivateSchema(members);
  assert.equal(JSON.stringify(members), before);
  assert.deepEqual(stripPrivateSchema(events), events);
});

test('toSubmissionSchema drops readOnly props from required but keeps them as properties', () => {
  const sub = toSubmissionSchema(members);
  assert.equal(sub.items.required.includes('id'), false);
  assert.ok(sub.items.properties.id);
  assert.equal('email' in sub.items.properties, false);
});

test('stripPrivateRecord/Records remove only private fields; pickPrivateRecord returns only them', () => {
  const rec = { id: 'a-b', lastname: 'B', firstname: 'A', affiliation: 'X', email: 'a@b.org', unknown: 1 };
  assert.deepEqual(stripPrivateRecord(members, rec), { id: 'a-b', lastname: 'B', firstname: 'A', affiliation: 'X', unknown: 1 });
  assert.deepEqual(stripPrivateRecords(members, [rec]), [stripPrivateRecord(members, rec)]);
  assert.deepEqual(pickPrivateRecord(members, rec), { email: 'a@b.org' });
});
