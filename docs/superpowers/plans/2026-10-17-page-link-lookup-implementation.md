# Page Link Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While editing `events.url`, `news.url`, or `projects.url` in the admin content editor, typing a value that doesn't start with `http` shows a dropdown of matching pages (by title or filename); selecting one fills in that page's bare filename. The three fields store a bare filename or a full URL — never the `pages.html?doc=...` link form — and rendering applies that prefix only when building the actual `<a href>`.

**Architecture:** A new `resolvePageLink()` helper in `assets/js/shared.js` (mirroring the existing `resolvePortraitUrl`) turns a stored value back into a real link at render time, used by `events.js`/`news.js`/`projects-graph.js`. A new `x-editor.widget: "page-link"` schema hint drives a new branch in `assets/js/record-form.js`'s `buildField()` that attaches an autocomplete dropdown to the existing text input. The admin editor (`scripts/editor/app.js`) fetches `/api/pages` fresh whenever it opens a form for events/news/projects and threads it through, the same way it already does for `members` on projects.

**Tech Stack:** Vanilla JS (ES modules, no bundler), existing JSON Schema + ajv validation, `node --test` + jsdom (existing test conventions).

**Builds on:** `docs/superpowers/specs/2026-10-16-page-link-lookup-design.md`, and the already-merged `docs/superpowers/specs/2026-10-16-page-editor-design.md` (`/api/pages`).

---

## Task 1: Schema changes and demo data fix

**Files:**
- Modify: `schema/events.schema.json`
- Modify: `schema/news.schema.json`
- Modify: `schema/projects.schema.json`
- Modify: `content/data/events.json`

- [ ] **Step 1: Update `schema/events.schema.json`**

Current line 13:
```json
      "url": { "title": "Link (URL or page name)", "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[^\\s\"'<>:/\\\\][^\\s\"'<>:\\\\]*)$" }
```

Replace with:
```json
      "url": { "title": "Link (URL or page name)", "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[A-Za-z0-9_-]+\\.(md|html))$", "x-editor": { "widget": "page-link" } }
```

- [ ] **Step 2: Update `schema/news.schema.json`**

Current line 13:
```json
      "url": { "title": "Link (URL or page name)", "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[^\\s\"'<>:/\\\\][^\\s\"'<>:\\\\]*)$" }
```

Replace with:
```json
      "url": { "title": "Link (URL or page name)", "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[A-Za-z0-9_-]+\\.(md|html))$", "x-editor": { "widget": "page-link" } }
```

- [ ] **Step 3: Update `schema/projects.schema.json`**

Current line 15:
```json
      "url": { "title": "Project web page (URL)", "type": "string", "pattern": "^https?://[^\\s\"'<>]+$" },
```

Replace with:
```json
      "url": { "title": "Project web page (URL)", "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[A-Za-z0-9_-]+\\.(md|html))$", "x-editor": { "widget": "page-link" } },
```

- [ ] **Step 4: Fix the one demo record stored in the old `pages.html?doc=` format**

In `content/data/events.json`, current line 5:
```json
  { "date": "2025-07-02", "title": "Second network meeting (online)", "url": "pages.html?doc=example.html" },
```

Replace with:
```json
  { "date": "2025-07-02", "title": "Second network meeting (online)", "url": "example.html" },
```

- [ ] **Step 5: Verify the schema and data are still consistent**

Run: `npm run validate`
Expected: PASS (exit code 0, no ajv errors). This is the only check that exercises these JSON Schema files directly — there's no dedicated unit test for schema patterns in this repo.

- [ ] **Step 6: Commit**

```bash
git add schema/events.schema.json schema/news.schema.json schema/projects.schema.json content/data/events.json
git commit -m "feat: store page links as a bare filename, not pages.html?doc=..."
```

(Append `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` as a trailing line in the commit message.)

---

## Task 2: `resolvePageLink()` in `assets/js/shared.js`

**Files:**
- Modify: `assets/js/shared.js`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/shared.test.js`, add `resolvePageLink` to the existing import line (currently):
```js
import { escapeHTML, getInitials, hashColor, navHTML, isExternalLink, resolvePortraitUrl, computeMemberId, textMatchesQuery, skipLinkHTML, isValidDocFilename, getDocType, titleFromFilename, parseViewHash } from '../assets/js/shared.js';
```
becomes:
```js
import { escapeHTML, getInitials, hashColor, navHTML, isExternalLink, resolvePortraitUrl, resolvePageLink, computeMemberId, textMatchesQuery, skipLinkHTML, isValidDocFilename, getDocType, titleFromFilename, parseViewHash } from '../assets/js/shared.js';
```

Append these tests at the end of the file (after the existing `parseViewHash` tests):

```js
test('resolvePageLink keeps http(s) URLs unchanged', () => {
  assert.equal(resolvePageLink('https://example.org/a'), 'https://example.org/a');
  assert.equal(resolvePageLink('http://example.org/a'), 'http://example.org/a');
});

test('resolvePageLink prefixes a bare page filename with pages.html?doc=', () => {
  assert.equal(resolvePageLink('about.md'), 'pages.html?doc=about.md');
  assert.equal(resolvePageLink('example.html'), 'pages.html?doc=example.html');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/shared.test.js`
Expected: FAIL — `resolvePageLink` is not an exported function (`TypeError`).

- [ ] **Step 3: Implement**

In `assets/js/shared.js`, add this right after the existing `resolvePortraitUrl` function (after line 31, before `export function slugify`):

```js
// A url that is not an http(s) URL names a file in content/pages/; the
// built site serves every page through pages.html with the filename as a
// query parameter, so that's the link form a bare filename resolves to.
export function resolvePageLink(url) {
  return isExternalLink(url) ? url : `pages.html?doc=${url}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/shared.test.js`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add assets/js/shared.js tests/shared.test.js
git commit -m "feat: add resolvePageLink to turn a stored page filename into a real link"
```

(Append `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` as a trailing line.)

---

## Task 3: Use `resolvePageLink` in events and news rendering

**Files:**
- Modify: `assets/js/events.js`
- Modify: `assets/js/news.js`
- Test: `tests/events.test.js`
- Test: `tests/news.test.js`

- [ ] **Step 1: Update the fixtures and write the new assertions (will fail until Step 3)**

In `tests/events.test.js`, the test `renderEventItem adds target=_blank only for external links` currently reads:

```js
test('renderEventItem adds target=_blank only for external links', () => {
  const external = renderEventItem(events[1], '2026-09-22');
  const internal = renderEventItem(
    { date: '2025-07-02', title: 'Online meeting', url: 'pages.html?doc=notes.md' },
    '2026-09-22'
  );
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
});
```

Replace it with (the fixture's `url` is now the bare filename the new convention expects, and a new assertion checks the rendered `href` gets the `pages.html?doc=` prefix back):

```js
test('renderEventItem adds target=_blank only for external links', () => {
  const external = renderEventItem(events[1], '2026-09-22');
  const internal = renderEventItem(
    { date: '2025-07-02', title: 'Online meeting', url: 'notes.md' },
    '2026-09-22'
  );
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
  assert.match(internal, /href="pages\.html\?doc=notes\.md"/);
});
```

In `tests/news.test.js`, the `items` fixture currently reads:

```js
const items = [
  { date: '2024-09-04', title: 'Old news', url: 'https://example.org' },
  { date: '2026-11-10', title: 'New news', url: 'pages.html?doc=about.md' },
  { date: '2023-01-15', title: 'Oldest news', url: 'https://example.org/a' },
];
```

Replace the middle line (the bare filename the new convention expects):

```js
const items = [
  { date: '2024-09-04', title: 'Old news', url: 'https://example.org' },
  { date: '2026-11-10', title: 'New news', url: 'about.md' },
  { date: '2023-01-15', title: 'Oldest news', url: 'https://example.org/a' },
];
```

And the test `renderNewsItem adds target=_blank only for external links` currently reads:

```js
test('renderNewsItem adds target=_blank only for external links', () => {
  const external = renderNewsItem(items[0]);
  const internal = renderNewsItem(items[1]);
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
});
```

Replace it with (adds the same `href` assertion):

```js
test('renderNewsItem adds target=_blank only for external links', () => {
  const external = renderNewsItem(items[0]);
  const internal = renderNewsItem(items[1]);
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
  assert.match(internal, /href="pages\.html\?doc=about\.md"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/events.test.js tests/news.test.js`
Expected: FAIL — the new `href="pages.html?doc=..."` assertions don't match today's output, which still uses the raw (now bare-filename) value directly as the href with no prefix.

- [ ] **Step 3: Implement**

In `assets/js/events.js`, change the import line:
```js
import { escapeHTML, isExternalLink } from './shared.js';
```
to:
```js
import { escapeHTML, isExternalLink, resolvePageLink } from './shared.js';
```

And in `renderEventItem`, change:
```js
    titleHTML = `<a href="${escapeHTML(event.url)}"${attrs}>${escapeHTML(event.title)}</a>`;
```
to:
```js
    titleHTML = `<a href="${escapeHTML(resolvePageLink(event.url))}"${attrs}>${escapeHTML(event.title)}</a>`;
```

In `assets/js/news.js`, change the import line:
```js
import { escapeHTML, isExternalLink } from './shared.js';
```
to:
```js
import { escapeHTML, isExternalLink, resolvePageLink } from './shared.js';
```

And in `renderNewsItem`, change:
```js
  return `<li class="news-item"><span class="news-date">${escapeHTML(item.date)}</span><a href="${escapeHTML(item.url)}"${attrs}>${escapeHTML(item.title)}</a></li>`;
```
to:
```js
  return `<li class="news-item"><span class="news-date">${escapeHTML(item.date)}</span><a href="${escapeHTML(resolvePageLink(item.url))}"${attrs}>${escapeHTML(item.title)}</a></li>`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/events.test.js tests/news.test.js`
Expected: PASS, all tests in both files including the pre-existing ones.

- [ ] **Step 5: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/js/events.js assets/js/news.js tests/events.test.js tests/news.test.js
git commit -m "feat: resolve event/news page links through resolvePageLink"
```

(Append `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` as a trailing line.)

---

## Task 4: Use `resolvePageLink` in project rendering

**Files:**
- Modify: `assets/js/projects-graph.js`
- Test: `tests/projects-graph.test.js`

**Context for the engineer:** `projects-graph.js` renders a project's `url` in two places: the list-view teaser link (`renderListView`, one `<a>` built as a template string) and the modal detail view's link (`openModal`, a `<a id="modal-link">` element whose `href`/`target`/`rel` are set directly in JS — the element's `target="_blank" rel="noopener"` is currently *static HTML* baked into `scripts/build.mjs`'s template, which this task overrides dynamically for internal links). Today `project.url` is always a full external URL, so unconditionally opening it in a new tab is correct; now that it can be an internal page, that needs to become conditional, the same way `events.js`/`news.js` already do it.

- [ ] **Step 1: Write the failing tests**

Append these tests to `tests/projects-graph.test.js` (after the existing `renderListView` tests, e.g. after the "renderListView tags each project with its participant slugs" test):

```js
test('renderListView links to an external project URL with target=_blank', () => {
  const container = {};
  renderListView([{ ...projects[0], url: 'https://example.org/project' }], members, container);
  assert.match(container.innerHTML, /<a href="https:\/\/example\.org\/project" target="_blank" rel="noopener">Visit project/);
});

test('renderListView links to an internal page filename without target=_blank', () => {
  const container = {};
  renderListView([{ ...projects[0], url: 'about.md' }], members, container);
  assert.match(container.innerHTML, /<a href="pages\.html\?doc=about\.md">Visit project/);
  assert.doesNotMatch(container.innerHTML, /target="_blank"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/projects-graph.test.js`
Expected: FAIL — today's `renderListView` always includes `target="_blank" rel="noopener"` unconditionally and never resolves `p.url` through any prefix, so neither new assertion matches.

- [ ] **Step 3: Implement**

Read the current import line at the top of `assets/js/projects-graph.js` (it currently imports `escapeHTML, getInitials, hashColor, parseViewHash, resolvePortraitUrl` from `./shared.js`) and add `resolvePageLink, isExternalLink` to it:

```js
import { escapeHTML, getInitials, hashColor, parseViewHash, resolvePortraitUrl, resolvePageLink, isExternalLink } from './shared.js';
```

In `renderListView` (around line 79-96), change:
```js
            ${p.url ? `<a href="${escapeHTML(p.url)}" target="_blank" rel="noopener">Visit project &#8599;</a>` : ''}
```
to:
```js
            ${p.url ? `<a href="${escapeHTML(resolvePageLink(p.url))}"${isExternalLink(p.url) ? ' target="_blank" rel="noopener"' : ''}>Visit project &#8599;</a>` : ''}
```

In the modal-opening code (around line 164-170), change:
```js
  const link = document.getElementById('modal-link');
  if (project.url) {
    link.href = project.url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
```
to:
```js
  const link = document.getElementById('modal-link');
  if (project.url) {
    link.href = resolvePageLink(project.url);
    if (isExternalLink(project.url)) {
      link.target = '_blank';
      link.rel = 'noopener';
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
    link.hidden = false;
  } else {
    link.hidden = true;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/projects-graph.test.js`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/js/projects-graph.js tests/projects-graph.test.js
git commit -m "feat: resolve project page links through resolvePageLink"
```

(Append `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` as a trailing line.)

---

## Task 5: The `page-link` widget in `record-form.js`

**Files:**
- Modify: `assets/js/record-form.js`
- Modify: `scripts/editor/style.css`
- Test: `tests/record-form.test.js`

**Context for the engineer:** `record-form.js` is shared between the admin editor and the public self-service edit form (`assets/js/edit-page.js`). The widget you're adding here must work correctly when no `pages` array is supplied at all (the public form's case) — in that case it should behave exactly like a plain text input, never showing a dropdown. `record-form.js` currently has no imports at all; this task adds its first one (`isExternalLink` from `./shared.js`, which itself has no import-time side effects, so this doesn't violate the file's existing "must not touch `document` at import time" constraint — it's only evaluated inside function bodies at call time, same as everything else already using `document` in this file).

- [ ] **Step 1: Write the failing tests**

In `tests/record-form.test.js`, append these three tests at the end of the file:

```js
test('a page-link field shows matching pages as the user types, and selecting one fills in the filename', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    properties: {
      url: { type: 'string', title: 'Link', 'x-editor': { widget: 'page-link' } },
    },
  };
  const pages = [
    { filename: 'about.md', type: 'markdown', title: 'About the Network' },
    { filename: 'example.html', type: 'html', title: 'Example HTML Content Page' },
  ];
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'events', pages });

  const input = form.querySelector('#field-url');
  input.value = 'about';
  input.dispatchEvent(new document.defaultView.Event('input'));

  const dropdown = form.querySelector('.page-link-results');
  assert.equal(dropdown.hidden, false);
  assert.match(dropdown.textContent, /About the Network/);
  assert.doesNotMatch(dropdown.textContent, /Example HTML/);

  dropdown.querySelector('div').click();
  assert.equal(input.value, 'about.md');
  assert.equal(dropdown.hidden, true);
});

test('a page-link field never shows a dropdown for a value starting with http', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    properties: { url: { type: 'string', title: 'Link', 'x-editor': { widget: 'page-link' } } },
  };
  const pages = [{ filename: 'http-page.md', type: 'markdown', title: 'http-page' }];
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'events', pages });

  const input = form.querySelector('#field-url');
  input.value = 'http://example.org';
  input.dispatchEvent(new document.defaultView.Event('input'));

  assert.equal(form.querySelector('.page-link-results').hidden, true);
});

test('a page-link field with no pages supplied behaves like a plain input (the public edit form\'s case)', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    properties: { url: { type: 'string', title: 'Link', 'x-editor': { widget: 'page-link' } } },
  };
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'events' });

  const input = form.querySelector('#field-url');
  input.value = 'anything';
  input.dispatchEvent(new document.defaultView.Event('input'));

  assert.equal(form.querySelector('.page-link-results').hidden, true);
  assert.equal(input.value, 'anything');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/record-form.test.js`
Expected: FAIL — `hints.widget === 'page-link'` isn't handled yet, so `form.querySelector('.page-link-results')` is `null` and the tests throw trying to read `.hidden` off it.

- [ ] **Step 3: Implement**

Replace the full contents of `assets/js/record-form.js` with:

```js
// Form building shared by the editor and the public site. Must not touch `document` at import time.

import { isExternalLink } from './shared.js';

// Presentation hints live in the schema under "x-editor": on the array schema
// (sort, columns) and on individual properties (widget, rows, readOnly, placeholder).
export function editorHints(schema) {
  return schema?.['x-editor'] || {};
}

export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function memberName(member) {
  return `${member.lastname}, ${member.firstname}`;
}

export function buildStringListField(key, values) {
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

export function buildParticipantPicker(participantIds, members, title = 'participants') {
  const container = document.createElement('div');
  container.className = 'field participant-picker';
  container.dataset.field = 'participants';

  const label = document.createElement('label');
  label.textContent = title;
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

  function renderList() {
    list.innerHTML = '';
    currentIds.forEach((id) => {
      const member = members.find((m) => m.id === id);
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
    members
      .filter((m) => !currentIds.includes(m.id) && `${m.firstname} ${memberName(m)}`.toLowerCase().includes(q))
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

// Shows page titles matching what's typed into `input`, while its value
// doesn't look like an external URL; clicking a match fills in that page's
// filename. If `pages` is empty (the public edit form never supplies one),
// nothing ever matches, so this is indistinguishable from a plain input —
// no separate "no pages available" code path is needed.
function buildPageLinkDropdown(input, pages) {
  const dropdown = document.createElement('div');
  dropdown.className = 'page-link-results';
  dropdown.hidden = true;

  function hide() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }

  function showMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q || isExternalLink(query)) return hide();
    const matches = pages.filter((p) => {
      const stem = p.filename.replace(/\.(md|html)$/, '');
      return p.title.toLowerCase().includes(q) || stem.toLowerCase().includes(q);
    });
    if (!matches.length) return hide();
    dropdown.innerHTML = '';
    matches.forEach((p) => {
      const row = document.createElement('div');
      const titleSpan = document.createElement('span');
      titleSpan.textContent = p.title;
      const filenameSpan = document.createElement('span');
      filenameSpan.className = 'page-link-filename';
      filenameSpan.textContent = p.filename;
      row.append(titleSpan, filenameSpan);
      row.addEventListener('click', () => {
        input.value = p.filename;
        hide();
      });
      dropdown.appendChild(row);
    });
    dropdown.hidden = false;
  }

  input.addEventListener('input', () => showMatches(input.value));
  return dropdown;
}

export function buildField(key, propSchema, value, required, pages = []) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const hints = editorHints(propSchema);
  const readOnly = Boolean(hints.readOnly);
  const label = document.createElement('label');
  label.textContent = (propSchema.title || key) + (required && !readOnly ? ' *' : '');
  label.setAttribute('for', `field-${key}`);
  wrapper.appendChild(label);
  if (propSchema.description) {
    const help = document.createElement('div');
    help.className = 'field-help';
    help.textContent = propSchema.description;
    wrapper.appendChild(help);
  }

  if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
    wrapper.appendChild(buildStringListField(key, value || []));
    return wrapper;
  }

  if (Array.isArray(propSchema.enum)) {
    const select = document.createElement('select');
    select.id = `field-${key}`;
    select.name = key;
    const selected = value ?? propSchema.default ?? propSchema.enum[0];
    for (const option of propSchema.enum) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (option === selected) opt.selected = true;
      select.appendChild(opt);
    }
    if (required && !readOnly) select.required = true;
    if (readOnly) select.disabled = true;
    wrapper.appendChild(select);
    return wrapper;
  }

  const input = hints.widget === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (input.tagName === 'INPUT') input.type = hints.widget === 'date' ? 'date' : 'text';
  if (hints.rows) input.rows = hints.rows;
  input.id = `field-${key}`;
  input.name = key;
  input.value = value ?? (hints.widget === 'date' ? todayISO() : '');
  // type=date ignores pattern and always yields YYYY-MM-DD, so only text inputs get it.
  if (propSchema.pattern && input.type === 'text') input.pattern = propSchema.pattern;
  if (required && !readOnly) input.required = true;
  if (readOnly) input.readOnly = true;
  if (hints.placeholder) input.placeholder = hints.placeholder;
  if (hints.widget === 'page-link') {
    const positioner = document.createElement('div');
    positioner.className = 'page-link-field';
    positioner.appendChild(input);
    positioner.appendChild(buildPageLinkDropdown(input, pages));
    wrapper.appendChild(positioner);
  } else {
    wrapper.appendChild(input);
  }
  return wrapper;
}

export function renderRecordFields(form, { itemSchema, record, typeName, members = [], pages = [], skipReadOnly = false }) {
  const required = new Set(itemSchema.required || []);
  Object.entries(itemSchema.properties).forEach(([key, propSchema]) => {
    if (skipReadOnly && editorHints(propSchema).readOnly) return;
    if (typeName === 'projects' && key === 'participants') {
      form.appendChild(buildParticipantPicker(record.participants || [], members, propSchema.title));
      return;
    }
    form.appendChild(buildField(key, propSchema, record[key], required.has(key), pages));
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/record-form.test.js`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Add dropdown styling**

Append to `scripts/editor/style.css`:

```css
.page-link-field { position: relative; }
.page-link-results { position: absolute; top: 100%; left: 0; right: 0; z-index: 10; background: #fff; border: 1px solid #ddd; max-height: 150px; overflow-y: auto; }
.page-link-results div { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.2rem 0.4rem; cursor: pointer; }
.page-link-results div:hover { background: #f4f4f4; }
.page-link-filename { color: #777; font-size: 0.85rem; white-space: nowrap; }
```

- [ ] **Step 6: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/js/record-form.js scripts/editor/style.css tests/record-form.test.js
git commit -m "feat: add the page-link autocomplete widget to record-form.js"
```

(Append `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` as a trailing line.)

---

## Task 6: Wire the pages index into the admin editor

**Files:**
- Modify: `scripts/editor/app.js`

- [ ] **Step 1: Add `pages` to the editor's state**

At the top of `scripts/editor/app.js`, the `state` object currently reads:

```js
const state = {
  types: [],
  currentType: null,
  schema: null,
  records: [],
  members: [],
  editingKey: null,
  inboxEntry: null,
  inboxSaved: false, // record already saved during this inbox review
};
```

Add a `pages` field:

```js
const state = {
  types: [],
  currentType: null,
  schema: null,
  records: [],
  members: [],
  pages: [],
  editingKey: null,
  inboxEntry: null,
  inboxSaved: false, // record already saved during this inbox review
};
```

- [ ] **Step 2: Fetch `/api/pages` fresh for events, news, and projects**

In `selectType()`, the block that currently reads:

```js
    state.schema = await fetchJSON(`/api/schema/${name}`);
    state.records = await fetchJSON(`/api/data/${name}`);
    if (name === 'projects') {
      state.members = await fetchJSON('/api/data/members');
    }
```

Add a second conditional fetch right after it:

```js
    state.schema = await fetchJSON(`/api/schema/${name}`);
    state.records = await fetchJSON(`/api/data/${name}`);
    if (name === 'projects') {
      state.members = await fetchJSON('/api/data/members');
    }
    if (name === 'events' || name === 'news' || name === 'projects') {
      state.pages = await fetchJSON('/api/pages');
    }
```

- [ ] **Step 3: Pass `pages` into `renderForm`**

Find `renderForm`'s call to `renderRecordFields` (it currently reads):

```js
  renderRecordFields(form, { itemSchema: recordSchema(), record, typeName: state.currentType.name, members: state.members });
```

Add `pages: state.pages`:

```js
  renderRecordFields(form, { itemSchema: recordSchema(), record, typeName: state.currentType.name, members: state.members, pages: state.pages });
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (`app.js` has no dedicated test file, same as before this change — this is a sanity check that nothing else regressed).

- [ ] **Step 5: Commit**

```bash
git add scripts/editor/app.js
git commit -m "feat: fetch the pages index for events/news/projects forms"
```

(Append `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` as a trailing line.)

---

## Task 7: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite and schema validation**

Run: `npm test && npm run validate`
Expected: both PASS.

- [ ] **Step 2: Run the editor locally against the repo's own `content/` folder**

Run: `CONTENT_PATH=./content EDIT_PORT=<a free port> npm run edit`
Expected: opens a browser at `http://127.0.0.1:<port>`. Manually verify:
- Open "events", edit any event's "Link (URL or page name)" field. Typing `about` shows a dropdown with "About the Network" (and `example.html`'s page if its title matches). Clicking it fills the field with `about.md`.
- Typing `https://example.org` into that same field never shows a dropdown, even if it happens to contain a substring that would otherwise match a page title.
- Save that event, then check `content/data/events.json` directly — the saved value is the bare filename (`about.md`), not `pages.html?doc=about.md`.
- Open "news", confirm the same dropdown behavior on its "Link (URL or page name)" field.
- Open "projects", confirm the same dropdown behavior on the "Project web page (URL)" field (previously URL-only).
- Build the site (`npm run build` or the editor's "Build & preview locally" button) and confirm the event/news/project you just linked to an internal page renders as a real, working link to that page (not a dead link, not a double-prefixed `pages.html?doc=pages.html?doc=...` link).

- [ ] **Step 3: Stop the editor**

Stop the `npm run edit` process (Ctrl-C). No commit for this task — it's verification only.

---

## Out of scope (see the design doc for the full list)

- A pages index for the public self-service edit form — the widget's graceful empty-`pages` fallback is the whole story there.
- `members.url`, `portrait_url`, `image_url` — not requested, semantically different.
- Keyboard navigation of the dropdown.
- Validating that a typed filename actually corresponds to an existing page at save time.
