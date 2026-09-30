import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecordIndex, replaceRecord, deleteRecord } from '../scripts/lib/record-store.mjs';

const idRecords = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const indexRecords = [{ date: '2026-01-01', title: 'One' }, { date: '2026-02-01', title: 'Two' }];

test('findRecordIndex finds by id field when keyField is given', () => {
  assert.equal(findRecordIndex(idRecords, 'id', 'b'), 1);
  assert.equal(findRecordIndex(idRecords, 'id', 'missing'), -1);
});

test('findRecordIndex finds by array index when keyField is null', () => {
  assert.equal(findRecordIndex(indexRecords, null, '1'), 1);
  assert.equal(findRecordIndex(indexRecords, null, '5'), -1);
  assert.equal(findRecordIndex(indexRecords, null, 'not-a-number'), -1);
  // Regression tests: reject empty/whitespace/hex/exponential strings that Number() coerces to integers
  assert.equal(findRecordIndex(indexRecords, null, ''), -1);
  assert.equal(findRecordIndex(indexRecords, null, ' '), -1);
  assert.equal(findRecordIndex(indexRecords, null, '  1  '), -1);
  assert.equal(findRecordIndex(indexRecords, null, '0x1'), -1);
  assert.equal(findRecordIndex(indexRecords, null, '1e1'), -1);
  assert.equal(findRecordIndex(indexRecords, null, '-1'), -1);
});

test('replaceRecord returns a new array with the record at the given key replaced', () => {
  const updated = replaceRecord(idRecords, 'id', 'b', { id: 'b', extra: true });
  assert.deepEqual(updated, [{ id: 'a' }, { id: 'b', extra: true }, { id: 'c' }]);
  assert.deepEqual(idRecords, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'input array must not be mutated');
});

test('replaceRecord returns null when the key is not found', () => {
  assert.equal(replaceRecord(idRecords, 'id', 'missing', {}), null);
});

test('deleteRecord returns a new array without the record at the given key', () => {
  const updated = deleteRecord(idRecords, 'id', 'b');
  assert.deepEqual(updated, [{ id: 'a' }, { id: 'c' }]);
  assert.deepEqual(idRecords, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'input array must not be mutated');
});

test('deleteRecord works by index when keyField is null', () => {
  const updated = deleteRecord(indexRecords, null, '0');
  assert.deepEqual(updated, [{ date: '2026-02-01', title: 'Two' }]);
});

test('deleteRecord returns null when the key is not found', () => {
  assert.equal(deleteRecord(idRecords, 'id', 'missing'), null);
});
