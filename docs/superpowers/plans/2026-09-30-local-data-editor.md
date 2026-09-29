# Local Data Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-only `npm run edit` webserver serving a schema-driven CRUD UI for every content type whose schema is `type: array` with `items` (`members`, `projects`, `events`, `news`), including a members↔projects participant picker.

**Architecture:** Three small, independently-testable pure logic modules (`editable-types.mjs`, `record-store.mjs`, `member-cascade.mjs`) feed a Node `http` server (`edit-server.mjs`, built as a `createServer({ contentPath, schemaDir, editorDir })` factory for testability) that exposes a JSON API and serves a static vanilla-JS single-page frontend (`scripts/editor/`). The server validates every write with Ajv against the same schemas `npm run validate` uses, and reads/writes through the `content-store.mjs` module from the member-ids plan (local dir or WebDAV).

**Tech Stack:** Plain Node.js (`node:http`, `node:test`), one new dependency: `ajv`.

**Depends on:** `docs/superpowers/plans/2026-09-30-member-ids.md` must be implemented first — this plan's server imports `computeMemberId` from `assets/js/shared.js` and relies on `schema/members.schema.json` having an `id` property (that's also how `editable-types.mjs` tells members/projects apart from events/news — see Task 1).

---

## File structure

- **Create** `scripts/lib/editable-types.mjs` — reads `schema/*.schema.json`, returns the array-of-items ones with a `keyField` (`'id'` if the item schema has an `id` property, else `null`).
- **Create** `tests/editable-types.test.js`.
- **Create** `scripts/lib/record-store.mjs` — find/replace/delete one record in an array, by `id` or by index.
- **Create** `tests/record-store.test.js`.
- **Create** `scripts/lib/member-cascade.mjs` — find projects referencing a member; remove a member and strip them from every project's `participants`.
- **Create** `tests/member-cascade.test.js`.
- **Create** `scripts/editor/index.html`, `scripts/editor/style.css`, `scripts/editor/app.js` — the static frontend.
- **Create** `scripts/edit-server.mjs` — `createServer(...)` factory + CLI entry point.
- **Create** `tests/edit-server.test.js` — integration tests against a real HTTP server + temp content fixture.
- **Modify** `package.json` — add `ajv` devDependency and an `edit` npm script.
- **Modify** `README.md` — document `npm run edit`.

---

### Task 1: `editable-types.mjs`

**Files:**
- Create: `scripts/lib/editable-types.mjs`
- Test: `tests/editable-types.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/editable-types.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getEditableTypes } from '../scripts/lib/editable-types.mjs';

async function writeSchema(dir, name, schema) {
  await writeFile(path.join(dir, `${name}.schema.json`), JSON.stringify(schema));
}

test('getEditableTypes picks up array-of-items schemas and ignores object schemas', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'schemas-'));
  await writeSchema(dir, 'members', {
    type: 'array',
    items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  });
  await writeSchema(dir, 'site', { type: 'object', properties: { title: { type: 'string' } } });
  const types = getEditableTypes(dir);
  assert.deepEqual(types.map((t) => t.name).sort(), ['members']);
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
  assert.deepEqual(names, ['events', 'members', 'news', 'projects']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/editable-types.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/editable-types.mjs'`

- [ ] **Step 3: Implement `editable-types.mjs`**

Create `scripts/lib/editable-types.mjs`:

```javascript
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
    .filter(({ schema }) => schema.type === 'array' && schema.items)
    .map(({ name, schema }) => ({
      name,
      schema,
      keyField: schema.items.properties && schema.items.properties.id ? 'id' : null,
    }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/editable-types.test.js`
Expected: PASS (4 tests). Note: the fourth test requires Task 1 of the member-ids plan to already be applied (`schema/members.schema.json` must have an `id` property) — if it fails expecting `['events', 'members', 'news', 'projects']` but members is missing from the list, the member-ids plan hasn't been run yet.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/editable-types.mjs tests/editable-types.test.js
git commit -m "Add editable-types module deriving editor collections from schema shape

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `record-store.mjs`

**Files:**
- Create: `scripts/lib/record-store.mjs`
- Test: `tests/record-store.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/record-store.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/record-store.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/record-store.mjs'`

- [ ] **Step 3: Implement `record-store.mjs`**

Create `scripts/lib/record-store.mjs`:

```javascript
// Locates/replaces/deletes one record in an array, addressed either by a
// named field (keyField, e.g. 'id') or, when keyField is null, by its
// position in the array.
export function findRecordIndex(records, keyField, key) {
  if (keyField) return records.findIndex((r) => r[keyField] === key);
  const index = Number(key);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/record-store.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/record-store.mjs tests/record-store.test.js
git commit -m "Add record-store module for id- or index-addressed CRUD on an array

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `member-cascade.mjs`

**Files:**
- Create: `scripts/lib/member-cascade.mjs`
- Test: `tests/member-cascade.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/member-cascade.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/member-cascade.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/member-cascade.mjs'`

- [ ] **Step 3: Implement `member-cascade.mjs`**

Create `scripts/lib/member-cascade.mjs`:

```javascript
export function findProjectsReferencingMember(projects, memberId) {
  return projects.filter((p) => Array.isArray(p.participants) && p.participants.includes(memberId));
}

export function cascadeDeleteMember(members, projects, memberId) {
  const remainingMembers = members.filter((m) => m.id !== memberId);
  const updatedProjects = projects.map((p) =>
    Array.isArray(p.participants) && p.participants.includes(memberId)
      ? { ...p, participants: p.participants.filter((id) => id !== memberId) }
      : p
  );
  return { members: remainingMembers, projects: updatedProjects };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/member-cascade.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/member-cascade.mjs tests/member-cascade.test.js
git commit -m "Add member-cascade module for cascading member deletion into projects

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Editor frontend (static files)

No automated tests (no DOM testing library in this project — verified manually in Task 7). This task's own check is a syntax check.

**Files:**
- Create: `scripts/editor/index.html`
- Create: `scripts/editor/style.css`
- Create: `scripts/editor/app.js`

- [ ] **Step 1: Create the page shell**

Create `scripts/editor/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Content Editor</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="layout">
  <nav id="type-nav" class="type-nav"></nav>
  <main class="main">
    <div class="table-panel">
      <div class="table-header">
        <h1 id="type-title"></h1>
        <button id="new-button" type="button">New</button>
      </div>
      <table id="records-table"><thead></thead><tbody></tbody></table>
    </div>
    <div id="form-panel" class="form-panel" hidden>
      <h2 id="form-title"></h2>
      <div id="form-error" class="form-error" hidden></div>
      <form id="record-form"></form>
    </div>
  </main>
</div>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the stylesheet**

Create `scripts/editor/style.css`:

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; color: #1a1a1a; }
.layout { display: flex; min-height: 100vh; }
.type-nav { width: 180px; background: #f4f4f4; padding: 1rem; flex-shrink: 0; }
.type-nav a { display: block; padding: 0.4rem 0; color: #1a1a1a; text-decoration: none; }
.type-nav a.active { font-weight: bold; }
.main { flex: 1; padding: 1.5rem; display: flex; gap: 1.5rem; min-width: 0; }
.table-panel { flex: 1; min-width: 0; }
.table-header { display: flex; justify-content: space-between; align-items: center; }
table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { text-align: left; padding: 0.4rem; border-bottom: 1px solid #ddd; }
.row-actions button { margin-right: 0.4rem; }
.form-panel { width: 360px; flex-shrink: 0; border-left: 1px solid #ddd; padding-left: 1.5rem; }
.form-error { background: #fde8e8; border: 1px solid #f5b5b5; padding: 0.5rem; margin-bottom: 1rem; white-space: pre-wrap; }
.field { margin-bottom: 0.8rem; }
.field label { display: block; font-weight: bold; margin-bottom: 0.2rem; }
.field input, .field textarea { width: 100%; padding: 0.3rem; }
.array-row { display: flex; gap: 0.4rem; margin-bottom: 0.3rem; }
.array-row input { flex: 1; }
.participant-list { list-style: none; padding: 0; margin: 0 0 0.5rem; }
.participant-list li { display: flex; justify-content: space-between; padding: 0.2rem 0; }
.participant-search-results { border: 1px solid #ddd; max-height: 150px; overflow-y: auto; margin-top: 0.3rem; }
.participant-search-results div { display: flex; justify-content: space-between; padding: 0.2rem 0.4rem; }
```

- [ ] **Step 3: Create the app logic**

Create `scripts/editor/app.js`:

```javascript
const state = {
  types: [],
  currentType: null,
  schema: null,
  records: [],
  members: [],
  editingKey: null,
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.error || `Request failed: ${res.status}`);
    error.status = res.status;
    error.details = body?.details;
    error.body = body;
    throw error;
  }
  return body;
}

async function loadTypes() {
  state.types = await fetchJSON('/api/types');
  const nav = document.getElementById('type-nav');
  nav.innerHTML = state.types.map((t) => `<a href="#${t.name}" data-type="${t.name}">${t.name}</a>`).join('');
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-type]');
    if (!a) return;
    e.preventDefault();
    selectType(a.dataset.type);
  });
}

async function selectType(name) {
  state.currentType = state.types.find((t) => t.name === name);
  state.schema = await fetchJSON(`/api/schema/${name}`);
  state.records = await fetchJSON(`/api/data/${name}`);
  if (name === 'projects') {
    state.members = await fetchJSON('/api/data/members');
  }
  document.querySelectorAll('#type-nav a').forEach((a) => a.classList.toggle('active', a.dataset.type === name));
  document.getElementById('type-title').textContent = name;
  renderTable();
  hideForm();
}

function recordKey(record, index) {
  return state.currentType.keyField ? record[state.currentType.keyField] : String(index);
}

function recordLabel(record) {
  if (record.title) return record.title;
  if (record.firstname || record.lastname) return `${record.firstname || ''} ${record.lastname || ''}`.trim();
  return record.date || JSON.stringify(record).slice(0, 40);
}

function renderTable() {
  document.querySelector('#records-table thead').innerHTML = '<tr><th>Record</th><th>Actions</th></tr>';
  const tbody = document.querySelector('#records-table tbody');
  tbody.innerHTML = state.records
    .map((record, index) => {
      const key = recordKey(record, index);
      return `<tr>
        <td>${escapeHTML(recordLabel(record))}</td>
        <td class="row-actions">
          <button type="button" data-action="edit" data-key="${escapeHTML(key)}">Edit</button>
          <button type="button" data-action="delete" data-key="${escapeHTML(key)}">Delete</button>
        </td>
      </tr>`;
    })
    .join('');
}

function findRecordByKey(key) {
  return state.records.find((record, index) => recordKey(record, index) === key);
}

function hideFormError() {
  const el = document.getElementById('form-error');
  el.hidden = true;
  el.textContent = '';
}

function showFormError(message, details) {
  const el = document.getElementById('form-error');
  const detailText = Array.isArray(details) ? details.map((d) => `${d.instancePath || '(root)'}: ${d.message}`).join('\n') : '';
  el.textContent = detailText ? `${message}\n${detailText}` : message;
  el.hidden = false;
}

function buildStringListField(key, values) {
  const container = document.createElement('div');
  container.dataset.field = key;
  container.className = 'string-list';

  function addRow(value = '') {
    const row = document.createElement('div');
    row.className = 'array-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => row.remove());
    row.append(input, removeButton);
    container.appendChild(row);
  }

  values.forEach((v) => addRow(v));
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.textContent = 'Add';
  addButton.addEventListener('click', () => addRow());
  container.appendChild(addButton);
  return container;
}

function buildParticipantPicker(participantIds) {
  const container = document.createElement('div');
  container.className = 'field participant-picker';
  container.dataset.field = 'participants';

  const label = document.createElement('label');
  label.textContent = 'participants';
  container.appendChild(label);

  const list = document.createElement('ul');
  list.className = 'participant-list';
  container.appendChild(list);

  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search members by name…';
  container.appendChild(search);

  const results = document.createElement('div');
  results.className = 'participant-search-results';
  container.appendChild(results);

  let currentIds = [...participantIds];

  const memberName = (member) => `${member.firstname} ${member.lastname}`;

  function renderList() {
    list.innerHTML = '';
    currentIds.forEach((id) => {
      const member = state.members.find((m) => m.id === id);
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = member ? memberName(member) : id;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        currentIds = currentIds.filter((existingId) => existingId !== id);
        renderList();
      });
      li.append(nameSpan, removeButton);
      list.appendChild(li);
    });
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) return;
    state.members
      .filter((m) => !currentIds.includes(m.id) && memberName(m).toLowerCase().includes(q))
      .forEach((m) => {
        const row = document.createElement('div');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = memberName(m);
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = 'Add';
        addButton.addEventListener('click', () => {
          currentIds.push(m.id);
          search.value = '';
          results.innerHTML = '';
          renderList();
        });
        row.append(nameSpan, addButton);
        results.appendChild(row);
      });
  }

  search.addEventListener('input', () => renderResults(search.value));

  container.getParticipantIds = () => currentIds;
  renderList();
  return container;
}

function buildField(key, propSchema, value, required) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const isAutoId = state.currentType.name === 'members' && key === 'id';
  const label = document.createElement('label');
  label.textContent = key + (required && !isAutoId ? ' *' : '');
  label.setAttribute('for', `field-${key}`);
  wrapper.appendChild(label);

  if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
    wrapper.appendChild(buildStringListField(key, value || []));
    return wrapper;
  }

  const input = key === 'description' ? document.createElement('textarea') : document.createElement('input');
  if (input.tagName === 'INPUT') input.type = 'text';
  input.id = `field-${key}`;
  input.name = key;
  input.value = value ?? '';
  if (propSchema.pattern) input.pattern = propSchema.pattern;
  if (required && !isAutoId) input.required = true;
  if (isAutoId) input.placeholder = 'Leave blank to auto-generate from name';
  wrapper.appendChild(input);
  return wrapper;
}

function renderForm(record) {
  const form = document.getElementById('record-form');
  const properties = state.schema.items.properties;
  const required = new Set(state.schema.items.required || []);
  form.innerHTML = '';

  Object.entries(properties).forEach(([key, propSchema]) => {
    if (state.currentType.name === 'projects' && key === 'participants') {
      form.appendChild(buildParticipantPicker(record.participants || []));
      return;
    }
    form.appendChild(buildField(key, propSchema, record[key], required.has(key)));
  });

  const actions = document.createElement('div');
  actions.className = 'field';
  actions.innerHTML = '<button type="submit">Save</button> <button type="button" id="cancel-button">Cancel</button>';
  form.appendChild(actions);
  form.querySelector('#cancel-button').addEventListener('click', hideForm);
}

function openForm(key) {
  state.editingKey = key;
  document.getElementById('form-title').textContent = key === null ? `New ${state.currentType.name}` : `Edit ${state.currentType.name}`;
  hideFormError();
  renderForm(key === null ? {} : findRecordByKey(key));
  document.getElementById('form-panel').hidden = false;
}

function hideForm() {
  document.getElementById('form-panel').hidden = true;
  state.editingKey = null;
}

function collectFormData() {
  const form = document.getElementById('record-form');
  const properties = state.schema.items.properties;
  const data = {};
  Object.keys(properties).forEach((key) => {
    if (state.currentType.name === 'projects' && key === 'participants') {
      data.participants = form.querySelector('[data-field="participants"]').getParticipantIds();
      return;
    }
    const propSchema = properties[key];
    if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
      const container = form.querySelector(`[data-field="${key}"]`);
      data[key] = [...container.querySelectorAll('input')].map((i) => i.value).filter((v) => v.trim() !== '');
      return;
    }
    const input = form.querySelector(`#field-${key}`);
    if (input.value !== '') data[key] = input.value;
  });
  return data;
}

async function deleteRecordByKey(key) {
  const name = state.currentType.name;
  if (!confirm(`Delete this ${name} record?`)) return;
  try {
    await fetchJSON(`/api/data/${name}/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 409 && name === 'members') {
      const titles = err.body.affectedProjects.map((p) => p.title).join(', ');
      if (!confirm(`This member is a participant in: ${titles}. Delete anyway and remove them from these projects?`)) return;
      await fetchJSON(`/api/data/${name}/${encodeURIComponent(key)}?confirm=true`, { method: 'DELETE' });
    } else {
      alert(err.message);
      return;
    }
  }
  await selectType(name);
}

document.getElementById('records-table').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const key = button.dataset.key;
  if (button.dataset.action === 'edit') openForm(key);
  if (button.dataset.action === 'delete') deleteRecordByKey(key);
});

document.getElementById('new-button').addEventListener('click', () => openForm(null));

document.getElementById('record-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = collectFormData();
  const name = state.currentType.name;
  try {
    if (state.editingKey === null) {
      await fetchJSON(`/api/data/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetchJSON(`/api/data/${name}/${encodeURIComponent(state.editingKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    await selectType(name);
  } catch (err) {
    showFormError(err.message, err.details);
  }
});

loadTypes().then(() => {
  if (state.types.length) selectType(state.types[0].name);
});
```

- [ ] **Step 4: Syntax-check the new files**

Run: `node --check scripts/editor/app.js`
Expected: no output (exit code 0)

- [ ] **Step 5: Commit**

```bash
git add scripts/editor/index.html scripts/editor/style.css scripts/editor/app.js
git commit -m "Add editor frontend: schema-driven forms and a members participant picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `edit-server.mjs` and integration tests

**Files:**
- Create: `scripts/edit-server.mjs`
- Test: `tests/edit-server.test.js`
- Modify: `package.json` (add `ajv` devDependency)

- [ ] **Step 1: Add the `ajv` dependency**

Run: `npm install --save-dev ajv`
Expected: `package.json` gains `"ajv": "^8.x.x"` under `devDependencies`, `package-lock.json` is updated.

- [ ] **Step 2: Write the failing integration tests**

Create `tests/edit-server.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../scripts/edit-server.mjs';

async function startTestServer(fixture) {
  const contentPath = await mkdtemp(path.join(tmpdir(), 'edit-content-'));
  await mkdir(path.join(contentPath, 'data'), { recursive: true });
  await writeFile(path.join(contentPath, 'data', 'members.json'), JSON.stringify(fixture.members ?? []));
  await writeFile(path.join(contentPath, 'data', 'projects.json'), JSON.stringify(fixture.projects ?? []));
  await writeFile(path.join(contentPath, 'data', 'events.json'), JSON.stringify(fixture.events ?? []));
  await writeFile(path.join(contentPath, 'data', 'news.json'), JSON.stringify(fixture.news ?? []));

  const server = createServer({ contentPath, schemaDir: 'schema', editorDir: 'scripts/editor' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    contentPath,
    async close() {
      server.close();
      await rm(contentPath, { recursive: true, force: true });
    },
  };
}

test('GET /api/types lists the four array-of-items content types', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/api/types`);
    const body = await res.json();
    assert.deepEqual(body.map((t) => t.name).sort(), ['events', 'members', 'news', 'projects']);
  } finally {
    await ctx.close();
  }
});

test('GET /api/data/members returns the current member list', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].id, 'adler-ada');
  } finally {
    await ctx.close();
  }
});

test('POST /api/data/members auto-generates an id from firstname/lastname when none is given', async () => {
  const ctx = await startTestServer({ members: [] });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.id, 'adler-ada');
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    assert.equal(saved[0].id, 'adler-ada');
  } finally {
    await ctx.close();
  }
});

test('POST /api/data/members rejects a record that fails schema validation', async () => {
  const ctx = await startTestServer({ members: [] });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstname: 'Ada' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(Array.isArray(body.details) && body.details.length > 0);
  } finally {
    await ctx.close();
  }
});

test('PUT /api/data/projects/:id updates a project by id', async () => {
  const ctx = await startTestServer({
    projects: [{ id: 'p1', title: 'Old Title', participants: [] }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/projects/p1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'p1', title: 'New Title', participants: [] }),
    });
    assert.equal(res.status, 200);
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'projects.json'), 'utf8'));
    assert.equal(saved[0].title, 'New Title');
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/data/events/:index deletes an event by array position', async () => {
  const ctx = await startTestServer({
    events: [{ date: '2026-01-01', title: 'One' }, { date: '2026-02-01', title: 'Two' }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/events/0`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'events.json'), 'utf8'));
    assert.deepEqual(saved, [{ date: '2026-02-01', title: 'Two' }]);
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/data/members/:id on a referenced member returns 409 with affected projects and writes nothing', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
    projects: [{ id: 'p1', title: 'One', participants: ['adler-ada'] }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members/adler-ada`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.deepEqual(body.affectedProjects, [{ id: 'p1', title: 'One' }]);
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    assert.equal(saved.length, 1);
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/data/members/:id?confirm=true cascades: removes the member and strips them from participants', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
    projects: [{ id: 'p1', title: 'One', participants: ['adler-ada'] }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members/adler-ada?confirm=true`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const members = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    const projects = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'projects.json'), 'utf8'));
    assert.deepEqual(members, []);
    assert.deepEqual(projects[0].participants, []);
  } finally {
    await ctx.close();
  }
});

test('GET / serves the editor HTML page', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/edit-server.test.js`
Expected: FAIL — `Cannot find module '../scripts/edit-server.mjs'`

- [ ] **Step 4: Implement `edit-server.mjs`**

Create `scripts/edit-server.mjs`:

```javascript
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { readContentFile, writeContentFile } from './lib/content-store.mjs';
import { getEditableTypes } from './lib/editable-types.mjs';
import { findRecordIndex, replaceRecord, deleteRecord } from './lib/record-store.mjs';
import { cascadeDeleteMember, findProjectsReferencingMember } from './lib/member-cascade.mjs';
import { computeMemberId } from '../assets/js/shared.js';

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html' },
  '/index.html': { file: 'index.html', type: 'text/html' },
  '/app.js': { file: 'app.js', type: 'text/javascript' },
  '/style.css': { file: 'style.css', type: 'text/css' },
};

export function createServer({ contentPath, schemaDir, editorDir }) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const types = getEditableTypes(schemaDir);
  const typeByName = new Map(types.map((t) => [t.name, t]));
  const validators = new Map(types.map((t) => [t.name, ajv.compile(t.schema)]));

  function sendJSON(res, statusCode, body) {
    const text = body === null ? '' : JSON.stringify(body);
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  }

  function sendError(res, statusCode, message, details) {
    sendJSON(res, statusCode, details ? { error: message, details } : { error: message });
  }

  async function readJSONBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }

  async function loadRecords(name) {
    return JSON.parse(await readContentFile(contentPath, `data/${name}.json`));
  }

  function validateOrThrow(name, records) {
    const validate = validators.get(name);
    if (!validate(records)) {
      const error = new Error(`${name} failed schema validation`);
      error.statusCode = 400;
      error.details = validate.errors;
      throw error;
    }
  }

  async function saveRecords(name, records) {
    validateOrThrow(name, records);
    await writeContentFile(contentPath, `data/${name}.json`, JSON.stringify(records, null, 2) + '\n');
  }

  function uniqueMemberId(existingMembers, firstname, lastname) {
    const usedIds = new Set(existingMembers.map((m) => m.id));
    const base = computeMemberId(firstname, lastname);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  async function handleDeleteMember(res, url, memberId) {
    const confirmed = url.searchParams.get('confirm') === 'true';
    const members = await loadRecords('members');
    const projects = await loadRecords('projects');
    if (findRecordIndex(members, 'id', memberId) === -1) {
      return sendError(res, 404, `No members record for key "${memberId}"`);
    }
    const affected = findProjectsReferencingMember(projects, memberId);
    if (affected.length > 0 && !confirmed) {
      return sendJSON(res, 409, { affectedProjects: affected.map((p) => ({ id: p.id, title: p.title })) });
    }
    const { members: updatedMembers, projects: updatedProjects } = cascadeDeleteMember(members, projects, memberId);
    try {
      validateOrThrow('members', updatedMembers);
      validateOrThrow('projects', updatedProjects);
    } catch (err) {
      return sendError(res, err.statusCode || 500, err.message, err.details);
    }
    await writeContentFile(contentPath, 'data/members.json', JSON.stringify(updatedMembers, null, 2) + '\n');
    await writeContentFile(contentPath, 'data/projects.json', JSON.stringify(updatedProjects, null, 2) + '\n');
    return sendJSON(res, 204, null);
  }

  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    if (parts.length === 2 && parts[1] === 'types' && req.method === 'GET') {
      return sendJSON(res, 200, types.map((t) => ({ name: t.name, keyField: t.keyField })));
    }

    if (parts.length === 3 && parts[1] === 'schema' && req.method === 'GET') {
      const type = typeByName.get(parts[2]);
      if (!type) return sendError(res, 404, `Unknown type "${parts[2]}"`);
      return sendJSON(res, 200, type.schema);
    }

    if (parts[1] === 'data' && parts.length >= 3) {
      const name = parts[2];
      const type = typeByName.get(name);
      if (!type) return sendError(res, 404, `Unknown type "${name}"`);
      const key = parts.length === 4 ? decodeURIComponent(parts[3]) : null;

      if (req.method === 'GET' && parts.length === 3) {
        return sendJSON(res, 200, await loadRecords(name));
      }

      if (req.method === 'POST' && parts.length === 3) {
        const body = await readJSONBody(req);
        const records = await loadRecords(name);
        const record = { ...body };
        if (name === 'members' && !record.id) {
          record.id = uniqueMemberId(records, record.firstname, record.lastname);
        }
        try {
          await saveRecords(name, [...records, record]);
        } catch (err) {
          return sendError(res, err.statusCode || 500, err.message, err.details);
        }
        return sendJSON(res, 201, record);
      }

      if (req.method === 'PUT' && parts.length === 4) {
        const body = await readJSONBody(req);
        const records = await loadRecords(name);
        const updated = replaceRecord(records, type.keyField, key, body);
        if (!updated) return sendError(res, 404, `No ${name} record for key "${key}"`);
        try {
          await saveRecords(name, updated);
        } catch (err) {
          return sendError(res, err.statusCode || 500, err.message, err.details);
        }
        return sendJSON(res, 200, body);
      }

      if (req.method === 'DELETE' && parts.length === 4) {
        if (name === 'members') return handleDeleteMember(res, url, key);
        const records = await loadRecords(name);
        const updated = deleteRecord(records, type.keyField, key);
        if (!updated) return sendError(res, 404, `No ${name} record for key "${key}"`);
        try {
          await saveRecords(name, updated);
        } catch (err) {
          return sendError(res, err.statusCode || 500, err.message, err.details);
        }
        return sendJSON(res, 204, null);
      }
    }

    return sendError(res, 404, 'Not found');
  }

  function serveStatic(res, pathname) {
    const entry = STATIC_FILES[pathname];
    if (!entry) return sendError(res, 404, 'Not found');
    const body = readFileSync(path.join(editorDir, entry.file));
    res.writeHead(200, { 'Content-Type': entry.type });
    res.end(body);
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((err) => sendError(res, 500, err.message));
    } else {
      serveStatic(res, url.pathname);
    }
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer({
    contentPath: process.env.CONTENT_PATH || './content',
    schemaDir: path.join(__dirname, '..', 'schema'),
    editorDir: path.join(__dirname, 'editor'),
  });
  const port = Number(process.env.EDIT_PORT) || 4848;
  server.listen(port, '127.0.0.1', () => {
    console.log(`Data editor running at http://127.0.0.1:${port}`);
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/edit-server.test.js`
Expected: PASS (9 tests)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/edit-server.mjs tests/edit-server.test.js package.json package-lock.json
git commit -m "Add edit-server: schema-validated CRUD API and static editor host

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: npm script and README

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the `edit` npm script**

In `package.json`, add to `"scripts"` (after `"build:watch"`, matching the existing style):

```json
    "edit": "node --env-file-if-exists=.env scripts/edit-server.mjs",
```

- [ ] **Step 2: Document it in the README**

In `README.md`, add a new section after "## Running checks" and before "## Content shape":

```markdown
## Local data editor

    npm run edit

Starts a local-only admin UI at `http://127.0.0.1:4848` (override the port
with `EDIT_PORT`) for editing `members.json`, `projects.json`,
`events.json`, and `news.json` — schema-driven forms with create/edit/delete,
plus a search-and-add picker for a project's participants. It reads and
writes the same `CONTENT_PATH` the build uses (local directory or a WebDAV
store — see "Storing content outside the repo" below), writing each change
immediately, so point it at a copy of your content if you want to try it out
without touching real data. It has no authentication of its own — it's meant
to run on your own machine, not be exposed beyond `127.0.0.1`.
```

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "Add npm run edit script and document the local data editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Manual verification

No commit — this task is a verification pass over what's already committed, using a disposable copy of the content so nothing real gets touched.

- [ ] **Step 1: Set up a disposable content copy**

Run:
```bash
mkdir -p .local
cp -r content .local/content
```

(`.local/` is already gitignored — see `.gitignore`.)

- [ ] **Step 2: Start the editor against the copy**

Run: `CONTENT_PATH=.local/content npm run edit`
Expected: prints `Data editor running at http://127.0.0.1:4848`

- [ ] **Step 3: Exercise the UI in a browser**

Open `http://127.0.0.1:4848` and confirm:
- The sidebar lists `events`, `members`, `news`, `projects` (not `site` or `publications`).
- Selecting `members` shows a table of the demo members; **New** opens a blank form; leaving `id` blank and filling in `firstname`/`lastname`/`affiliation`/`email` and saving creates a member with an auto-generated id.
- Editing that member and saving updates the table.
- Selecting `projects`, opening a project, and using the participant search box adds/removes a participant by name (not by typing an id).
- Deleting a member who is a participant somewhere prompts with the affected project title(s) before proceeding; confirming removes the member and updates that project's participant list (check by reopening the project).
- Deleting an event or news item (no `id` field) works and the table updates.
- Submitting a form with a required field left blank fails validation (the browser blocks it natively, or the server returns a 400 shown inline if you bypass that).

- [ ] **Step 4: Confirm the written content is still valid**

Stop the server (Ctrl-C), then run: `CONTENT_PATH=.local/content npm run validate`
Expected: PASS for all schemas — confirms everything the editor wrote during Step 3 still satisfies the same schemas the build enforces.

- [ ] **Step 5: Clean up**

Run: `rm -rf .local/content`

- [ ] **Step 6 (optional, requires a real WebDAV store): confirm remote read/write**

If you have access to a WebDAV content store (see README "Setting up a WebDAV content store"), run `CONTENT_PATH=<webdav-url> CONTENT_USERNAME=... CONTENT_PASSWORD=... npm run edit` against a **test** folder (not production content) and repeat Step 3's checks, confirming the same behavior works over HTTP(S) PUT, not just the local filesystem.

---

## Self-review notes

- **Spec coverage:** type/key derivation from schema shape (Task 1), id/index addressing (Task 2), member cascade-delete (Task 3), schema-driven form generation and participant picker (Task 4), the full API + Ajv validation-on-every-write + `createServer` factory (Task 5), `npm run edit` + docs (Task 6), end-to-end manual check including a real WebDAV target (Task 7) — every section of `docs/superpowers/specs/2026-09-29-local-data-editor-design.md` has a corresponding task.
- **No placeholders:** every step has complete, runnable code.
- **Type/name consistency:** `keyField` (`'id' | null`) from `editable-types.mjs` (Task 1) is the exact value passed as `keyField` into `record-store.mjs`'s functions (Task 2) and read as `type.keyField` in `edit-server.mjs` (Task 5). `createServer({ contentPath, schemaDir, editorDir })`'s parameter names match between its CLI-entry call and the test harness's call. `computeMemberId(firstname, lastname)` is called with the same argument order as in the member-ids plan.
- **Dependency on the member-ids plan:** Task 1's fourth test and the whole `keyField: 'id'` mechanism assume `schema/members.schema.json` already has an `id` property — call this out to whoever executes the plan if the two plans are being run out of order.
