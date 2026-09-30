import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getEditableTypes } from '../scripts/lib/editable-types.mjs';

async function writeSchema(dir, name, schema) {
  await writeFile(path.join(dir, `${name}.schema.json`), JSON.stringify(schema));
}

test('getEditableTypes picks up array-of-items and object schemas, tagging each with its kind', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'schemas-'));
  await writeSchema(dir, 'members', {
    type: 'array',
    items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  });
  await writeSchema(dir, 'site', { type: 'object', properties: { title: { type: 'string' } } });
  const types = getEditableTypes(dir);
  assert.deepEqual(types.map((t) => [t.name, t.kind]).sort(), [['members', 'array'], ['site', 'object']]);
  await rm(dir, { recursive: true, force: true });
});

test('getEditableTypes sets keyField to "id" when the item schema has an id property', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'schemas-'));
  await writeSchema(dir, 'projects', {
    type: 'array',
    items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
  });
  const types = getEditableTypes(dir);
  assert.equal(types[0].keyField, 'id');
  await rm(dir, { recursive: true, force: true });
});

test('getEditableTypes sets keyField to null when the item schema has no id property', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'schemas-'));
  await writeSchema(dir, 'events', {
    type: 'array',
    items: { type: 'object', properties: { date: { type: 'string' }, title: { type: 'string' } } },
  });
  const types = getEditableTypes(dir);
  assert.equal(types[0].keyField, null);
  await rm(dir, { recursive: true, force: true });
});

test('getEditableTypes reflects the real schema/ directory shape', () => {
  const names = getEditableTypes('schema').map((t) => t.name).sort();
  assert.deepEqual(names, ['events', 'members', 'news', 'projects', 'publications', 'site']);
});
