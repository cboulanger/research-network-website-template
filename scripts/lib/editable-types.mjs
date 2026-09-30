// Discovers which schema/*.schema.json files describe an editable
// collection (type: array with items) and how each collection's records
// are addressed: by a stored `id` property if the item schema has one,
// otherwise by array index (events/news have no id field).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function getEditableTypes(schemaDir) {
  return readdirSync(schemaDir)
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => ({
      name: f.replace(/\.schema\.json$/, ''),
      schema: JSON.parse(readFileSync(path.join(schemaDir, f), 'utf8')),
    }))
    .filter(({ schema }) => (schema.type === 'array' && schema.items) || (schema.type === 'object' && schema.properties))
    .map(({ name, schema }) => ({
      name,
      schema,
      // 'object' types (site, publications) are singletons edited as one record.
      kind: schema.type === 'object' ? 'object' : 'array',
      keyField: schema.items?.properties?.id ? 'id' : null,
    }));
}
