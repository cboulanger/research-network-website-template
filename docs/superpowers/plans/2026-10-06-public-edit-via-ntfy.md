# Public edit/add via ntfy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let site visitors propose edits/additions (opened with `?edit`) that are posted to an ntfy topic, and let the local admin editor pull, review and save them — all optional, enabled only when `NTFY_TOPIC` is set.

**Architecture:** A schema flag `x-editor.private` marks fields (email) that never leave the editor. The form-building code moves out of `scripts/editor/app.js` into a shared browser module (`assets/js/record-form.js`) used by both the editor and a new public `edit.html`. The public page POSTs a versioned JSON "envelope" to `{NTFY_SERVER}/{NTFY_TOPIC}`; the edit server polls the topic, validates envelopes against the public (stripped) schema, keeps them as pending in `.local/inbox.json`, and the editor UI shows them as a reviewable inbox that feeds the existing save endpoints.

**Tech Stack:** Node ≥ 22 ESM, `node:test`, Ajv 8 (already a devDependency), vanilla browser ES modules, jsdom (new **devDependency**, tests only), ntfy HTTP API.

## Global Constraints

- Feature is off unless `NTFY_TOPIC` is set in `.env`/the environment; when off, the build emits **no** edit files and pages reference none; the editor shows no inbox.
- `NTFY_SERVER` is optional, default `https://ntfy.sh` (constant `DEFAULT_NTFY_SERVER`). `NTFY_TOPIC` must match `^[A-Za-z0-9_-]{1,64}$`.
- Message size limit is the constant `NTFY_MAX_BYTES = 4096`, checked before sending.
- Editable collections: exactly `members`, `projects`, `events`, `news` (`EDITABLE_TYPES`). `publications` and `site` are never publicly editable.
- Private fields (`"x-editor": { "private": true }`) never appear in the public data bundle, public schemas, public form, or ntfy messages. `members.email` is private.
- Public edit mode is activated by `?edit` in the URL, remembered in `sessionStorage` under the key `edit`; `?edit=0` turns it off.
- Envelope format (version 1): `{"v":1,"type":"members","op":"add|update","id":"<key>","data":{...},"base":{...},"ts":"<ISO>"}`. `id` only for `update`; `base` only for `update` of collections without an `id` field (events, news).
- Inbox state lives in `.local/inbox.json` (already gitignored via `/.local/`).
- Nothing is ever written to content automatically; every submission is reviewed in the editor.
- No new runtime dependencies. Tests use `node --test`; browser-module tests use jsdom.
- Commits end with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push; do not touch remotes.

## File Structure

| File | Responsibility |
|---|---|
| `assets/js/private-fields.js` (new) | Schema/record helpers for `x-editor.private` and submission schemas. Browser + Node. |
| `assets/js/ntfy.js` (new) | Envelope build/check, size check, URL, POST to ntfy. Browser + Node. |
| `assets/js/record-form.js` (new) | Form field construction and value collection, extracted from the editor. Browser only (uses `document` at call time). |
| `assets/js/edit-page.js` (new) | Public `edit.html` logic: load schema/data, render form, post envelope. |
| `assets/js/edit-mode.js` (new) | `?edit` detection, Edit/Add buttons on list pages. |
| `scripts/lib/public-edit.mjs` (new) | Reads `NTFY_*` config; writes public data/schema/config/js into `public/`. |
| `scripts/lib/inbox.mjs` (new) | Polls ntfy, validates, persists pending submissions, locates records, diffs. |
| `scripts/editor/inbox-view.js` (new) | Renders the inbox entries (pure DOM). |
| `scripts/build.mjs`, `scripts/edit-server.mjs`, `scripts/editor/app.js`, `scripts/editor/index.html`, `scripts/editor/style.css` | Integration points. |

Branch: `feat/public-edit-ntfy` (created in Task 0).

---

### Task 0: Branch and jsdom

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Create the branch and install jsdom**

```bash
git checkout -b feat/public-edit-ntfy
npm install --save-dev jsdom
npm test
```
Expected: branch created; all existing tests pass.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jsdom devDependency for browser-module tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: `x-editor.private` helpers and schema flag

**Files:**
- Create: `assets/js/private-fields.js`
- Modify: `schema/members.schema.json` (the `email` property), `assets/js/members.js` (`renderMemberCard`, avatar colour)
- Test: `tests/private-fields.test.js`, `tests/members.test.js` (add one test)

**Interfaces:**
- Produces (all exported from `assets/js/private-fields.js`):
  - `isPrivate(propSchema): boolean`, `isReadOnly(propSchema): boolean`
  - `stripPrivateSchema(schema): schema` — works on an array schema (strips `items`) or an object schema; removes private properties and their `required` entries; does not mutate.
  - `toSubmissionSchema(schema): schema` — `stripPrivateSchema` plus removes `readOnly` properties from `required` (properties stay, so `id` is still allowed in `data`).
  - `stripPrivateRecord(schema, record): object`, `stripPrivateRecords(schema, records): object[]`
  - `pickPrivateRecord(schema, record): object` — only the private fields of `record`.

- [ ] **Step 1: Write the failing tests**

`tests/private-fields.test.js`:
```js
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
```
Add to `tests/members.test.js` (follow that file's existing import style):
```js
test('avatar colour does not depend on the email address', () => {
  const a = { firstname: 'Ada', lastname: 'Adler', affiliation: 'X', id: 'adler-ada', email: 'one@example.org' };
  const b = { ...a, email: 'two@example.org' };
  assert.equal(renderMemberCard(a), renderMemberCard(b));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/private-fields.test.js tests/members.test.js`
Expected: FAIL (module `private-fields.js` not found; avatar test fails because colour is derived from email).

- [ ] **Step 3: Implement**

`assets/js/private-fields.js`:
```js
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
```
`schema/members.schema.json`, `email` line becomes:
```json
      "email": { "type": "string", "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "x-editor": { "private": true } },
```
`assets/js/members.js`, in `renderMemberCard`: change `hashColor(member.email)` to `hashColor(member.id)`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. If an existing test asserted a specific avatar colour derived from the email, update that test to derive it from the id instead.

- [ ] **Step 5: Commit**

```bash
git add assets/js/private-fields.js assets/js/members.js schema/members.schema.json tests/private-fields.test.js tests/members.test.js
git commit -m "feat: x-editor.private schema flag; email is private" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ntfy envelope and client module

**Files:**
- Create: `assets/js/ntfy.js`
- Test: `tests/ntfy.test.js`

**Interfaces:**
- Produces (exported from `assets/js/ntfy.js`):
  - `EDITABLE_TYPES: string[]`, `NTFY_MAX_BYTES = 4096`, `DEFAULT_NTFY_SERVER = 'https://ntfy.sh'`
  - `buildEnvelope({ type, op, id?, data, base?, now? }): envelope`
  - `envelopeBytes(envelope): number`
  - `checkEnvelope(value): { ok: true, envelope } | { ok: false, reason: string }`
  - `ntfyUrl({ server?, topic }): string` — `https://ntfy.sh/mytopic`, no trailing slash handling issues
  - `postEnvelope({ server, topic, envelope, fetchFn? }): Promise<void>` — throws `Error` with a user-readable message when too large or HTTP not ok. Sends **no custom headers** (keeps the request CORS-simple).

- [ ] **Step 1: Write the failing tests**

`tests/ntfy.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITABLE_TYPES, NTFY_MAX_BYTES, buildEnvelope, envelopeBytes, checkEnvelope, ntfyUrl, postEnvelope,
} from '../assets/js/ntfy.js';

const now = new Date('2026-10-06T12:00:00Z');

test('buildEnvelope sets version and timestamp and omits unset id/base', () => {
  const env = buildEnvelope({ type: 'members', op: 'add', data: { firstname: 'A' }, now });
  assert.deepEqual(env, { v: 1, type: 'members', op: 'add', data: { firstname: 'A' }, ts: '2026-10-06T12:00:00.000Z' });
  const upd = buildEnvelope({ type: 'events', op: 'update', id: 3, data: {}, base: { title: 'x' }, now });
  assert.equal(upd.id, '3');
  assert.deepEqual(upd.base, { title: 'x' });
});

test('checkEnvelope accepts valid envelopes and rejects malformed ones', () => {
  assert.equal(EDITABLE_TYPES.join(), 'members,projects,events,news');
  const ok = buildEnvelope({ type: 'news', op: 'add', data: { title: 't' }, now });
  assert.equal(checkEnvelope(ok).ok, true);
  const bad = [
    null, [], { ...ok, v: 2 }, { ...ok, type: 'site' }, { ...ok, op: 'delete' },
    { ...ok, data: [] }, { ...ok, ts: 5 },
    { ...ok, op: 'update' },                                  // update needs an id
    { ...ok, op: 'update', id: 'x', base: 'nope' },           // base must be an object
  ];
  for (const value of bad) assert.equal(checkEnvelope(value).ok, false, JSON.stringify(value));
});

test('ntfyUrl joins server and topic without double slashes', () => {
  assert.equal(ntfyUrl({ topic: 'abc' }), 'https://ntfy.sh/abc');
  assert.equal(ntfyUrl({ server: 'https://ntfy.example.org/', topic: 'a_b' }), 'https://ntfy.example.org/a_b');
});

test('postEnvelope POSTs the JSON body with no custom headers', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const envelope = buildEnvelope({ type: 'news', op: 'add', data: { title: 't' }, now });
  await postEnvelope({ server: 'https://ntfy.sh', topic: 'abc', envelope, fetchFn });
  assert.equal(calls[0].url, 'https://ntfy.sh/abc');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, JSON.stringify(envelope));
  assert.equal(calls[0].init.headers, undefined);
});

test('postEnvelope rejects oversized payloads before any request and reports HTTP errors', async () => {
  let called = false;
  const fetchFn = async () => { called = true; return { ok: false, status: 429 }; };
  const big = buildEnvelope({ type: 'news', op: 'add', data: { title: 'x'.repeat(NTFY_MAX_BYTES) }, now });
  assert.ok(envelopeBytes(big) > NTFY_MAX_BYTES);
  await assert.rejects(postEnvelope({ topic: 'abc', envelope: big, fetchFn }), /too large/i);
  assert.equal(called, false);
  const small = buildEnvelope({ type: 'news', op: 'add', data: { title: 't' }, now });
  await assert.rejects(postEnvelope({ topic: 'abc', envelope: small, fetchFn }), /HTTP 429/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/ntfy.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`assets/js/ntfy.js`:
```js
// Message format and transport for public submissions sent through ntfy.
export const EDITABLE_TYPES = ['members', 'projects', 'events', 'news'];
export const NTFY_MAX_BYTES = 4096; // ntfy.sh's per-message limit
export const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function buildEnvelope({ type, op, id, data, base, now = new Date() }) {
  const envelope = { v: 1, type, op, data, ts: now.toISOString() };
  if (id !== undefined && id !== null) envelope.id = String(id);
  if (base !== undefined) envelope.base = base;
  return envelope;
}

export function envelopeBytes(envelope) {
  return new TextEncoder().encode(JSON.stringify(envelope)).length;
}

// Structural check only; content is validated against the collection schema by the editor.
export function checkEnvelope(value) {
  if (!isPlainObject(value)) return { ok: false, reason: 'not an object' };
  if (value.v !== 1) return { ok: false, reason: 'unsupported version' };
  if (!EDITABLE_TYPES.includes(value.type)) return { ok: false, reason: 'unknown type' };
  if (value.op !== 'add' && value.op !== 'update') return { ok: false, reason: 'unknown op' };
  if (!isPlainObject(value.data)) return { ok: false, reason: 'data must be an object' };
  if (typeof value.ts !== 'string') return { ok: false, reason: 'missing timestamp' };
  if (value.op === 'update' && (typeof value.id !== 'string' || !value.id)) return { ok: false, reason: 'update needs an id' };
  if (value.base !== undefined && !isPlainObject(value.base)) return { ok: false, reason: 'base must be an object' };
  return { ok: true, envelope: value };
}

export function ntfyUrl({ server = DEFAULT_NTFY_SERVER, topic }) {
  return `${server.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`;
}

export async function postEnvelope({ server, topic, envelope, fetchFn = globalThis.fetch }) {
  const bytes = envelopeBytes(envelope);
  if (bytes > NTFY_MAX_BYTES) {
    throw new Error(`Your submission is too large (${bytes} bytes; the limit is ${NTFY_MAX_BYTES}). Please shorten it.`);
  }
  // No custom headers: a plain text/plain POST avoids a CORS preflight.
  const res = await fetchFn(ntfyUrl({ server, topic }), { method: 'POST', body: JSON.stringify(envelope) });
  if (!res.ok) throw new Error(`Could not send your submission (HTTP ${res.status}). Please try again later.`);
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/ntfy.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ntfy.js tests/ntfy.test.js
git commit -m "feat: ntfy envelope format and client" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Extract the shared form module

**Files:**
- Create: `assets/js/record-form.js`
- Modify: `scripts/editor/app.js`, `scripts/edit-server.mjs` (static route)
- Test: `tests/record-form.test.js`, `tests/edit-server.test.js` (add one test)

**Interfaces:**
- Produces (exported from `assets/js/record-form.js`):
  - `editorHints(schema): object`, `todayISO(): string`, `memberName(member): string`
  - `buildStringListField(key, values): HTMLElement`, `buildField(key, propSchema, value, required): HTMLElement`
  - `buildParticipantPicker(participantIds, members): HTMLElement` — has `.getParticipantIds()`
  - `renderRecordFields(form, { itemSchema, record, typeName, members = [], skipReadOnly = false }): void` — **appends** fields to `form` (caller clears the form and adds buttons)
  - `collectRecordData(form, { itemSchema, typeName, singleton = false, skipReadOnly = false }): object`
- The module must not touch `document` at import time (it is imported by Node tests before jsdom globals exist).
- The edit server serves it at `/assets/js/record-form.js`.

- [ ] **Step 1: Write the failing tests**

`tests/record-form.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderRecordFields, collectRecordData } from '../assets/js/record-form.js';

const itemSchema = {
  type: 'object',
  required: ['id', 'title', 'participants'],
  properties: {
    id: { type: 'string', 'x-editor': { readOnly: true } },
    title: { type: 'string' },
    kind: { enum: ['a', 'b'] },
    participants: { type: 'array', items: { type: 'string' } },
  },
};
const members = [{ id: 'm1', firstname: 'Ada', lastname: 'Adler' }];
const record = { id: 'p1', title: 'T', participants: ['m1'] };

function makeForm() {
  const dom = new JSDOM('<body></body>');
  globalThis.document = dom.window.document;
  return document.createElement('form');
}

test('renderRecordFields renders a control per property and fills values', () => {
  const form = makeForm();
  renderRecordFields(form, { itemSchema, record, typeName: 'projects', members });
  assert.equal(form.querySelector('#field-title').value, 'T');
  assert.equal(form.querySelector('#field-title').required, true);
  assert.equal(form.querySelector('#field-id').readOnly, true);
  assert.equal(form.querySelector('[data-field="participants"] li span').textContent, 'Adler, Ada');
});

test('collectRecordData returns what the form shows', () => {
  const form = makeForm();
  renderRecordFields(form, { itemSchema, record, typeName: 'projects', members });
  form.querySelector('#field-title').value = 'New title';
  assert.deepEqual(collectRecordData(form, { itemSchema, typeName: 'projects' }), {
    id: 'p1', title: 'New title', kind: 'a', participants: ['m1'],
  });
});

test('skipReadOnly leaves readOnly fields out of both render and collect', () => {
  const form = makeForm();
  renderRecordFields(form, { itemSchema, record, typeName: 'projects', members, skipReadOnly: true });
  assert.equal(form.querySelector('#field-id'), null);
  assert.equal('id' in collectRecordData(form, { itemSchema, typeName: 'projects', skipReadOnly: true }), false);
});
```
Add to `tests/edit-server.test.js` (reuse `startTestServer`):
```js
test('the shared form module is served to the editor', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/assets/js/record-form.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /export function renderRecordFields/);
    assert.equal((await fetch(`${ctx.base}/assets/js/../../package.json`)).status, 404);
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/record-form.test.js tests/edit-server.test.js`
Expected: FAIL (module missing; route 404).

- [ ] **Step 3: Create `assets/js/record-form.js`**

Move these from `scripts/editor/app.js` into the new file, as `export function`s:
- `editorHints` (app.js lines 143–145), `todayISO` (147–151), `memberName` (153–155), `buildStringListField` (239–265) and `buildField` (341–393) — **verbatim**.
- `buildParticipantPicker` (267–339) with the signature changed to `(participantIds, members)`; replace the two uses of `state.members` (in `renderList` and `renderResults`) with `members`.

Then add:
```js
export function renderRecordFields(form, { itemSchema, record, typeName, members = [], skipReadOnly = false }) {
  const required = new Set(itemSchema.required || []);
  Object.entries(itemSchema.properties).forEach(([key, propSchema]) => {
    if (skipReadOnly && editorHints(propSchema).readOnly) return;
    if (typeName === 'projects' && key === 'participants') {
      form.appendChild(buildParticipantPicker(record.participants || [], members));
      return;
    }
    form.appendChild(buildField(key, propSchema, record[key], required.has(key)));
  });
}

export function collectRecordData(form, { itemSchema, typeName, singleton = false, skipReadOnly = false }) {
  const properties = itemSchema.properties;
  const data = {};
  Object.keys(properties).forEach((key) => {
    const propSchema = properties[key];
    if (skipReadOnly && editorHints(propSchema).readOnly) return;
    if (typeName === 'projects' && key === 'participants') {
      data.participants = form.querySelector('[data-field="participants"]').getParticipantIds();
      return;
    }
    if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
      const container = form.querySelector(`[data-field="${key}"]`);
      const items = [...container.querySelectorAll('input')].map((i) => i.value).filter((v) => v.trim() !== '');
      // Optional lists in a singleton are omitted when empty (they often have minItems: 1).
      if (items.length || !singleton) data[key] = items;
      return;
    }
    const input = form.querySelector(`#field-${key}`);
    if (input.value !== '') data[key] = input.value;
  });
  return data;
}
```

- [ ] **Step 4: Refactor `scripts/editor/app.js`**

- Add at the top: `import { editorHints, renderRecordFields, collectRecordData } from '/assets/js/record-form.js';`
- Delete the moved functions from app.js (`editorHints`, `todayISO`, `memberName`, `buildStringListField`, `buildParticipantPicker`, `buildField`).
- `renderForm(record)` body becomes:
```js
function renderForm(record) {
  const form = document.getElementById('record-form');
  form.innerHTML = '';
  renderRecordFields(form, { itemSchema: recordSchema(), record, typeName: state.currentType.name, members: state.members });

  const actions = document.createElement('div');
  actions.className = 'field';
  actions.innerHTML = isSingleton()
    ? '<button type="submit">Save</button>'
    : '<button type="submit">Save</button> <button type="button" id="cancel-button">Cancel</button>';
  form.appendChild(actions);
  form.querySelector('#cancel-button')?.addEventListener('click', hideForm);
}
```
- `collectFormData()` becomes:
```js
function collectFormData() {
  return collectRecordData(document.getElementById('record-form'), {
    itemSchema: recordSchema(),
    typeName: state.currentType.name,
    singleton: isSingleton(),
  });
}
```

- [ ] **Step 5: Serve the module from the edit server**

In `scripts/edit-server.mjs`, add above `createServer`:
```js
// Browser modules shared between the public site and the editor.
const SHARED_JS = /^\/assets\/js\/(record-form)\.js$/;
```
and in `serveStatic` before the `STATIC_FILES` lookup:
```js
    const shared = SHARED_JS.exec(pathname);
    if (shared) {
      const body = readFileSync(path.join(editorDir, '..', '..', 'assets', 'js', `${shared[1]}.js`));
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(body);
    }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/js/record-form.js scripts/editor/app.js scripts/edit-server.mjs tests/record-form.test.js tests/edit-server.test.js
git commit -m "refactor: extract editor form code into shared record-form module" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Build integration (config, public data, edit page shell, CI vars)

**Files:**
- Create: `scripts/lib/public-edit.mjs`
- Modify: `scripts/build.mjs`, `assets/js/members.js` (`data-record-id` on card and list item), `assets/js/projects-graph.js` (`data-record-id` on project `<li>`), `.env.example`, `.github/workflows/ci.yml`, `.gitlab-ci.yml`
- Test: `tests/public-edit.test.js`, `tests/build.test.js` (add tests)

**Interfaces:**
- Consumes: `stripPrivateRecords`, `toSubmissionSchema` (Task 1); `DEFAULT_NTFY_SERVER`, `EDITABLE_TYPES` (Task 2).
- Produces:
  - `getPublicEditConfig(env = process.env): { server, topic } | null` — `null` when `NTFY_TOPIC` is blank; throws `Error` for an invalid topic or non-http(s) server.
  - `writePublicEditAssets({ publicDir, schemaDir, content, config }): Promise<void>` — writes `assets/data/<type>.json`, `assets/schema/<type>.schema.json`, `assets/js/edit-config.js` (`export default {"server":...,"topic":...};`) and copies `record-form.js`, `ntfy.js`, `edit-page.js`, `edit-mode.js`, `events.js`, `news.js` from `assets/js/` into `public/assets/js/`.
  - Rows in public HTML carry `data-record-id="<id>"`: members card and list item, projects `<li>`.
  - `edit.html` is built when enabled, with elements `#edit-title`, `#edit-message`, `#edit-form` and `bodyScripts: ['assets/js/edit-page.js']`.
  - When enabled, members/projects/events/news pages also load `assets/js/edit-mode.js`.

- [ ] **Step 1: Write the failing tests**

`tests/public-edit.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicEditConfig } from '../scripts/lib/public-edit.mjs';

test('getPublicEditConfig is null when NTFY_TOPIC is unset or blank', () => {
  assert.equal(getPublicEditConfig({}), null);
  assert.equal(getPublicEditConfig({ NTFY_TOPIC: '  ' }), null);
});

test('getPublicEditConfig defaults the server and strips trailing slashes', () => {
  assert.deepEqual(getPublicEditConfig({ NTFY_TOPIC: 'abc_123' }), { server: 'https://ntfy.sh', topic: 'abc_123' });
  assert.deepEqual(getPublicEditConfig({ NTFY_TOPIC: 'abc', NTFY_SERVER: 'https://ntfy.example.org/' }), {
    server: 'https://ntfy.example.org', topic: 'abc',
  });
});

test('getPublicEditConfig rejects unsafe topics and servers', () => {
  assert.throws(() => getPublicEditConfig({ NTFY_TOPIC: 'a/b' }), /NTFY_TOPIC/);
  assert.throws(() => getPublicEditConfig({ NTFY_TOPIC: 'x'.repeat(65) }), /NTFY_TOPIC/);
  assert.throws(() => getPublicEditConfig({ NTFY_TOPIC: 'abc', NTFY_SERVER: 'javascript:alert(1)' }), /NTFY_SERVER/);
});
```
Add to `tests/build.test.js` (reuse `writeFixtureContent`, `runBuildAsync`; add `members` fixture email already `secret@example.org`):
```js
test('with NTFY_TOPIC the build emits the public edit files, without private fields', async () => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);
  await runBuildAsync(contentDir, publicDir, { NTFY_TOPIC: 'test-topic', NTFY_SERVER: 'https://ntfy.example.org' });

  for (const f of ['edit.html', 'assets/js/edit-page.js', 'assets/js/edit-mode.js', 'assets/js/record-form.js',
    'assets/js/ntfy.js', 'assets/js/edit-config.js', 'assets/data/members.json', 'assets/schema/members.schema.json']) {
    assert.ok(existsSync(path.join(publicDir, f)), `${f} should exist`);
  }
  const config = await readFile(path.join(publicDir, 'assets/js/edit-config.js'), 'utf8');
  assert.match(config, /test-topic/);
  assert.match(config, /ntfy\.example\.org/);
  for (const f of ['assets/data/members.json', 'assets/schema/members.schema.json', 'members.html', 'edit.html']) {
    assert.doesNotMatch(await readFile(path.join(publicDir, f), 'utf8'), /secret@example\.org|"email"/, f);
  }
  const members = JSON.parse(await readFile(path.join(publicDir, 'assets/data/members.json'), 'utf8'));
  assert.equal('email' in members[0], false);
  const schema = JSON.parse(await readFile(path.join(publicDir, 'assets/schema/members.schema.json'), 'utf8'));
  assert.equal(schema.items.required.includes('id'), false);
  for (const page of ['members', 'projects', 'events', 'news']) {
    assert.match(await readFile(path.join(publicDir, `${page}.html`), 'utf8'), /assets\/js\/edit-mode\.js/, page);
  }
  assert.match(await readFile(path.join(publicDir, 'members.html'), 'utf8'), /data-record-id="person-test"/);
  assert.match(await readFile(path.join(publicDir, 'projects.html'), 'utf8'), /data-record-id="p1"/);
});

test('without NTFY_TOPIC the build emits no edit files and pages do not reference them', async () => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);
  await runBuildAsync(contentDir, publicDir, { NTFY_TOPIC: '' });
  for (const f of ['edit.html', 'assets/js/edit-page.js', 'assets/js/edit-mode.js', 'assets/js/edit-config.js', 'assets/data', 'assets/schema']) {
    assert.equal(existsSync(path.join(publicDir, f)), false, `${f} should not exist`);
  }
  for (const page of ['members', 'projects', 'events', 'news']) {
    assert.doesNotMatch(await readFile(path.join(publicDir, `${page}.html`), 'utf8'), /edit-mode/, page);
  }
});
```
The build test needs `edit-page.js`/`edit-mode.js` to exist in `assets/js/` already, so create **placeholder-free stubs** now: each file contains only `export {};` (Tasks 5 and 6 replace them with the real code).

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/public-edit.test.js tests/build.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `scripts/lib/public-edit.mjs`**

```js
// Public edit/add through ntfy: reads the NTFY_* configuration and writes the
// files the static site needs for it (stripped data + schemas, config, JS).
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_NTFY_SERVER, EDITABLE_TYPES } from '../../assets/js/ntfy.js';
import { stripPrivateRecords, toSubmissionSchema } from '../../assets/js/private-fields.js';

const PUBLIC_JS = ['record-form.js', 'ntfy.js', 'edit-page.js', 'edit-mode.js', 'events.js', 'news.js'];

export function getPublicEditConfig(env = process.env) {
  const topic = (env.NTFY_TOPIC || '').trim();
  if (!topic) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    throw new Error('NTFY_TOPIC may only contain letters, digits, "-" and "_" (at most 64 characters)');
  }
  const server = (env.NTFY_SERVER || '').trim().replace(/\/+$/, '') || DEFAULT_NTFY_SERVER;
  if (!/^https?:\/\/[^\s"'<>]+$/.test(server)) throw new Error('NTFY_SERVER must be an http(s) URL');
  return { server, topic };
}

export async function writePublicEditAssets({ publicDir, schemaDir, content, config }) {
  const dataDir = path.join(publicDir, 'assets', 'data');
  const schemaOut = path.join(publicDir, 'assets', 'schema');
  const jsDir = path.join(publicDir, 'assets', 'js');
  await Promise.all([dataDir, schemaOut, jsDir].map((dir) => mkdir(dir, { recursive: true })));
  for (const type of EDITABLE_TYPES) {
    const schema = JSON.parse(readFileSync(path.join(schemaDir, `${type}.schema.json`), 'utf8'));
    await writeFile(path.join(dataDir, `${type}.json`), JSON.stringify(stripPrivateRecords(schema, content[type])));
    await writeFile(path.join(schemaOut, `${type}.schema.json`), JSON.stringify(toSubmissionSchema(schema)));
  }
  await writeFile(path.join(jsDir, 'edit-config.js'), `export default ${JSON.stringify(config)};\n`);
  for (const file of PUBLIC_JS) await cp(path.join('assets', 'js', file), path.join(jsDir, file));
}
```

- [ ] **Step 4: Wire into `scripts/build.mjs`**

- Import: `import { getPublicEditConfig, writePublicEditAssets } from './lib/public-edit.mjs';`
- Helper near the top: `const editScripts = (content) => (content.editConfig ? ['assets/js/edit-mode.js'] : []);`
- Add `bodyScripts` entries: members page `['assets/js/members.js', ...editScripts(content)]`; projects page `[...(projects.length ? ['assets/js/projects-graph.js'] : []), ...editScripts(content)]`; events and news pages gain `bodyScripts: editScripts(content)`.
- New function (inspect `navHTML` in `assets/js/shared.js` first; pass an `activePage` it tolerates, e.g. `'edit'`, or `''` if it would break):
```js
async function buildEditPage(content) {
  const { site } = content;
  const mainHTML = `
    <h1 id="edit-title">Edit</h1>
    <p>Your change is sent to the editors and published after review.</p>
    <div id="edit-message" role="status" hidden></div>
    <form id="edit-form"></form>`;
  await writeFile(
    path.join(PUBLIC_DIR, 'edit.html'),
    renderPage({
      title: `Edit — ${site.bannerLabel}`,
      activePage: 'edit',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      navExclude: content.navExclude,
      mainHTML,
      bodyScripts: ['assets/js/edit-page.js'],
    })
  );
}
```
- In `main()`: `const editConfig = getPublicEditConfig();` then `const content = { ...(await loadContent(contentDir)), contentDir, editConfig };`. After the other pages: `if (editConfig) await buildEditPage(content);`. After the JS copy loop: `if (editConfig) await writePublicEditAssets({ publicDir: PUBLIC_DIR, schemaDir: 'schema', content, config: editConfig });`

- [ ] **Step 5: Row identifiers**

- `assets/js/members.js`: in `renderMemberCard` the `<li class="member-card" id="${member.id}" ...` gains `data-record-id="${escapeHTML(member.id)}"`; `renderMemberListItem`'s `<li class="member-list-item" ...` gains the same attribute.
- `assets/js/projects-graph.js` `renderListView`: the `<li data-participants=...` gains `data-record-id="${escapeHTML(p.id)}"`.
- Update any existing test that compares those exact HTML strings.

- [ ] **Step 6: Config files**

- `.env.example`: append
```
# Optional: let site visitors propose edits/additions. Open any list page with
# ?edit to get Edit/Add buttons; submissions are posted to this ntfy topic and
# reviewed in the editor ("Inbox"). Leave NTFY_TOPIC blank to disable the
# feature entirely (nothing is built). The topic name ends up in the public
# site source — anyone who knows it can read and post to it — so use a long
# random name (letters, digits, "-", "_"; max 64 chars). All submissions are
# reviewed by hand before anything is saved. NTFY_SERVER defaults to
# https://ntfy.sh (messages are kept ~12h, max 4 KB); point it at a self-hosted
# server for longer retention.
NTFY_TOPIC=
NTFY_SERVER=
```
- `.github/workflows/ci.yml` deploy job build step `env:` gains `NTFY_TOPIC: ${{ vars.NTFY_TOPIC }}` and `NTFY_SERVER: ${{ vars.NTFY_SERVER }}`; read `.gitlab-ci.yml` and add the same two variables to its build job the same way that file passes `CONTENT_PATH`.

- [ ] **Step 7: Run the full suite and a manual build**

Run: `npm test` — Expected: PASS.
Run: `NTFY_TOPIC=demo-topic npm run build && ls public/assets/data public/assets/schema` — Expected: four JSON files in each; `grep -r "@" public/assets/data` shows no email addresses.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/public-edit.mjs scripts/build.mjs assets/js/members.js assets/js/projects-graph.js assets/js/edit-page.js assets/js/edit-mode.js .env.example .github/workflows/ci.yml .gitlab-ci.yml tests/
git commit -m "feat: optional public edit build (NTFY_TOPIC), stripped data and schemas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Public edit form page (`edit-page.js`)

**Files:**
- Modify (replace stub): `assets/js/edit-page.js`
- Modify: `assets/css/base.css` (message styles if not present)
- Test: `tests/edit-page.test.js`

**Interfaces:**
- Consumes: `renderRecordFields`, `collectRecordData` (Task 3); `EDITABLE_TYPES`, `buildEnvelope`, `postEnvelope` (Task 2); build output from Task 4 (`assets/schema/<type>.schema.json`, `assets/data/<type>.json`, elements `#edit-title`, `#edit-message`, `#edit-form`).
- Produces: `initEditPage({ doc, search, config, fetchFn?, postFn? }): Promise<void>`. URL contract: `edit.html?type=<type>&new` or `edit.html?type=<type>&id=<key>` where `<key>` is the record `id` (members, projects) or the array index (events, news).

- [ ] **Step 1: Write the failing tests**

`tests/edit-page.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initEditPage } from '../assets/js/edit-page.js';

const memberSchema = {
  type: 'array',
  items: { type: 'object', required: ['lastname'], properties: {
    id: { type: 'string', 'x-editor': { readOnly: true } }, lastname: { type: 'string' },
  } },
};
const eventSchema = { type: 'array', items: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } };
const files = {
  'assets/schema/members.schema.json': memberSchema,
  'assets/schema/events.schema.json': eventSchema,
  'assets/data/members.json': [{ id: 'adler-ada', lastname: 'Adler' }],
  'assets/data/events.json': [{ title: 'zero' }, { title: 'one' }],
};
const fetchFn = async (url) => (url in files
  ? { ok: true, json: async () => files[url] }
  : { ok: false, status: 404 });

function setup(search) {
  const dom = new JSDOM('<h1 id="edit-title"></h1><div id="edit-message" hidden></div><form id="edit-form"></form>');
  globalThis.document = dom.window.document;
  const sent = [];
  const postFn = async (args) => sent.push(args);
  const ready = initEditPage({ doc: dom.window.document, search, config: { server: 'https://ntfy.sh', topic: 't' }, fetchFn, postFn });
  return { dom, sent, ready };
}
const submit = async (dom) => {
  dom.window.document.getElementById('edit-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
};

test('adding a member posts an add envelope without an id', async () => {
  const { dom, sent, ready } = setup('?type=members&new');
  await ready;
  assert.equal(dom.window.document.getElementById('edit-title').textContent, 'Add member');
  assert.equal(dom.window.document.querySelector('#field-id'), null);
  dom.window.document.querySelector('#field-lastname').value = 'Okoro';
  await submit(dom);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].envelope.op, 'add');
  assert.equal(sent[0].envelope.id, undefined);
  assert.deepEqual(sent[0].envelope.data, { lastname: 'Okoro' });
  assert.equal(sent[0].topic, 't');
});

test('editing a member posts an update envelope carrying the id inside data', async () => {
  const { dom, sent, ready } = setup('?type=members&id=adler-ada');
  await ready;
  assert.equal(dom.window.document.querySelector('#field-lastname').value, 'Adler');
  dom.window.document.querySelector('#field-lastname').value = 'Adler-Smith';
  await submit(dom);
  assert.equal(sent[0].envelope.op, 'update');
  assert.equal(sent[0].envelope.id, 'adler-ada');
  assert.deepEqual(sent[0].envelope.data, { id: 'adler-ada', lastname: 'Adler-Smith' });
  assert.equal(sent[0].envelope.base, undefined);
  assert.match(dom.window.document.getElementById('edit-message').textContent, /Thank you/);
});

test('editing an event (no id field) addresses it by index and sends the original as base', async () => {
  const { dom, sent, ready } = setup('?type=events&id=1');
  await ready;
  dom.window.document.querySelector('#field-title').value = 'changed';
  await submit(dom);
  assert.equal(sent[0].envelope.id, '1');
  assert.deepEqual(sent[0].envelope.base, { title: 'one' });
  assert.deepEqual(sent[0].envelope.data, { title: 'changed' });
});

test('unknown types and missing records show an error instead of a form', async () => {
  let ctx = setup('?type=site&new');
  await ctx.ready;
  assert.equal(ctx.dom.window.document.getElementById('edit-message').hidden, false);
  assert.equal(ctx.dom.window.document.getElementById('edit-form').children.length, 0);
  ctx = setup('?type=members&id=nobody');
  await ctx.ready;
  assert.match(ctx.dom.window.document.getElementById('edit-message').textContent, /no longer exists/);
});

test('a failing post shows the error and re-enables the button', async () => {
  const dom = new JSDOM('<h1 id="edit-title"></h1><div id="edit-message" hidden></div><form id="edit-form"></form>');
  globalThis.document = dom.window.document;
  await initEditPage({
    doc: dom.window.document, search: '?type=members&new', config: { server: 'x', topic: 't' }, fetchFn,
    postFn: async () => { throw new Error('boom'); },
  });
  await submit(dom);
  assert.match(dom.window.document.getElementById('edit-message').textContent, /boom/);
  assert.equal(dom.window.document.querySelector('button[type=submit]').disabled, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/edit-page.test.js`
Expected: FAIL (`initEditPage` not exported by the stub).

- [ ] **Step 3: Implement `assets/js/edit-page.js`**

```js
import { renderRecordFields, collectRecordData } from './record-form.js';
import { EDITABLE_TYPES, buildEnvelope, postEnvelope } from './ntfy.js';

const LABELS = { members: 'member', projects: 'project', events: 'event', news: 'news item' };
// Collections whose records have a stored `id`; the others (events, news) are addressed by array index.
const KEY_FIELD = { members: 'id', projects: 'id' };

export async function initEditPage({ doc, search, config, fetchFn = (...args) => fetch(...args), postFn = postEnvelope }) {
  const params = new URLSearchParams(search);
  const type = params.get('type');
  const message = doc.getElementById('edit-message');
  const form = doc.getElementById('edit-form');
  const show = (text, isError) => {
    message.textContent = text;
    message.className = isError ? 'form-error' : 'form-message';
    message.hidden = false;
  };
  if (!EDITABLE_TYPES.includes(type)) return show('Unknown content type.', true);

  const isNew = !params.has('id');
  const keyField = KEY_FIELD[type];
  const getJSON = async (url) => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
    return res.json();
  };

  let schema;
  let record = {};
  let members = [];
  try {
    schema = await getJSON(`assets/schema/${type}.schema.json`);
    if (!isNew) {
      const records = await getJSON(`assets/data/${type}.json`);
      const id = params.get('id');
      const found = keyField ? records.find((r) => r[keyField] === id) : records[Number(id)];
      if (!found) return show('This entry no longer exists. Please go back and reload the page.', true);
      record = found;
    }
    if (type === 'projects') members = await getJSON('assets/data/members.json');
  } catch (err) {
    return show(err.message, true);
  }

  doc.getElementById('edit-title').textContent = `${isNew ? 'Add' : 'Edit'} ${LABELS[type]}`;
  const itemSchema = schema.items;
  renderRecordFields(form, { itemSchema, record, typeName: type, members, skipReadOnly: true });
  const submit = doc.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Send for review';
  form.append(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collectRecordData(form, { itemSchema, typeName: type, skipReadOnly: true });
    const id = isNew ? undefined : params.get('id');
    if (!isNew && keyField) data[keyField] = id;
    const envelope = buildEnvelope({
      type,
      op: isNew ? 'add' : 'update',
      id,
      data,
      base: !isNew && !keyField ? record : undefined,
    });
    submit.disabled = true;
    try {
      await postFn({ server: config.server, topic: config.topic, envelope });
      form.hidden = true;
      show('Thank you! Your submission was sent and will be published after review.', false);
    } catch (err) {
      submit.disabled = false;
      show(err.message, true);
    }
  });
}

if (typeof document !== 'undefined' && document.getElementById('edit-form')) {
  import('./edit-config.js').then(({ default: config }) => initEditPage({ doc: document, search: location.search, config }));
}
```
Check `assets/css/base.css`: reuse existing `.form-error`/`.form-message` rules if present; otherwise add minimal rules using the theme's existing `--color-*` variables (no new variables).

- [ ] **Step 4: Run tests**

Run: `node --test tests/edit-page.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/edit-page.js assets/css/base.css tests/edit-page.test.js
git commit -m "feat: public edit page posts submissions to ntfy" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `?edit` mode on list pages (`edit-mode.js`)

**Files:**
- Modify (replace stub): `assets/js/edit-mode.js`
- Modify: `assets/css/base.css`
- Test: `tests/edit-mode.test.js`

**Interfaces:**
- Consumes: `sortEventsByDateDesc` (`assets/js/events.js`), `sortNewsByDateDesc` (`assets/js/news.js`); row markers from Task 4 (`data-record-id` on members/projects rows); URL contract from Task 5.
- Produces: `isEditRequested(search, storage): boolean`, `editHref(type, id?): string`, `decorateEditMode(doc, loadRecords): Promise<void>` where `loadRecords(type)` resolves the public records array.

- [ ] **Step 1: Write the failing tests**

`tests/edit-mode.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { isEditRequested, editHref, decorateEditMode } from '../assets/js/edit-mode.js';

const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};

test('?edit enables edit mode and is remembered for the session; ?edit=0 turns it off', () => {
  const storage = memoryStorage();
  assert.equal(isEditRequested('', storage), false);
  assert.equal(isEditRequested('?edit', storage), true);
  assert.equal(isEditRequested('', storage), true);
  assert.equal(isEditRequested('?edit=0', storage), false);
  assert.equal(isEditRequested('', storage), false);
});

test('isEditRequested works without usable storage', () => {
  assert.equal(isEditRequested('?edit', null), true);
  assert.equal(isEditRequested('', null), false);
});

test('editHref builds add and edit links', () => {
  assert.equal(editHref('members'), 'edit.html?type=members&new');
  assert.equal(editHref('members', 'adler-ada'), 'edit.html?type=members&id=adler-ada');
});

test('members page rows get Edit buttons and the list gets an Add button', async () => {
  const dom = new JSDOM(`<main><h1>Members</h1><div class="list-controls"></div>
    <div id="members-grid"><ul><li class="member-card" data-record-id="adler-ada"></li></ul></div>
    <div id="members-list"><ul><li class="member-list-item" data-record-id="adler-ada"></li></ul></div></main>`);
  await decorateEditMode(dom.window.document, async () => { throw new Error('not needed'); });
  const hrefs = [...dom.window.document.querySelectorAll('a.edit-button')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['edit.html?type=members&id=adler-ada', 'edit.html?type=members&id=adler-ada']);
  assert.equal(dom.window.document.querySelector('a.edit-add-button').getAttribute('href'), 'edit.html?type=members&new');
  assert.ok(dom.window.document.querySelector('.edit-banner'));
});

test('events rows (sorted by date) map back to their original array index', async () => {
  const dom = new JSDOM(`<main><h1>Events</h1><div id="events-list"><ul class="event-list">
    <li class="event-item">new</li><li class="event-item">old</li></ul></div></main>`);
  const records = [{ date: '2020-01-01', title: 'old' }, { date: '2021-01-01', title: 'new' }];
  await decorateEditMode(dom.window.document, async (type) => { assert.equal(type, 'events'); return records; });
  const hrefs = [...dom.window.document.querySelectorAll('a.edit-button')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['edit.html?type=events&id=1', 'edit.html?type=events&id=0']);
});

test('pages that are not editable lists are left alone', async () => {
  const dom = new JSDOM('<main><h1>About</h1></main>');
  await decorateEditMode(dom.window.document, async () => []);
  assert.equal(dom.window.document.querySelector('a'), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/edit-mode.test.js`
Expected: FAIL (stub exports nothing).

- [ ] **Step 3: Implement `assets/js/edit-mode.js`**

```js
import { sortEventsByDateDesc } from './events.js';
import { sortNewsByDateDesc } from './news.js';

// Per list page: where the list lives, which elements are its rows, and how
// to learn each row's key. members/projects rows carry data-record-id;
// events/news have no id, so rows are matched to the data by re-applying the
// page's own (stable) sort and the key is the record's array index.
const PAGES = {
  members: { container: '#members-grid', rows: '#members-grid [data-record-id], #members-list [data-record-id]' },
  projects: { container: '#project-list', rows: '#project-list li[data-record-id]' },
  events: { container: '#events-list', rows: '#events-list li.event-item', sort: sortEventsByDateDesc },
  news: { container: '#news-list', rows: '#news-list li.news-item', sort: sortNewsByDateDesc },
};

export function isEditRequested(search, storage) {
  const params = new URLSearchParams(search);
  try {
    if (params.get('edit') === '0') {
      storage?.removeItem('edit');
      return false;
    }
    if (params.has('edit')) {
      storage?.setItem('edit', '1');
      return true;
    }
    return storage?.getItem('edit') === '1';
  } catch {
    return params.has('edit') && params.get('edit') !== '0';
  }
}

export function editHref(type, id) {
  return id === undefined ? `edit.html?type=${type}&new` : `edit.html?type=${type}&id=${encodeURIComponent(id)}`;
}

function link(doc, text, href, className) {
  const a = doc.createElement('a');
  a.className = className;
  a.setAttribute('href', href);
  a.textContent = text;
  return a;
}

export async function decorateEditMode(doc, loadRecords) {
  const type = Object.keys(PAGES).find((t) => doc.querySelector(PAGES[t].container));
  if (!type) return;
  const page = PAGES[type];
  const rows = [...doc.querySelectorAll(page.rows)];

  let keys;
  if (page.sort) {
    const records = await loadRecords(type);
    keys = page.sort(records.map((record, index) => ({ ...record, __index: index }))).map((r) => String(r.__index));
  } else {
    keys = rows.map((row) => row.dataset.recordId);
  }
  rows.forEach((row, i) => {
    if (keys[i] !== undefined) row.append(' ', link(doc, 'Edit', editHref(type, keys[i]), 'edit-button'));
  });

  const banner = doc.createElement('p');
  banner.className = 'edit-banner';
  banner.append('Edit mode: your changes are sent to the editors for review. ', link(doc, 'Exit edit mode', '?edit=0', 'edit-exit'));
  const add = link(doc, 'Add', editHref(type), 'edit-add-button');
  const controls = doc.querySelector('.list-controls');
  const heading = doc.querySelector('h1');
  (heading ?? doc.body).after(banner);
  if (controls) controls.append(add);
  else banner.after(add);
}

if (typeof document !== 'undefined') {
  let storage = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // storage may be blocked; edit mode then only lasts for this page view
  }
  if (isEditRequested(location.search, storage)) {
    decorateEditMode(document, async (type) => {
      const res = await fetch(`assets/data/${type}.json`);
      if (!res.ok) throw new Error(`Could not load ${type} data`);
      return res.json();
    }).catch((err) => console.error(err));
  }
}
```
Caveat for tests: the file auto-runs only when `document` already exists at import time; the test imports before creating jsdom globals, so it does not.

Add minimal `.edit-button`, `.edit-add-button`, `.edit-banner` rules to `assets/css/base.css` using only the existing `--color-*` variables (read the file for names; small inline-flex link styling, banner uses the accent/bg-alt variable).

- [ ] **Step 4: Run tests**

Run: `node --test tests/edit-mode.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/edit-mode.js assets/css/base.css tests/edit-mode.test.js
git commit -m "feat: ?edit mode adds Edit/Add buttons to list pages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Inbox library and server endpoints

**Files:**
- Create: `scripts/lib/inbox.mjs`
- Modify: `scripts/edit-server.mjs`
- Test: `tests/inbox.test.js`, `tests/edit-server.test.js` (add tests)

**Interfaces:**
- Consumes: `checkEnvelope`, `ntfyUrl`, `EDITABLE_TYPES`, `buildEnvelope`, `postEnvelope` (Task 2); `toSubmissionSchema`, `stripPrivateRecord`, `pickPrivateRecord` (Task 1); `getEditableTypes(schemaDir)` (existing; each type has `{ name, schema, kind, keyField }`); `getPublicEditConfig` (Task 4).
- Produces from `scripts/lib/inbox.mjs`:
  - `parseNtfyPoll(text): { id, time, message }[]`
  - `pollNtfy({ server, topic, since?, fetchFn? }): Promise<messages>`
  - `diffRecords(from, to): { field, from, to }[]`
  - `createInbox({ statePath, config, types, loadRecords, fetchFn? }): { refresh(), list(), resolve(id) }`
    - `refresh(): Promise<{ dropped: number }>` — polls since the stored `lastId`, validates, adds to `pending`.
    - `list(): Promise<entry[]>` where `entry = { id, time, type, op, data, key: string|null, stale: boolean, changes: {field,from,to}[]|null, prefill: object }`. `key` is the record's editor key (`id` or array index string) for updates whose record was found; `stale: true` and `key: null` when it was not; `prefill` is what the editor form should open with (for updates: the record's private fields merged under the submitted `data`).
    - `resolve(id): Promise<boolean>`.
  - Server: `createServer({ ..., ntfyConfig = null, inboxStatePath = path.resolve('.local', 'inbox.json'), ntfyFetch })`. `GET /api/inbox` → `{ enabled: false }` when `ntfyConfig` is null, else `{ enabled: true, entries, dropped, warning }` (a poll failure becomes `warning`, entries still listed). `POST /api/inbox/<id>` body `{ "action": "accept" | "reject" }` → 204, 404 if unknown, 400 for a bad action. When not enabled any other `/api/inbox/...` request is 404.
  - `main` in edit-server passes `ntfyConfig: getPublicEditConfig()`.

- [ ] **Step 1: Write the failing tests**

`tests/inbox.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getEditableTypes } from '../scripts/lib/editable-types.mjs';
import { parseNtfyPoll, diffRecords, createInbox } from '../scripts/lib/inbox.mjs';
import { buildEnvelope, postEnvelope } from '../assets/js/ntfy.js';

const types = getEditableTypes('schema');
const config = { server: 'https://ntfy.test', topic: 'topic' };

const line = (m) => JSON.stringify({
  id: m.id, time: m.time ?? 1, event: 'message', topic: 'topic',
  message: typeof m.message === 'string' ? m.message : JSON.stringify(m.message),
});
const fakeFetch = (messages, calls = []) => async (url) => {
  calls.push(url);
  return { ok: true, status: 200, text: async () => messages.map(line).join('\n') };
};
const env = (over) => buildEnvelope({ type: 'members', op: 'add', data: { lastname: 'Okoro', firstname: 'Chidi', affiliation: 'Lagos' }, ...over });

async function makeInbox(records, messages, calls) {
  const dir = await mkdtemp(path.join(tmpdir(), 'inbox-'));
  const statePath = path.join(dir, 'inbox.json');
  const inbox = createInbox({ statePath, config, types, loadRecords: async (name) => records[name] ?? [], fetchFn: fakeFetch(messages, calls) });
  return { inbox, statePath };
}

test('parseNtfyPoll keeps message events and ignores keepalives and junk lines', () => {
  const text = [
    JSON.stringify({ id: 'a', event: 'open' }), 'not json', line({ id: 'b', message: 'hi' }),
    JSON.stringify({ id: 'c', event: 'keepalive' }),
  ].join('\n');
  assert.deepEqual(parseNtfyPoll(text), [{ id: 'b', time: 1, message: 'hi' }]);
});

test('diffRecords lists changed, added and removed fields', () => {
  assert.deepEqual(diffRecords({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 }), [
    { field: 'b', from: 2, to: 5 }, { field: 'c', from: 3, to: null }, { field: 'd', from: null, to: 4 },
  ]);
});

test('refresh keeps valid envelopes, drops invalid ones, persists state and resumes from lastId', async () => {
  const calls = [];
  const messages = [
    { id: 'm1', message: env() },
    { id: 'm2', message: 'not json' },
    { id: 'm3', message: env({ data: { lastname: 'X' } }) },                       // fails schema (missing firstname, affiliation)
    { id: 'm4', message: env({ data: { lastname: 'O', firstname: 'C', affiliation: 'L', email: 'x@y.org' } }) }, // private field
    { id: 'm5', message: env({ data: { id: 'forced', lastname: 'O', firstname: 'C', affiliation: 'L' } }) },      // add must not set id
    { id: 'm6', message: { ...env(), type: 'site' } },
  ];
  const { inbox, statePath } = await makeInbox({}, messages, calls);
  assert.deepEqual(await inbox.refresh(), { dropped: 5 });
  assert.match(calls[0], /\/json\?poll=1&since=all$/);
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.deepEqual(Object.keys(state.pending), ['m1']);
  assert.equal(state.lastId, 'm6');
  await inbox.refresh();
  assert.match(calls[1], /since=m6$/);
});

test('list: keyed update shows changes and keeps private fields in the prefill', async () => {
  const records = { members: [{ id: 'adler-ada', lastname: 'Adler', firstname: 'Ada', affiliation: 'Old', email: 'ada@example.org' }] };
  const update = buildEnvelope({
    type: 'members', op: 'update', id: 'adler-ada',
    data: { id: 'adler-ada', lastname: 'Adler', firstname: 'Ada', affiliation: 'New' },
  });
  const { inbox } = await makeInbox(records, [{ id: 'u1', message: update }]);
  await inbox.refresh();
  const [entry] = await inbox.list();
  assert.equal(entry.key, 'adler-ada');
  assert.equal(entry.stale, false);
  assert.deepEqual(entry.changes, [{ field: 'affiliation', from: 'Old', to: 'New' }]);
  assert.equal(entry.prefill.email, 'ada@example.org');
  assert.equal(entry.prefill.affiliation, 'New');
});

test('list: update of a missing record is stale and opens as an add', async () => {
  const update = buildEnvelope({
    type: 'members', op: 'update', id: 'gone-person',
    data: { id: 'gone-person', lastname: 'G', firstname: 'P', affiliation: 'A' },
  });
  const { inbox } = await makeInbox({ members: [] }, [{ id: 'u1', message: update }]);
  await inbox.refresh();
  const [entry] = await inbox.list();
  assert.equal(entry.stale, true);
  assert.equal(entry.key, null);
  assert.equal(entry.changes, null);
});

test('list: records without an id are located by matching base, and keyed by array index', async () => {
  const records = { events: [{ date: '2020-01-01', title: 'a' }, { date: '2021-01-01', title: 'b' }] };
  const update = buildEnvelope({
    type: 'events', op: 'update', id: '1', base: { date: '2021-01-01', title: 'b' }, data: { date: '2021-01-01', title: 'b2' },
  });
  const { inbox } = await makeInbox(records, [{ id: 'e1', message: update }]);
  await inbox.refresh();
  const [entry] = await inbox.list();
  assert.equal(entry.key, '1');
  assert.deepEqual(entry.changes, [{ field: 'title', from: 'b', to: 'b2' }]);

  records.events[1].title = 'changed meanwhile';
  const [stale] = await inbox.list();
  assert.equal(stale.stale, true);
});

test('resolve removes an entry and it is not re-added when ntfy returns it again', async () => {
  const { inbox } = await makeInbox({}, [{ id: 'm1', message: env() }]);
  await inbox.refresh();
  assert.equal(await inbox.resolve('m1'), true);
  assert.equal(await inbox.resolve('m1'), false);
  await inbox.refresh();
  assert.deepEqual(await inbox.list(), []);
});

test('end to end against a fake ntfy server: postEnvelope -> refresh -> list', async () => {
  const stored = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { stored.push({ id: `id${stored.length + 1}`, time: 1, message: body }); res.writeHead(200).end('{}'); });
    } else {
      res.writeHead(200).end(stored.map(line).join('\n'));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = { server: `http://127.0.0.1:${server.address().port}`, topic: 'topic' };
    await postEnvelope({ ...base, envelope: env() });
    const dir = await mkdtemp(path.join(tmpdir(), 'inbox-'));
    const inbox = createInbox({ statePath: path.join(dir, 'inbox.json'), config: base, types, loadRecords: async () => [] });
    await inbox.refresh();
    const entries = await inbox.list();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].data.lastname, 'Okoro');
  } finally {
    server.close();
  }
});
```
Add to `tests/edit-server.test.js` (reuse `startTestServer(fixture, options)`):
```js
test('GET /api/inbox reports disabled when no ntfy topic is configured', async () => {
  const ctx = await startTestServer({});
  try {
    assert.deepEqual(await (await fetch(`${ctx.base}/api/inbox`)).json(), { enabled: false });
    assert.equal((await fetch(`${ctx.base}/api/inbox/x`, { method: 'POST', body: '{}' })).status, 404);
  } finally {
    await ctx.close();
  }
});

test('inbox endpoints list submissions and resolve them', async () => {
  const message = JSON.stringify({ v: 1, type: 'news', op: 'add', ts: 't', data: { date: '2026-01-01', title: 'Hi', url: 'https://example.org' } });
  const ntfyFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'n1', time: 1, event: 'message', message }) });
  const inboxStatePath = path.join(await mkdtemp(path.join(tmpdir(), 'inbox-')), 'inbox.json');
  const ctx = await startTestServer({}, { ntfyConfig: { server: 'https://ntfy.test', topic: 't' }, inboxStatePath, ntfyFetch });
  try {
    const body = await (await fetch(`${ctx.base}/api/inbox`)).json();
    assert.equal(body.enabled, true);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].data.title, 'Hi');
    const post = (id, action) => fetch(`${ctx.base}/api/inbox/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    assert.equal((await post('n1', 'nonsense')).status, 400);
    assert.equal((await post('n1', 'reject')).status, 204);
    assert.equal((await post('n1', 'reject')).status, 404);
    assert.deepEqual((await (await fetch(`${ctx.base}/api/inbox`)).json()).entries, []);
  } finally {
    await ctx.close();
  }
});

test('a failing ntfy poll becomes a warning but pending entries are still listed', async () => {
  const ntfyFetch = async () => ({ ok: false, status: 503 });
  const inboxStatePath = path.join(await mkdtemp(path.join(tmpdir(), 'inbox-')), 'inbox.json');
  const ctx = await startTestServer({}, { ntfyConfig: { server: 'https://ntfy.test', topic: 't' }, inboxStatePath, ntfyFetch });
  try {
    const body = await (await fetch(`${ctx.base}/api/inbox`)).json();
    assert.match(body.warning, /503/);
    assert.deepEqual(body.entries, []);
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/inbox.test.js tests/edit-server.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `scripts/lib/inbox.mjs`**

```js
// Collects public submissions from the ntfy topic for review in the editor.
// Messages are validated against the public (submission) schema and kept as
// "pending" in a local state file until the reviewer accepts or rejects them,
// so they survive ntfy's short message retention.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { EDITABLE_TYPES, checkEnvelope, ntfyUrl } from '../../assets/js/ntfy.js';
import { pickPrivateRecord, stripPrivateRecord, toSubmissionSchema } from '../../assets/js/private-fields.js';

export function parseNtfyPoll(text) {
  const messages = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.event === 'message' && typeof entry.id === 'string' && typeof entry.message === 'string') {
      messages.push({ id: entry.id, time: entry.time, message: entry.message });
    }
  }
  return messages;
}

export async function pollNtfy({ server, topic, since, fetchFn = globalThis.fetch }) {
  const url = `${ntfyUrl({ server, topic })}/json?poll=1&since=${encodeURIComponent(since || 'all')}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`ntfy responded with HTTP ${res.status}`);
  return parseNtfyPoll(await res.text());
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function diffRecords(from, to) {
  const fields = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  return fields
    .filter((f) => stableStringify(from[f]) !== stableStringify(to[f]))
    .map((f) => ({ field: f, from: from[f] ?? null, to: to[f] ?? null }));
}

export function createInbox({ statePath, config, types, loadRecords, fetchFn }) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addKeyword('x-editor');
  const byName = new Map(
    types
      .filter((t) => t.kind === 'array' && EDITABLE_TYPES.includes(t.name))
      .map((t) => [t.name, { ...t, validate: ajv.compile(toSubmissionSchema(t.schema).items) }])
  );

  async function readState() {
    try {
      return { lastId: null, pending: {}, resolved: [], ...JSON.parse(await readFile(statePath, 'utf8')) };
    } catch (err) {
      if (err.code === 'ENOENT') return { lastId: null, pending: {}, resolved: [] };
      throw err;
    }
  }

  async function writeState(state) {
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
  }

  // Schema-valid is not enough: the id rules keep a submission from addressing
  // a different record than the one it claims to change.
  function acceptable(envelope) {
    const type = byName.get(envelope.type);
    if (!type || !type.validate(envelope.data)) return false;
    if (type.keyField) {
      return envelope.op === 'add' ? !(type.keyField in envelope.data) : envelope.data[type.keyField] === envelope.id;
    }
    return envelope.op === 'add' || envelope.base !== undefined;
  }

  async function refresh() {
    const state = await readState();
    const messages = await pollNtfy({ ...config, since: state.lastId, fetchFn });
    let dropped = 0;
    for (const m of messages) {
      state.lastId = m.id;
      if (state.pending[m.id] || state.resolved.includes(m.id)) continue;
      let parsed;
      try {
        parsed = JSON.parse(m.message);
      } catch {
        dropped += 1;
        continue;
      }
      const checked = checkEnvelope(parsed);
      if (!checked.ok || !acceptable(checked.envelope)) {
        dropped += 1;
        continue;
      }
      state.pending[m.id] = { id: m.id, time: m.time, envelope: checked.envelope };
    }
    await writeState(state);
    return { dropped };
  }

  function locate(type, envelope, records) {
    if (type.keyField) {
      const record = records.find((r) => r[type.keyField] === envelope.id);
      return record ? { record, key: envelope.id } : null;
    }
    const wanted = stableStringify(envelope.base);
    const index = records.findIndex((r) => stableStringify(stripPrivateRecord(type.schema, r)) === wanted);
    return index === -1 ? null : { record: records[index], key: String(index) };
  }

  function describe(pending, type, records) {
    const { envelope } = pending;
    const entry = { id: pending.id, time: pending.time, type: envelope.type, op: envelope.op, data: envelope.data };
    if (envelope.op === 'add') return { ...entry, key: null, stale: false, changes: null, prefill: envelope.data };
    const found = locate(type, envelope, records);
    if (!found) return { ...entry, key: null, stale: true, changes: null, prefill: envelope.data };
    return {
      ...entry,
      key: found.key,
      stale: false,
      changes: diffRecords(stripPrivateRecord(type.schema, found.record), envelope.data),
      prefill: { ...pickPrivateRecord(type.schema, found.record), ...envelope.data },
    };
  }

  async function list() {
    const state = await readState();
    const cache = new Map();
    const entries = [];
    for (const pending of Object.values(state.pending).sort((a, b) => a.time - b.time)) {
      const type = byName.get(pending.envelope.type);
      if (!type) continue;
      if (!cache.has(type.name)) cache.set(type.name, await loadRecords(type.name));
      entries.push(describe(pending, type, cache.get(type.name)));
    }
    return entries;
  }

  async function resolve(id) {
    const state = await readState();
    if (!state.pending[id]) return false;
    delete state.pending[id];
    state.resolved = [...state.resolved, id].slice(-1000);
    await writeState(state);
    return true;
  }

  // One operation at a time: they all read-modify-write the state file.
  let queue = Promise.resolve();
  const serialized = (fn) => (...args) => {
    const run = queue.then(() => fn(...args));
    queue = run.catch(() => {});
    return run;
  };
  return { refresh: serialized(refresh), list: serialized(list), resolve: serialized(resolve) };
}
```

- [ ] **Step 4: Wire into `scripts/edit-server.mjs`**

- Imports: `import { createInbox } from './lib/inbox.mjs';` and `import { getPublicEditConfig } from './lib/public-edit.mjs';`
- `createServer` options gain: `ntfyConfig = null, inboxStatePath = path.resolve('.local', 'inbox.json'), ntfyFetch,`
- After `validators` is created:
```js
  const inbox = ntfyConfig
    ? createInbox({ statePath: inboxStatePath, config: ntfyConfig, types, loadRecords, fetchFn: ntfyFetch })
    : null;
```
- In `handleApi`, before the `parts[1] === 'data'` block:
```js
    if (parts[1] === 'inbox') {
      if (!inbox) {
        if (parts.length === 2 && req.method === 'GET') return sendJSON(res, 200, { enabled: false });
        return sendError(res, 404, 'Inbox is not enabled');
      }
      if (parts.length === 2 && req.method === 'GET') {
        let dropped = 0;
        let warning = null;
        try {
          ({ dropped } = await inbox.refresh());
        } catch (err) {
          warning = `Could not fetch new submissions: ${err.message}`;
        }
        return sendJSON(res, 200, { enabled: true, entries: await inbox.list(), dropped, warning });
      }
      if (parts.length === 3 && req.method === 'POST') {
        const body = await readJSONBody(req);
        if (body.action !== 'accept' && body.action !== 'reject') {
          return sendError(res, 400, 'action must be "accept" or "reject"');
        }
        const found = await inbox.resolve(decodeURIComponent(parts[2]));
        return found ? sendJSON(res, 204, null) : sendError(res, 404, 'No such submission');
      }
    }
```
- In the `main` block at the bottom: add `ntfyConfig: getPublicEditConfig(),` to the `createServer({...})` call.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/inbox.mjs scripts/edit-server.mjs tests/inbox.test.js tests/edit-server.test.js
git commit -m "feat: editor inbox backend collects and validates ntfy submissions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Editor inbox UI

**Files:**
- Create: `scripts/editor/inbox-view.js`
- Modify: `scripts/editor/index.html`, `scripts/editor/style.css`, `scripts/editor/app.js`, `scripts/edit-server.mjs` (`STATIC_FILES`)
- Test: `tests/inbox-view.test.js`, `tests/edit-server.test.js` (add one assertion test)

**Interfaces:**
- Consumes: `GET /api/inbox`, `POST /api/inbox/<id>` (Task 7); entry shape from Task 7; `openForm`, `selectType`, `fetchJSON`, `state` in `app.js`.
- Produces: `renderInboxEntries(container, entries, { onReview(entry), onReject(entry) }): void` (pure DOM). Server serves `/inbox-view.js`.

- [ ] **Step 1: Write the failing tests**

`tests/inbox-view.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderInboxEntries } from '../scripts/editor/inbox-view.js';

function render(entries, handlers = {}) {
  const dom = new JSDOM('<div id="c"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.getElementById('c');
  renderInboxEntries(container, entries, { onReview() {}, onReject() {}, ...handlers });
  return container;
}

test('shows an empty state', () => {
  assert.match(render([]).textContent, /No new submissions/);
});

test('an update shows its field changes; an add shows the submitted values', () => {
  const c = render([
    { id: 'u', time: 1, type: 'members', op: 'update', key: 'a', stale: false, data: {}, changes: [{ field: 'affiliation', from: 'Old', to: 'New' }], prefill: {} },
    { id: 'a', time: 2, type: 'news', op: 'add', key: null, stale: false, data: { title: 'Hello' }, changes: null, prefill: {} },
  ]);
  const text = c.textContent;
  assert.match(text, /affiliation/);
  assert.match(text, /Old/);
  assert.match(text, /New/);
  assert.match(text, /Hello/);
});

test('a stale update shows a warning', () => {
  const c = render([{ id: 'u', time: 1, type: 'members', op: 'update', key: null, stale: true, data: {}, changes: null, prefill: {} }]);
  assert.match(c.querySelector('.inbox-warning').textContent, /no longer|changed/i);
});

test('buttons call the handlers with the entry; submitted text is not interpreted as HTML', () => {
  const entry = { id: 'a', time: 2, type: 'news', op: 'add', key: null, stale: false, data: { title: '<img src=x onerror=alert(1)>' }, changes: null, prefill: {} };
  const calls = [];
  const c = render([entry], { onReview: (e) => calls.push(['review', e.id]), onReject: (e) => calls.push(['reject', e.id]) });
  assert.equal(c.querySelector('img'), null);
  c.querySelector('[data-action="review"]').click();
  c.querySelector('[data-action="reject"]').click();
  assert.deepEqual(calls, [['review', 'a'], ['reject', 'a']]);
});
```
Add to `tests/edit-server.test.js`:
```js
test('the inbox view module is served to the editor', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/inbox-view.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /export function renderInboxEntries/);
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/inbox-view.test.js tests/edit-server.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `scripts/editor/inbox-view.js`**

```js
// Renders pending public submissions. Built with DOM APIs and textContent only:
// the content comes from anonymous visitors and must never be parsed as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const show = (value) => (value === null || value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value));

function changesTable(rows, headers) {
  const table = el('table', 'inbox-changes');
  const head = el('tr');
  headers.forEach((h) => head.append(el('th', '', h)));
  table.append(head);
  rows.forEach((cells) => {
    const tr = el('tr');
    cells.forEach((c) => tr.append(el('td', '', show(c))));
    table.append(tr);
  });
  return table;
}

export function renderInboxEntries(container, entries, { onReview, onReject }) {
  container.replaceChildren();
  if (!entries.length) {
    container.append(el('p', 'empty-state', 'No new submissions.'));
    return;
  }
  for (const entry of entries) {
    const article = el('article', 'inbox-entry');
    article.append(el('h3', '', `${entry.type} · ${entry.op === 'add' ? 'new entry' : 'edit'}`));
    if (entry.time) article.append(el('p', 'inbox-time', new Date(entry.time * 1000).toLocaleString()));
    if (entry.stale) {
      article.append(el('p', 'inbox-warning', 'The record this edit refers to no longer exists or has changed since. Accepting will add it as a new entry.'));
    }
    if (entry.changes) {
      article.append(
        entry.changes.length
          ? changesTable(entry.changes.map((c) => [c.field, c.from, c.to]), ['Field', 'Current', 'Proposed'])
          : el('p', '', 'No changes compared to the current record.')
      );
    } else {
      article.append(changesTable(Object.entries(entry.data), ['Field', 'Value']));
    }
    const actions = el('p', 'inbox-actions');
    const review = el('button', '', 'Review & accept');
    review.type = 'button';
    review.dataset.action = 'review';
    review.addEventListener('click', () => onReview(entry));
    const reject = el('button', '', 'Reject');
    reject.type = 'button';
    reject.dataset.action = 'reject';
    reject.addEventListener('click', () => onReject(entry));
    actions.append(review, ' ', reject);
    article.append(actions);
    container.append(article);
  }
}
```
`scripts/edit-server.mjs` `STATIC_FILES` gains `'/inbox-view.js': { file: 'inbox-view.js', type: 'text/javascript' },`.

- [ ] **Step 4: Editor markup and styles**

`scripts/editor/index.html`: in `.sidebar-tools` add, as the first child after the `<h2>`:
```html
      <div class="tool" id="inbox-tool" hidden>
        <button id="inbox-button" type="button" class="tool-button">Inbox</button>
        <p id="inbox-status" class="tool-status" role="status"></p>
      </div>
```
and in `<main class="main">`, before `.table-panel`:
```html
    <section id="inbox-panel" class="table-panel" hidden>
      <div class="table-header">
        <h1>Inbox</h1>
        <button id="inbox-refresh" type="button">Refresh</button>
        <button id="inbox-close" type="button">Close</button>
      </div>
      <div id="inbox-list"></div>
    </section>
```
`scripts/editor/style.css`: add small rules for `.inbox-entry` (bordered card with spacing), `.inbox-warning` (use the file's existing error/warning colour), `.inbox-changes` (full-width table, left-aligned cells, cell padding). Follow the existing file's variable/colour conventions.

- [ ] **Step 5: Wire up `scripts/editor/app.js`**

- Import: `import { renderInboxEntries } from '/inbox-view.js';`
- `state` gains `inboxEntry: null,`. In `hideForm()` add `state.inboxEntry = null;`.
- `openForm` takes an optional prefill and a title override:
```js
function openForm(key, prefill) {
  state.editingKey = key;
  document.getElementById('form-title').textContent = state.inboxEntry
    ? `Review submission: ${state.currentType.name}`
    : key === null ? `New ${state.currentType.name}` : `Edit ${state.currentType.name}`;
  hideFormError();
  renderForm(prefill ?? (key === null ? {} : findRecordByKey(key)));
  document.getElementById('form-panel').hidden = false;
}
```
- In the record-form submit handler, after the successful save (the `POST`/`PUT` completes) and **before** `await selectType(name)`:
```js
    if (state.inboxEntry) {
      const entry = state.inboxEntry;
      await fetchJSON(`/api/inbox/${encodeURIComponent(entry.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      });
      loadInbox();
    }
```
- New inbox code (append before the final `loadTypes()` call):
```js
const inboxPanel = document.getElementById('inbox-panel');
let inboxEntries = [];

async function loadInbox() {
  const status = document.getElementById('inbox-status');
  status.textContent = 'Checking for submissions…';
  try {
    const body = await fetchJSON('/api/inbox');
    if (!body.enabled) return;
    inboxEntries = body.entries;
    document.getElementById('inbox-tool').hidden = false;
    document.getElementById('inbox-button').textContent = `Inbox (${inboxEntries.length})`;
    const notes = [];
    if (body.dropped) notes.push(`${body.dropped} invalid message(s) ignored.`);
    if (body.warning) notes.push(body.warning);
    status.textContent = notes.join(' ');
    status.classList.toggle('error', Boolean(body.warning));
    renderInboxEntries(document.getElementById('inbox-list'), inboxEntries, { onReview: reviewSubmission, onReject: rejectSubmission });
  } catch (err) {
    status.textContent = err.message;
    status.classList.add('error');
  }
}

async function reviewSubmission(entry) {
  inboxPanel.hidden = true;
  await selectType(entry.type);
  state.inboxEntry = entry;
  openForm(entry.key, entry.prefill);
}

async function rejectSubmission(entry) {
  if (!confirm('Reject this submission?')) return;
  await fetchJSON(`/api/inbox/${encodeURIComponent(entry.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject' }),
  });
  await loadInbox();
}

document.getElementById('inbox-button').addEventListener('click', () => { inboxPanel.hidden = false; });
document.getElementById('inbox-close').addEventListener('click', () => { inboxPanel.hidden = true; });
document.getElementById('inbox-refresh').addEventListener('click', loadInbox);
loadInbox();
```
Note on the "accept" path: for a stale or add entry `entry.key` is `null`, so `openForm(null, prefill)` goes through the existing `POST` branch (`state.editingKey === null`), which also assigns a new id for members/projects.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/editor scripts/edit-server.mjs tests/inbox-view.test.js tests/edit-server.test.js
git commit -m "feat: editor inbox UI to review, accept and reject public submissions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Documentation, spec refinements, final verification

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-06-public-edit-via-ntfy-design.md`

- [ ] **Step 1: README section**

Insert a new `## Public edits via ntfy (optional)` section after "Local data editor" in `README.md`, covering, in this order, each as short prose or a bullet list:
1. What it is: with `NTFY_TOPIC` set, any list page opened with `?edit` shows an Edit button per row and an Add button; the form posts a JSON message to `{NTFY_SERVER}/{NTFY_TOPIC}`; nothing is published until a reviewer accepts it in the editor.
2. Setup: set `NTFY_TOPIC` (and optionally `NTFY_SERVER`) in `.env` for local builds and as repository **variables** (not secrets — the topic is visible in the site source) for GitHub/GitLab CI; pick a long random topic name.
3. Private fields: `"x-editor": { "private": true }` on a schema property keeps it out of the published data, the public form and the messages; `email` is private, so reviewers fill it in for new members.
4. Reviewing: the editor shows an **Inbox (n)** button when a topic is configured; entries show a field-by-field diff; "Review & accept" opens the normal form prefilled, saving goes through the usual save path; "Reject" discards. Pending entries are kept in `.local/inbox.json`.
5. Limits and trust: ntfy.sh keeps messages ~12 h and allows 4 KB per message (self-host and set `NTFY_SERVER` for more); anyone who knows the topic can read and post to it, so everything is validated against the schema and reviewed by hand; submissions that fail validation are silently ignored (the inbox reports how many).
6. Disabling: leave `NTFY_TOPIC` blank; nothing is built.

- [ ] **Step 2: AGENTS.md**

Under "Gotchas actually hit during testing" add one bullet: `NTFY_TOPIC`/`NTFY_SERVER` are CI **Variables** like `CONTENT_PATH` (the topic is public in the site source); if unset the public-edit feature is simply not built, so a missing variable is silent — check `public/edit.html` exists when testing the feature.

- [ ] **Step 3: Spec refinements**

In `docs/superpowers/specs/2026-10-06-public-edit-via-ntfy-design.md` record what the plan decided (edit the relevant sections, keep it concise):
- Envelope gains optional `base` (original public record) for `update` of collections without an `id` field (events, news); `id` for those is the array index; the inbox locates the record by matching `base`, and marks the entry **stale** (opens as an add) when no match is found.
- `toSubmissionSchema` (private fields stripped, readOnly fields not required) is the schema used both for the published `assets/schema/*.json` and for validating incoming messages.
- Inbox state is `{ lastId, pending, resolved }` in `.local/inbox.json`; pending submissions are stored locally so they outlive ntfy's retention; `resolved` ids prevent re-adding.
- Extra validation: `add` must not carry the key field; keyed `update` must carry `data[keyField] === envelope.id`.

- [ ] **Step 4: Final verification**

Run each and confirm the stated result:
- `npm test` → all pass.
- `npm run validate` → passes (the `x-editor.private` keyword is already registered by `ajv-editor-keyword.cjs`; if ajv-cli rejects `private`, nothing else is needed since `x-editor` is registered as an opaque keyword).
- `NTFY_TOPIC= npm run build && ls public` → no `edit.html`, no `assets/data`.
- `NTFY_TOPIC=demo-topic npm run build` → `public/edit.html`, `public/assets/data/members.json` without `email`; `grep -rl "@" public/assets/data` prints nothing.
- Local smoke without touching the internet: start `npx http-server`-free check by running `node scripts/edit-server.mjs` is not needed — the inbox end-to-end test in `tests/inbox.test.js` already covers post → poll → list against a local fake ntfy server.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md docs/superpowers/specs/2026-10-06-public-edit-via-ntfy-design.md
git commit -m "docs: public edit via ntfy (README, AGENTS, spec refinements)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** private flag + email (T1); `NTFY_TOPIC`/`NTFY_SERVER`, feature absent when unset (T4); `?edit` Edit/Add buttons and session persistence (T6); form page reusing editor code (T3, T5); POST to ntfy incl. size limit (T2, T5); editor collects, reviews, saves (T7, T8); stale handling and diff (T7, T8); trust/abuse documentation (T9); tests throughout. The spec's "public data bundle / stripped schemas / config block" is T4.
- **Spec gap resolved:** events/news have no `id`; handled via `base` + array index (T2 `checkEnvelope`, T5, T6, T7) and recorded in the spec in T9.
- **Name consistency:** `toSubmissionSchema`, `stripPrivateRecords`, `pickPrivateRecord`, `buildEnvelope`, `checkEnvelope`, `postEnvelope`, `renderRecordFields`, `collectRecordData`, `getPublicEditConfig`, `createInbox` are defined in T1–T4/T7 and used with the same signatures later. Row attribute is `data-record-id` everywhere (T4, T6). Entry fields `key`, `stale`, `changes`, `prefill` are identical in T7 and T8.
