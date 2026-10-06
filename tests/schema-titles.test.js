import test from 'node:test';
import assert from 'node:assert/strict';
import { getEditableTypes } from '../scripts/lib/editable-types.mjs';

// Every field's "title" is its form label (editor and public edit form).
for (const { name, schema } of getEditableTypes('schema')) {
  test(`every ${name} property has a short title for its form label`, () => {
    const item = schema.type === 'array' ? schema.items : schema;
    for (const [key, prop] of Object.entries(item.properties)) {
      assert.equal(typeof prop.title, 'string', `${name}.${key} needs a title`);
      assert.ok(prop.title.length > 0 && prop.title.length <= 40, `${name}.${key} title should be short`);
    }
  });
}
