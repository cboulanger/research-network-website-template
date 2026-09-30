// Locates/replaces/deletes one record in an array, addressed either by a
// named field (keyField, e.g. 'id') or, when keyField is null, by its
// position in the array.
export function findRecordIndex(records, keyField, key) {
  if (keyField) return records.findIndex((r) => r[keyField] === key);
  const index = /^\d+$/.test(key) ? Number(key) : NaN;
  return Number.isInteger(index) && index >= 0 && index < records.length ? index : -1;
}

export function replaceRecord(records, keyField, key, updated) {
  const index = findRecordIndex(records, keyField, key);
  if (index === -1) return null;
  const next = [...records];
  next[index] = updated;
  return next;
}

export function deleteRecord(records, keyField, key) {
  const index = findRecordIndex(records, keyField, key);
  if (index === -1) return null;
  return records.filter((_, i) => i !== index);
}
