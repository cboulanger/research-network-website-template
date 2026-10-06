// Helpers for the schema flag "x-editor": { "private": true }, which marks a
// field that must never leave the admin editor (not in the published data,
// the public edit form, or ntfy messages).
const hints = (propSchema) => propSchema?.['x-editor'] || {};

export const isPrivate = (propSchema) => hints(propSchema).private === true;
export const isReadOnly = (propSchema) => hints(propSchema).readOnly === true;

// Collection schemas are arrays of items; singletons are plain objects.
const itemSchemaOf = (schema) => (schema.type === 'array' ? schema.items : schema);
const mapItemSchema = (schema, fn) => (schema.type === 'array' ? { ...schema, items: fn(schema.items) } : fn(schema));

function withoutProperties(itemSchema, drop) {
  const properties = Object.fromEntries(Object.entries(itemSchema.properties || {}).filter(([, p]) => !drop(p)));
  const out = { ...itemSchema, properties };
  if (itemSchema.required) out.required = itemSchema.required.filter((key) => key in properties);
  return out;
}

export function stripPrivateSchema(schema) {
  return mapItemSchema(schema, (item) => withoutProperties(item, isPrivate));
}

// The schema public submissions are validated against: no private fields, and
// readOnly fields (the generated `id`) are not required.
export function toSubmissionSchema(schema) {
  return mapItemSchema(schema, (item) => {
    const stripped = withoutProperties(item, isPrivate);
    if (stripped.required) stripped.required = stripped.required.filter((key) => !isReadOnly(stripped.properties[key]));
    return stripped;
  });
}

const filterRecord = (schema, record, keep) => {
  const properties = itemSchemaOf(schema).properties || {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => keep(properties[key])));
};

export const stripPrivateRecord = (schema, record) => filterRecord(schema, record, (p) => !isPrivate(p));
export const stripPrivateRecords = (schema, records) => records.map((r) => stripPrivateRecord(schema, r));
export const pickPrivateRecord = (schema, record) => filterRecord(schema, record, isPrivate);
