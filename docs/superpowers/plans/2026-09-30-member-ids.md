# Member IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email-based linking between `members.json` and `projects[].participants` with a stored `id` field on each member (`{lastname-slug}-{firstname-slug}`), and add the reusable read/write content-store module and one-off migration script needed to get there.

**Architecture:** Schema gains a validated `id` field on members and switches `projects.participants` to the same id pattern. `assets/js/shared.js`'s `memberSlug()` (computed on the fly, firstname-first) becomes `computeMemberId()` (a generator used only when minting a fresh id), while rendering code in `assets/js/members.js` and `assets/js/projects-graph.js` reads the stored `member.id` directly instead of computing anything. A new `scripts/lib/content-store.mjs` gives both a one-off migration script and (later) the data editor a single place to read/write a `CONTENT_PATH` file, whether local or remote (WebDAV).

**Tech Stack:** Plain Node.js (ESM, `node:test`), no new dependencies.

---

## File structure

- **Modify** `schema/members.schema.json` — add required `id`.
- **Modify** `schema/projects.schema.json` — `participants[].items` pattern changes from email to id.
- **Create** `scripts/lib/content-store.mjs` — `readContentFile`/`writeContentFile`/`isRemoteContentPath`/`authHeaders` for a local dir or remote (WebDAV) `CONTENT_PATH`.
- **Create** `tests/content-store.test.js`.
- **Modify** `scripts/lib/resolve-content.mjs` — reuse `isRemoteContentPath`.
- **Modify** `scripts/lib/resolve-content-remote.mjs` — reuse `authHeaders`/`readContentFile`.
- **Modify** `assets/js/shared.js` — `memberSlug(member)` → `computeMemberId(firstname, lastname)`, lastname-first.
- **Modify** `assets/js/members.js` — read `member.id` instead of computing a slug.
- **Modify** `assets/js/projects-graph.js` — same, plus key lookups by id instead of email.
- **Modify** `tests/shared.test.js`, `tests/members.test.js`, `tests/projects-graph.test.js`, `tests/build.test.js` — fixtures/assertions updated to id-based data.
- **Create** `scripts/migrate-member-ids.mjs` — pure `migrateMemberIds(members, projects)` + a thin CLI wrapper.
- **Create** `tests/migrate-member-ids.test.js`.
- **Modify** `package.json` — add a `migrate-member-ids` npm script.
- **Modify** `content/data/members.json`, `content/data/projects.json` — migrated by running the script.
- **Modify** `README.md` — update the `members.json`/`projects.json` bullets.

---

### Task 1: Schema changes

**Files:**
- Modify: `schema/members.schema.json`
- Modify: `schema/projects.schema.json`

- [ ] **Step 1: Add `id` to the members schema**

In `schema/members.schema.json`, change `"required": ["lastname", "firstname", "affiliation", "email"]` to include `"id"`, and add the `id` property:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Members",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "lastname", "firstname", "affiliation", "email"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
        "description": "{lastname-slug}-{firstname-slug}, e.g. doe-jane; a numeric suffix (doe-jane-2) resolves collisions"
      },
      "lastname": { "type": "string", "minLength": 1 },
      "firstname": { "type": "string", "minLength": 1 },
      "affiliation": { "type": "string", "minLength": 1 },
      "email": { "type": "string", "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
      "url": { "type": "string", "pattern": "^https?://[^\\s\"'<>]+$" },
      "portrait_url": { "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[A-Za-z0-9_-][A-Za-z0-9._-]*)$" },
      "orcid": { "type": "string", "pattern": "^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dX]$" }
    }
  }
}
```

- [ ] **Step 2: Change `projects.participants` to the id pattern**

In `schema/projects.schema.json`, change the `participants.items` block:

```json
"participants": {
  "type": "array",
  "items": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" }
}
```

- [ ] **Step 3: Confirm the schema files are valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('schema/members.schema.json'))" && node -e "JSON.parse(require('fs').readFileSync('schema/projects.schema.json'))" && echo OK`
Expected: `OK`

Note: `npm run validate` will now **fail** against the committed `content/data/*.json` (which still uses the old email-based shape) until Task 6 migrates it. That's expected — don't treat it as a regression in the meantime.

- [ ] **Step 4: Commit**

```bash
git add schema/members.schema.json schema/projects.schema.json
git commit -m "Add member id to schema, switch project participants to id-based linking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `content-store.mjs` — shared read/write module

**Files:**
- Create: `scripts/lib/content-store.mjs`
- Test: `tests/content-store.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/content-store.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readContentFile, writeContentFile, isRemoteContentPath, authHeaders } from '../scripts/lib/content-store.mjs';

test('isRemoteContentPath recognizes http(s) URLs and rejects local paths', () => {
  assert.equal(isRemoteContentPath('https://example.org/content'), true);
  assert.equal(isRemoteContentPath('http://example.org/content'), true);
  assert.equal(isRemoteContentPath('./content'), false);
  assert.equal(isRemoteContentPath('/abs/path'), false);
});

test('authHeaders is empty without credentials and Basic-encoded with them', () => {
  const originalUser = process.env.CONTENT_USERNAME;
  const originalPass = process.env.CONTENT_PASSWORD;
  delete process.env.CONTENT_USERNAME;
  delete process.env.CONTENT_PASSWORD;
  assert.deepEqual(authHeaders(), {});
  process.env.CONTENT_USERNAME = 'alice';
  process.env.CONTENT_PASSWORD = 'secret';
  assert.deepEqual(authHeaders(), { Authorization: `Basic ${Buffer.from('alice:secret').toString('base64')}` });
  if (originalUser === undefined) delete process.env.CONTENT_USERNAME;
  else process.env.CONTENT_USERNAME = originalUser;
  if (originalPass === undefined) delete process.env.CONTENT_PASSWORD;
  else process.env.CONTENT_PASSWORD = originalPass;
});

test('readContentFile reads a local file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await writeFile(path.join(dir, 'data.json'), '{"a":1}', 'utf8');
  assert.equal(await readContentFile(dir, 'data.json'), '{"a":1}');
  await rm(dir, { recursive: true, force: true });
});

test('writeContentFile writes a local file, creating parent directories', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await writeContentFile(dir, 'data/members.json', '[]');
  assert.equal(await readFile(path.join(dir, 'data', 'members.json'), 'utf8'), '[]');
  await rm(dir, { recursive: true, force: true });
});

test('readContentFile fetches a remote file with auth headers', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => 'remote content' };
  };
  process.env.CONTENT_USERNAME = 'alice';
  process.env.CONTENT_PASSWORD = 'secret';
  try {
    const text = await readContentFile('https://example.org/content', 'data/members.json');
    assert.equal(text, 'remote content');
    assert.equal(requests[0].url, 'https://example.org/content/data/members.json');
    assert.equal(requests[0].options.headers.Authorization, `Basic ${Buffer.from('alice:secret').toString('base64')}`);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CONTENT_USERNAME;
    delete process.env.CONTENT_PASSWORD;
  }
});

test('readContentFile throws a descriptive error on a failed remote fetch', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
  try {
    await assert.rejects(
      () => readContentFile('https://example.org/content', 'data/members.json'),
      /Failed to fetch https:\/\/example\.org\/content\/data\/members\.json: 404 Not Found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeContentFile PUTs a remote file with the given content', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    await writeContentFile('https://example.org/content', 'data/members.json', '[]');
    assert.equal(requests[0].url, 'https://example.org/content/data/members.json');
    assert.equal(requests[0].options.method, 'PUT');
    assert.equal(requests[0].options.body, '[]');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeContentFile throws a descriptive error on a failed remote PUT', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
  try {
    await assert.rejects(
      () => writeContentFile('https://example.org/content', 'data/members.json', '[]'),
      /Failed to write https:\/\/example\.org\/content\/data\/members\.json: 403 Forbidden/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/content-store.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/content-store.mjs'`

- [ ] **Step 3: Implement `content-store.mjs`**

Create `scripts/lib/content-store.mjs`:

```javascript
// Reads/writes a single file inside a CONTENT_PATH tree, which is either a
// local directory or a remote http(s) URL (WebDAV). Shared by the build's
// remote-content fetcher and any tool that needs to write content back
// (migration scripts, the local data editor).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithTimeout, timeoutFromEnv } from './fetch-with-timeout.mjs';

export function isRemoteContentPath(contentPath) {
  return /^https?:\/\//i.test(contentPath);
}

export function authHeaders() {
  const username = process.env.CONTENT_USERNAME;
  const password = process.env.CONTENT_PASSWORD;
  if (!username && !password) return {};
  const token = Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

function timeoutOpts() {
  return { timeoutMs: timeoutFromEnv('CONTENT_TIMEOUT_MS', 30000) };
}

function remoteUrl(contentPath, relPath) {
  return `${contentPath.replace(/\/+$/, '')}/${relPath}`;
}

export async function readContentFile(contentPath, relPath) {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(url, { headers: authHeaders() }, timeoutOpts());
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return res.text();
  }
  return readFile(path.join(contentPath, relPath), 'utf8');
}

export async function writeContentFile(contentPath, relPath, content) {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(
      url,
      { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: content },
      timeoutOpts()
    );
    if (!res.ok) throw new Error(`Failed to write ${url}: ${res.status} ${res.statusText}`);
    return;
  }
  const fullPath = path.join(contentPath, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/content-store.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/content-store.mjs tests/content-store.test.js
git commit -m "Add content-store module for reading/writing a local or WebDAV CONTENT_PATH

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Dedupe `resolve-content.mjs`/`resolve-content-remote.mjs` onto `content-store.mjs`

**Files:**
- Modify: `scripts/lib/resolve-content.mjs`
- Modify: `scripts/lib/resolve-content-remote.mjs`

- [ ] **Step 1: Reuse `isRemoteContentPath` in `resolve-content.mjs`**

Replace the whole file `scripts/lib/resolve-content.mjs` with:

```javascript
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isRemoteContentPath } from './content-store.mjs';

export async function resolveContent(contentPath = process.env.CONTENT_PATH || './content') {
  if (isRemoteContentPath(contentPath)) {
    const { materializeRemote } = await import('./resolve-content-remote.mjs');
    return materializeRemote(contentPath.replace(/\/+$/, ''));
  }
  if (!existsSync(contentPath)) {
    throw new Error(`CONTENT_PATH "${contentPath}" does not exist`);
  }
  return path.resolve(contentPath);
}
```

- [ ] **Step 2: Reuse `authHeaders`/`readContentFile` in `resolve-content-remote.mjs`**

Replace the whole file `scripts/lib/resolve-content-remote.mjs` with:

```javascript
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchWithTimeout, timeoutFromEnv } from './fetch-with-timeout.mjs';
import { isExternalLink } from '../../assets/js/shared.js';
import { authHeaders, readContentFile } from './content-store.mjs';

const DATA_FILES = ['site', 'members', 'projects', 'events', 'news'];
const OPTIONAL_DATA_FILES = ['publications'];

function fetchContent(url) {
  return fetchWithTimeout(url, { headers: authHeaders() }, { timeoutMs: timeoutFromEnv('CONTENT_TIMEOUT_MS', 30000) });
}

async function fetchOk(url) {
  const res = await fetchContent(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res;
}

function referencedPageNames(newsItems, eventsItems) {
  const names = new Set(['about.md']);
  const pattern = /^pages\.html\?doc=(.+)$/;
  for (const item of [...newsItems, ...eventsItems]) {
    const match = typeof item.url === 'string' ? item.url.match(pattern) : null;
    if (match) names.add(match[1]);
  }
  return [...names];
}

export async function materializeRemote(baseUrl) {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-'));
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'pages'), { recursive: true });
  await mkdir(path.join(dir, 'images'), { recursive: true });

  const data = {};
  for (const name of DATA_FILES) {
    const text = await readContentFile(baseUrl, `data/${name}.json`);
    await writeFile(path.join(dir, 'data', `${name}.json`), text, 'utf8');
    data[name] = JSON.parse(text);
  }

  for (const name of OPTIONAL_DATA_FILES) {
    const url = `${baseUrl}/data/${name}.json`;
    const res = await fetchContent(url);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    await writeFile(path.join(dir, 'data', `${name}.json`), await res.text(), 'utf8');
  }

  for (const name of referencedPageNames(data.news, data.events)) {
    const text = await readContentFile(baseUrl, `pages/${name}`);
    await writeFile(path.join(dir, 'pages', name), text, 'utf8');
  }

  const portraitImages = data.members.map((m) => m.portrait_url).filter((url) => url && !isExternalLink(url));
  for (const name of new Set([data.site.favicon, data.site.logo, ...portraitImages].filter(Boolean))) {
    const buffer = Buffer.from(await (await fetchOk(`${baseUrl}/images/${name}`)).arrayBuffer());
    await writeFile(path.join(dir, 'images', name), buffer);
  }

  return dir;
}
```

- [ ] **Step 3: Run the existing tests to confirm behavior is unchanged**

Run: `node --test tests/resolve-content.test.js tests/resolve-content-remote.test.js tests/content-store.test.js`
Expected: PASS (all tests, no changes needed to these test files — the refactor preserves the exact same error messages and behavior)

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/resolve-content.mjs scripts/lib/resolve-content-remote.mjs
git commit -m "Refactor resolve-content(-remote).mjs to reuse content-store.mjs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Replace computed member slug with stored `member.id`

This task touches `shared.js`, its two consumers, and every test that exercises them together, since removing `memberSlug` breaks the consumers' imports until they're updated in the same step. Keep it as one commit.

**Files:**
- Modify: `assets/js/shared.js`
- Modify: `assets/js/members.js`
- Modify: `assets/js/projects-graph.js`
- Modify: `tests/shared.test.js`
- Modify: `tests/members.test.js`
- Modify: `tests/projects-graph.test.js`
- Modify: `tests/build.test.js`

- [ ] **Step 1: Rename `memberSlug` to `computeMemberId` in `shared.js`**

In `assets/js/shared.js`, replace:

```javascript
export function memberSlug(member) {
  const slugify = (value) =>
    String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slugify(member.firstname)}-${slugify(member.lastname)}`;
}
```

with:

```javascript
export function computeMemberId(firstname, lastname) {
  const slugify = (value) =>
    String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slugify(lastname)}-${slugify(firstname)}`;
}
```

- [ ] **Step 2: Update `shared.test.js`**

In `tests/shared.test.js`, change the import line:

```javascript
import { escapeHTML, getInitials, hashColor, navHTML, isExternalLink, resolvePortraitUrl, computeMemberId, textMatchesQuery, skipLinkHTML, isValidDocFilename, getDocType, titleFromFilename } from '../assets/js/shared.js';
```

and replace the two `memberSlug` tests with:

```javascript
test('computeMemberId builds a lowercase hyphenated id from lastname and firstname', () => {
  assert.equal(computeMemberId('Ada', 'Adler'), 'adler-ada');
});

test('computeMemberId strips characters that are not letters or digits', () => {
  assert.equal(computeMemberId("O'Brien", 'Smith-Jones'), 'smith-jones-o-brien');
});
```

- [ ] **Step 3: Update `members.js` to read `member.id` directly**

In `assets/js/members.js`, replace the top of the file (import line through `renderMemberCard`) with:

```javascript
import { escapeHTML, getInitials, hashColor, resolvePortraitUrl, textMatchesQuery, wirePortraitFallback } from './shared.js';

export function sortMembersByLastname(members) {
  return [...members].sort((a, b) =>
    a.lastname.localeCompare(b.lastname, undefined, { sensitivity: 'base' })
  );
}

export function memberSearchText(member) {
  return `${member.firstname} ${member.lastname} ${member.affiliation || ''}`.trim().toLowerCase();
}

export function memberMatches(query, member) {
  return textMatchesQuery(query, memberSearchText(member));
}

export function participantSlugs(projects, members) {
  const knownIds = new Set(members.map((m) => m.id));
  const slugs = new Set();
  projects.forEach((project) => {
    (project.participants || []).forEach((id) => {
      if (knownIds.has(id)) slugs.add(id);
    });
  });
  return slugs;
}

function renderProjectsLink(member, participantSlugs) {
  return participantSlugs && participantSlugs.has(member.id)
    ? `<a class="member-projects-link" href="projects.html#member=${escapeHTML(member.id)}">Projects</a>`
    : '';
}

function renderPublicationsLink(member) {
  return member.orcid
    ? `<a class="member-publications-link" href="https://orcid.org/${escapeHTML(member.orcid)}" target="_blank" rel="noopener">Publications</a>`
    : '';
}

export function renderMemberCard(member, participantSlugs) {
  const initials = getInitials(member.firstname, member.lastname);
  const color = hashColor(member.email);
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  const portrait = member.portrait_url
    ? `<img class="avatar" src="${escapeHTML(resolvePortraitUrl(member.portrait_url))}" alt="" data-portrait-fallback data-initials="${escapeHTML(initials)}" data-avatar-color="${color}">`
    : `<div class="avatar-fallback" style="background-color:${color}">${escapeHTML(initials)}</div>`;
  return `<li class="member-card" id="${member.id}" data-search="${escapeHTML(memberSearchText(member))}">${portrait}<h3>${nameHTML}</h3><p class="affiliation">${escapeHTML(member.affiliation)}</p>${renderProjectsLink(member, participantSlugs)}${renderPublicationsLink(member)}</li>`;
}
```

The rest of the file (`renderMembers` through the bottom `if (typeof document !== 'undefined' ...)` DOM-wiring block) is unchanged — leave it as-is.

- [ ] **Step 4: Update `projects-graph.js` to key by id instead of email**

In `assets/js/projects-graph.js`, replace the import line:

```javascript
import { escapeHTML, getInitials, hashColor, resolvePortraitUrl } from './shared.js';
```

Replace `buildGraphData`:

```javascript
export function buildGraphData(projects, members) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const nodes = [];
  const links = [];
  const seenScholars = new Set();

  projects.forEach((project) => {
    nodes.push({ id: `project:${project.id}`, type: 'project', data: project });
    (project.participants || []).forEach((id) => {
      const member = memberById.get(id);
      if (!member) {
        console.warn(`Project "${project.id}" references unknown participant "${id}"`);
        return;
      }
      const scholarId = `scholar:${id}`;
      if (!seenScholars.has(scholarId)) {
        nodes.push({ id: scholarId, type: 'scholar', data: member });
        seenScholars.add(scholarId);
      }
      links.push({ source: `project:${project.id}`, target: scholarId });
    });
  });

  return { nodes, links };
}
```

Replace `sanitizeGraphData`:

```javascript
export function sanitizeGraphData(nodes, links) {
  const idMap = new Map();
  const sanitizedNodes = nodes.map((n) => {
    if (n.type === 'project') {
      const { id, title, subtitle, description, url, image_url } = n.data;
      idMap.set(n.id, n.id);
      return { id: n.id, type: 'project', data: { id, title, subtitle, description, url, image_url } };
    }
    const { id, firstname, lastname, affiliation, portrait_url, url } = n.data;
    idMap.set(n.id, n.id);
    return {
      id: n.id,
      type: 'scholar',
      data: { firstname, lastname, affiliation, portrait_url: resolvePortraitUrl(portrait_url), url, slug: id },
    };
  });
  const sanitizedLinks = links.map((l) => {
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
    return {
      source: idMap.get(sourceId) ?? sourceId,
      target: idMap.get(targetId) ?? targetId,
    };
  });
  return { nodes: sanitizedNodes, links: sanitizedLinks };
}
```

Replace `buildProjectListItems`:

```javascript
export function buildProjectListItems(projects, members) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  return projects.map((project) => ({
    ...project,
    participantNames: (project.participants || [])
      .map((id) => memberById.get(id))
      .filter(Boolean)
      .map((m) => ({
        name: m.affiliation ? `${m.firstname} ${m.lastname} (${m.affiliation})` : `${m.firstname} ${m.lastname}`,
        slug: m.id,
      })),
  }));
}
```

Everything else in the file (`filterMatches`, `renderListView`, `parseMemberHash`, `participantsInclude`, the modal/tooltip/graph-rendering code, and the DOM-wiring block at the bottom) is unchanged.

- [ ] **Step 5: Update `members.test.js`**

Replace the whole file `tests/members.test.js` with:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMembersByLastname, renderMemberCard, memberMatches, memberSearchText, renderMemberListItem, renderMembers, renderMemberList, participantSlugs } from '../assets/js/members.js';

const sample = [
  { firstname: 'Jordan', lastname: 'Lee', affiliation: 'MPI', id: 'lee-jordan', email: 'a@example.org' },
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'Uni X', id: 'adler-ada', email: 'b@example.org' },
];

test('sortMembersByLastname sorts alphabetically by lastname', () => {
  const sorted = sortMembersByLastname(sample);
  assert.deepEqual(sorted.map((m) => m.lastname), ['Adler', 'Lee']);
});

test('sortMembersByLastname does not mutate the input array', () => {
  const copy = [...sample];
  sortMembersByLastname(sample);
  assert.deepEqual(sample, copy);
});

test('renderMemberCard links the name when url is present', () => {
  const html = renderMemberCard({ ...sample[0], url: 'https://example.org/cb' });
  assert.match(html, /<a href="https:\/\/example.org\/cb"/);
});

test('renderMemberCard falls back to initials avatar when no portrait_url', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /class="avatar-fallback"/);
  assert.match(html, />JL</);
});

test('renderMemberCard serves a local portrait filename from images/', () => {
  const html = renderMemberCard({ ...sample[0], portrait_url: 'lee.jpg' });
  assert.match(html, /<img class="avatar" src="images\/lee\.jpg"/);
});

test('renderMemberCard keeps an external portrait URL unchanged', () => {
  const html = renderMemberCard({ ...sample[0], portrait_url: 'https://example.org/lee.jpg' });
  assert.match(html, /src="https:\/\/example\.org\/lee\.jpg"/);
});

test('renderMemberCard does not expose the email address', () => {
  const html = renderMemberCard(sample[0]);
  assert.doesNotMatch(html, /mailto:/);
  assert.doesNotMatch(html, /a@example\.org/);
});

test('renderMemberCard uses the stored member id, not the email', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /id="lee-jordan"/);
  assert.doesNotMatch(html, /a%40example\.org/);
});

test('renderMemberCard carries a data-search attribute with name and affiliation', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /data-search="jordan lee mpi"/);
});

test('memberSearchText lowercases name and affiliation', () => {
  assert.equal(memberSearchText(sample[0]), 'jordan lee mpi');
});

test('renderMemberListItem carries a data-search attribute with name and affiliation', () => {
  const html = renderMemberListItem(sample[0]);
  assert.match(html, /data-search="jordan lee mpi"/);
});

test('memberMatches matches by name case-insensitively', () => {
  assert.equal(memberMatches('jordan', sample[0]), true);
  assert.equal(memberMatches('lee', sample[0]), true);
  assert.equal(memberMatches('nomatch', sample[0]), false);
});

test('memberMatches matches by affiliation', () => {
  assert.equal(memberMatches('uni x', sample[1]), true);
});

test('memberMatches treats an empty query as matching everything', () => {
  assert.equal(memberMatches('', sample[0]), true);
  assert.equal(memberMatches('   ', sample[0]), true);
});

test('renderMemberListItem links the name when url is present', () => {
  const html = renderMemberListItem({ ...sample[0], url: 'https://example.org/cb' });
  assert.match(html, /<a href="https:\/\/example.org\/cb"/);
});

test('renderMemberListItem omits the affiliation span when affiliation is missing', () => {
  const { affiliation, ...rest } = sample[0];
  const html = renderMemberListItem(rest);
  assert.doesNotMatch(html, /class="affiliation"/);
});

test('renderMemberListItem does not expose the email address', () => {
  const html = renderMemberListItem(sample[0]);
  assert.doesNotMatch(html, /mailto:/);
  assert.doesNotMatch(html, /a@example\.org/);
});

test('renderMemberCard adds a Projects link when the member participates in a project', () => {
  const html = renderMemberCard(sample[0], new Set(['lee-jordan']));
  assert.match(html, /<a class="member-projects-link" href="projects.html#member=lee-jordan">Projects<\/a>/);
});

test('renderMemberCard omits the Projects link for members without projects', () => {
  assert.doesNotMatch(renderMemberCard(sample[0], new Set(['adler-ada'])), /member-projects-link/);
  assert.doesNotMatch(renderMemberCard(sample[0]), /member-projects-link/);
});

test('renderMemberListItem adds a Projects link when the member participates in a project', () => {
  const html = renderMemberListItem(sample[0], new Set(['lee-jordan']));
  assert.match(html, /href="projects.html#member=lee-jordan"/);
});

test('renderMemberListItem omits the Projects link for members without projects', () => {
  assert.doesNotMatch(renderMemberListItem(sample[0], new Set()), /member-projects-link/);
  assert.doesNotMatch(renderMemberListItem(sample[0]), /member-projects-link/);
});

test('renderMemberCard and renderMemberListItem add a Publications link to ORCID when orcid is given', () => {
  const member = { ...sample[0], orcid: '0000-0001-6928-3246' };
  const link =
    /<a class="member-publications-link" href="https:\/\/orcid.org\/0000-0001-6928-3246" target="_blank" rel="noopener">Publications<\/a>/;
  assert.match(renderMemberCard(member), link);
  assert.match(renderMemberListItem(member), link);
});

test('renderMemberCard and renderMemberListItem omit the Publications link without orcid', () => {
  assert.doesNotMatch(renderMemberCard(sample[0]), /member-publications-link/);
  assert.doesNotMatch(renderMemberListItem(sample[0]), /member-publications-link/);
});

test('renderMembers and renderMemberList forward the participant set', () => {
  const grid = {};
  const list = {};
  renderMembers(sample, grid, new Set(['adler-ada']));
  renderMemberList(sample, list, new Set(['adler-ada']));
  assert.equal(grid.innerHTML.match(/member-projects-link/g).length, 1);
  assert.equal(list.innerHTML.match(/member-projects-link/g).length, 1);
});

test('participantSlugs collects ids of known project participants', () => {
  const members = [...sample, { firstname: 'No', lastname: 'Projects', id: 'projects-no', email: 'c@example.org' }];
  const projects = [
    { id: 'p1', participants: ['lee-jordan', 'ghost-id'] },
    { id: 'p2', participants: ['lee-jordan', 'adler-ada'] },
    { id: 'p3' },
  ];
  assert.deepEqual([...participantSlugs(projects, members)].sort(), ['adler-ada', 'lee-jordan']);
});
```

- [ ] **Step 6: Update `projects-graph.test.js`**

Replace the whole file `tests/projects-graph.test.js` with:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphData, filterMatches, buildProjectListItems, renderListView, sanitizeGraphData, parseMemberHash, participantsInclude } from '../assets/js/projects-graph.js';

const members = [
  { firstname: 'Ada', lastname: 'Adler', id: 'adler-ada', email: 'ada@example.org' },
  { firstname: 'Bo', lastname: 'Bergman', id: 'bergman-bo', email: 'bo@example.org' },
];
const projects = [
  { id: 'p1', title: 'Project One', participants: ['adler-ada', 'bergman-bo'] },
  { id: 'p2', title: 'Project Two', participants: ['adler-ada', 'ghost-id'] },
];

test('buildGraphData creates one node per project and per unique scholar', () => {
  const { nodes } = buildGraphData(projects, members);
  assert.equal(nodes.filter((n) => n.type === 'project').length, 2);
  assert.equal(nodes.filter((n) => n.type === 'scholar').length, 2);
});

test('buildGraphData skips participants with no matching member record', () => {
  const { links } = buildGraphData(projects, members);
  const p2Links = links.filter((l) => l.source === 'project:p2');
  assert.equal(p2Links.length, 1);
});

test('buildGraphData creates a link per project-participant pair', () => {
  const { links } = buildGraphData(projects, members);
  assert.equal(links.length, 3);
});

test('filterMatches matches project titles case-insensitively', () => {
  const node = { type: 'project', data: { title: 'A History of the CLFN' } };
  assert.equal(filterMatches('history', node), true);
  assert.equal(filterMatches('nomatch', node), false);
});

test('filterMatches matches scholar names', () => {
  const node = { type: 'scholar', data: { firstname: 'Ada', lastname: 'Adler' } };
  assert.equal(filterMatches('adler', node), true);
});

test('filterMatches treats an empty query as matching everything', () => {
  const node = { type: 'project', data: { title: 'Anything' } };
  assert.equal(filterMatches('', node), true);
});

test('buildProjectListItems attaches resolved participant names', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[0].participantNames.map((p) => p.name), ['Ada Adler', 'Bo Bergman']);
});

test('buildProjectListItems drops unknown participants', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[1].participantNames.map((p) => p.name), ['Ada Adler']);
});

test('buildProjectListItems attaches a slug instead of an email', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[0].participantNames.map((p) => p.slug), ['adler-ada', 'bergman-bo']);
  assert.equal('email' in items[0].participantNames[0], false);
});

test('renderListView links participants by slug, not email', () => {
  const container = {};
  renderListView(projects, members, container);
  assert.match(container.innerHTML, /href="members.html#adler-ada"/);
  assert.doesNotMatch(container.innerHTML, /ada%40example\.org/);
});

test('sanitizeGraphData drops email and keeps a slug on scholar nodes', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const scholar = sanitized.find((n) => n.type === 'scholar');
  assert.equal('email' in scholar.data, false);
  assert.equal(scholar.data.slug, 'adler-ada');
});

test('sanitizeGraphData drops the participants list from project nodes', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const project = sanitized.find((n) => n.type === 'project');
  assert.equal('participants' in project.data, false);
});

test('sanitizeGraphData does not leak the email into the scholar node id', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const scholar = sanitized.find((n) => n.type === 'scholar');
  assert.equal(scholar.id, 'scholar:adler-ada');
  assert.doesNotMatch(scholar.id, /@/);
});

test('sanitizeGraphData rewrites link source/target to match the sanitized scholar node ids', () => {
  const { nodes, links } = buildGraphData(projects, members);
  const { links: sanitizedLinks } = sanitizeGraphData(nodes, links);
  const linkToAda = sanitizedLinks.find((l) => l.source === 'project:p1' && l.target === 'scholar:adler-ada');
  assert.ok(linkToAda, 'expected a link from project:p1 to scholar:adler-ada');
  assert.equal(sanitizedLinks.some((l) => l.source.includes('@') || l.target.includes('@')), false);
});

test('renderListView tags each project with its participant slugs', () => {
  const container = {};
  renderListView(projects, members, container);
  assert.match(container.innerHTML, /data-participants="adler-ada bergman-bo"/);
  assert.match(container.innerHTML, /data-participants="adler-ada"/);
  assert.match(container.innerHTML, /<a href="members.html#bergman-bo" data-slug="bergman-bo">/);
});

test('parseMemberHash extracts the slug from a member hash', () => {
  assert.equal(parseMemberHash('#member=jane-doe'), 'jane-doe');
  assert.equal(parseMemberHash('member=jane-doe'), 'jane-doe');
  assert.equal(parseMemberHash('#member=jos%C3%A9-doe'), 'josé-doe');
});

test('parseMemberHash returns null for anything else', () => {
  assert.equal(parseMemberHash(''), null);
  assert.equal(parseMemberHash('#'), null);
  assert.equal(parseMemberHash('#member='), null);
  assert.equal(parseMemberHash('#other=x'), null);
  assert.equal(parseMemberHash('#member=%E0%A4%A'), null);
  assert.equal(parseMemberHash(undefined), null);
});

test('participantsInclude matches whole slugs only', () => {
  assert.equal(participantsInclude('adler-ada bergman-bo', 'bergman-bo'), true);
  assert.equal(participantsInclude('adler-ada', 'bergman-bo'), false);
  assert.equal(participantsInclude('anna-x', 'ann'), false);
  assert.equal(participantsInclude('', 'adler-ada'), false);
  assert.equal(participantsInclude(undefined, 'adler-ada'), false);
});
```

- [ ] **Step 7: Update `build.test.js` fixtures**

In `tests/build.test.js`, in `writeFixtureContent`, replace:

```javascript
  await writeFile(
    path.join(dir, 'data', 'members.json'),
    JSON.stringify([{ firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' }])
  );
  await writeFile(
    path.join(dir, 'data', 'projects.json'),
    JSON.stringify([{ id: 'p1', title: 'Test Project', participants: ['secret@example.org'] }])
  );
```

with:

```javascript
  await writeFile(
    path.join(dir, 'data', 'members.json'),
    JSON.stringify([
      { id: 'person-test', firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' },
    ])
  );
  await writeFile(
    path.join(dir, 'data', 'projects.json'),
    JSON.stringify([{ id: 'p1', title: 'Test Project', participants: ['person-test'] }])
  );
```

In the `'build.mjs links project participants from the members page to the focused projects page'` test, replace:

```javascript
  await writeFile(
    path.join(contentDir, 'data', 'members.json'),
    JSON.stringify([
      { firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' },
      { firstname: 'Solo', lastname: 'Member', affiliation: 'Test Org', email: 'solo@example.org' },
    ])
  );

  await runBuild(contentDir, publicDir);

  const membersHTML = await readFile(path.join(publicDir, 'members.html'), 'utf8');
  assert.equal(membersHTML.match(/projects\.html#member=test-person/g).length, 2);
  assert.doesNotMatch(membersHTML, /projects\.html#member=solo-member/);
```

with:

```javascript
  await writeFile(
    path.join(contentDir, 'data', 'members.json'),
    JSON.stringify([
      { id: 'person-test', firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' },
      { id: 'member-solo', firstname: 'Solo', lastname: 'Member', affiliation: 'Test Org', email: 'solo@example.org' },
    ])
  );

  await runBuild(contentDir, publicDir);

  const membersHTML = await readFile(path.join(publicDir, 'members.html'), 'utf8');
  assert.equal(membersHTML.match(/projects\.html#member=person-test/g).length, 2);
  assert.doesNotMatch(membersHTML, /projects\.html#member=member-solo/);
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — all files in `tests/*.test.js`, no failures.

- [ ] **Step 9: Commit**

```bash
git add assets/js/shared.js assets/js/members.js assets/js/projects-graph.js tests/shared.test.js tests/members.test.js tests/projects-graph.test.js tests/build.test.js
git commit -m "Replace computed member slug with stored member.id in rendering code

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Migration script

**Files:**
- Create: `scripts/migrate-member-ids.mjs`
- Test: `tests/migrate-member-ids.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Create `tests/migrate-member-ids.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateMemberIds } from '../scripts/migrate-member-ids.mjs';

const baseMembers = [
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'ada@example.org' },
  { firstname: 'Bo', lastname: 'Bergman', affiliation: 'Y', email: 'bo@example.org' },
];

test('migrateMemberIds assigns a lastname-firstname id to members without one', () => {
  const { members, assignedIds } = migrateMemberIds(baseMembers, []);
  assert.deepEqual(members.map((m) => m.id), ['adler-ada', 'bergman-bo']);
  assert.deepEqual(assignedIds, [
    { name: 'Ada Adler', id: 'adler-ada' },
    { name: 'Bo Bergman', id: 'bergman-bo' },
  ]);
});

test('migrateMemberIds leaves an existing valid id untouched (idempotent)', () => {
  const members = [{ ...baseMembers[0], id: 'adler-ada' }];
  const { members: migrated, assignedIds } = migrateMemberIds(members, []);
  assert.equal(migrated[0].id, 'adler-ada');
  assert.deepEqual(assignedIds, []);
});

test('migrateMemberIds resolves a same-id collision with a numeric suffix', () => {
  const members = [
    { firstname: 'Ada', lastname: 'Adler', email: 'ada1@example.org' },
    { firstname: 'Ada', lastname: 'Adler', email: 'ada2@example.org' },
  ];
  const { members: migrated } = migrateMemberIds(members, []);
  assert.deepEqual(migrated.map((m) => m.id), ['adler-ada', 'adler-ada-2']);
});

test('migrateMemberIds rewrites project participants from email to the matching member id', () => {
  const projects = [{ id: 'p1', title: 'P', participants: ['ada@example.org', 'bo@example.org'] }];
  const { projects: migrated, rewrittenParticipants } = migrateMemberIds(baseMembers, projects);
  assert.deepEqual(migrated[0].participants, ['adler-ada', 'bergman-bo']);
  assert.equal(rewrittenParticipants, 2);
});

test('migrateMemberIds leaves an already-migrated participant id untouched (idempotent)', () => {
  const projects = [{ id: 'p1', title: 'P', participants: ['adler-ada'] }];
  const members = [{ ...baseMembers[0], id: 'adler-ada' }];
  const { projects: migrated, rewrittenParticipants, warnings } = migrateMemberIds(members, projects);
  assert.deepEqual(migrated[0].participants, ['adler-ada']);
  assert.equal(rewrittenParticipants, 0);
  assert.deepEqual(warnings, []);
});

test('migrateMemberIds warns about a participant email/id matching no member', () => {
  const projects = [{ id: 'p1', title: 'P', participants: ['ghost@example.org'] }];
  const { warnings } = migrateMemberIds(baseMembers, projects);
  assert.deepEqual(warnings, ['Project "p1" references unknown participant "ghost@example.org"']);
});

test('migrateMemberIds does not mutate its input arrays', () => {
  const membersCopy = JSON.parse(JSON.stringify(baseMembers));
  const projects = [{ id: 'p1', title: 'P', participants: ['ada@example.org'] }];
  const projectsCopy = JSON.parse(JSON.stringify(projects));
  migrateMemberIds(baseMembers, projects);
  assert.deepEqual(baseMembers, membersCopy);
  assert.deepEqual(projects, projectsCopy);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/migrate-member-ids.test.js`
Expected: FAIL — `Cannot find module '../scripts/migrate-member-ids.mjs'`

- [ ] **Step 3: Implement `migrate-member-ids.mjs`**

Create `scripts/migrate-member-ids.mjs`:

```javascript
import { readContentFile, writeContentFile } from './lib/content-store.mjs';
import { computeMemberId } from '../assets/js/shared.js';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function migrateMemberIds(members, projects) {
  const usedIds = new Set(members.filter((m) => ID_PATTERN.test(m.id || '')).map((m) => m.id));
  const idByEmail = new Map();
  const assignedIds = [];

  const migratedMembers = members.map((member) => {
    if (ID_PATTERN.test(member.id || '')) {
      idByEmail.set(member.email, member.id);
      return member;
    }
    const base = computeMemberId(member.firstname, member.lastname);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    idByEmail.set(member.email, id);
    assignedIds.push({ name: `${member.firstname} ${member.lastname}`, id });
    return { ...member, id };
  });

  const warnings = [];
  let rewrittenParticipants = 0;
  const migratedProjects = projects.map((project) => {
    if (!Array.isArray(project.participants)) return project;
    const participants = project.participants.map((value) => {
      if (idByEmail.has(value)) {
        rewrittenParticipants += 1;
        return idByEmail.get(value);
      }
      if (usedIds.has(value)) return value;
      warnings.push(`Project "${project.id}" references unknown participant "${value}"`);
      return value;
    });
    return { ...project, participants };
  });

  return { members: migratedMembers, projects: migratedProjects, assignedIds, rewrittenParticipants, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const contentPath = args.find((a) => a !== '--apply') || process.env.CONTENT_PATH || './content';

  const members = JSON.parse(await readContentFile(contentPath, 'data/members.json'));
  const projects = JSON.parse(await readContentFile(contentPath, 'data/projects.json'));

  const result = migrateMemberIds(members, projects);

  console.log(`Members: ${result.assignedIds.length} assigned a new id (${members.length} total)`);
  result.assignedIds.forEach(({ name, id }) => console.log(`  - ${name} -> ${id}`));
  console.log(`Projects: ${result.rewrittenParticipants} participant reference(s) rewritten from email to id`);
  if (result.warnings.length) {
    console.log('Warnings:');
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (!apply) {
    console.log('Dry run only - no files written. Re-run with --apply to write changes.');
    return;
  }

  await writeContentFile(contentPath, 'data/members.json', JSON.stringify(result.members, null, 2) + '\n');
  await writeContentFile(contentPath, 'data/projects.json', JSON.stringify(result.projects, null, 2) + '\n');
  console.log('Wrote data/members.json and data/projects.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/migrate-member-ids.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Add an npm script**

In `package.json`, add to `"scripts"` (after `"validate"`, matching the existing style):

```json
    "migrate-member-ids": "node --env-file-if-exists=.env scripts/migrate-member-ids.mjs",
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-member-ids.mjs tests/migrate-member-ids.test.js package.json
git commit -m "Add migrate-member-ids script for one-off email-to-id data migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Migrate the committed demo content and verify everything together

**Files:**
- Modify: `content/data/members.json`
- Modify: `content/data/projects.json`

- [ ] **Step 1: Dry-run the migration against the demo content**

Run: `npm run migrate-member-ids`
Expected output (order matches `content/data/members.json`):

```
Members: 5 assigned a new id (5 total)
  - Ada Adler -> adler-ada
  - Bo Bergman -> bergman-bo
  - Chidi Okoro -> okoro-chidi
  - Dana Kovac -> kovac-dana
  - Erik Sundstrom -> sundstrom-erik
Projects: 8 participant reference(s) rewritten from email to id
Dry run only - no files written. Re-run with --apply to write changes.
```

- [ ] **Step 2: Apply the migration**

Run: `npm run migrate-member-ids -- --apply`
Expected: same summary as Step 1, plus a final line `Wrote data/members.json and data/projects.json`.

- [ ] **Step 3: Inspect the migrated files**

Run: `cat content/data/members.json content/data/projects.json`
Expected: every member has an `id` field (`adler-ada`, `bergman-bo`, `okoro-chidi`, `kovac-dana`, `sundstrom-erik`); every project's `participants` array contains those ids instead of email addresses.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Validate the migrated content against the schema**

Run: `npm run validate`
Expected: PASS for all six schemas (this is the point in the plan where `content/data/members.json`/`projects.json` and `schema/members.schema.json`/`projects.schema.json` are back in sync).

- [ ] **Step 6: Build the demo site as a sanity check**

Run: `npm run build`
Expected: exits `0`, writes to `public/`.

Run: `grep -c 'member-projects-link' public/members.html`
Expected: a number greater than `0` (at least one demo member has a rendered Projects link).

- [ ] **Step 7: Commit**

```bash
git add content/data/members.json content/data/projects.json
git commit -m "Migrate demo content to id-based member linking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the content-shape bullets**

In `README.md`, under "## Content shape", replace:

```markdown
- `members.json`: `email` is the unique id, referenced by
  `projects[].participants`. Email addresses are never rendered or shipped
  to the browser — they're used only at build time to resolve
  participants, and a name-based slug (not the email) is used for any
  generated link/anchor id.
- `projects.json`: `participants` is a list of member emails.
```

with:

```markdown
- `members.json`: `id` (`{lastname-slug}-{firstname-slug}`, e.g.
  `adler-ada`; a numeric suffix like `-2` resolves a same-name collision)
  is the unique id, referenced by `projects[].participants` and used as
  the anchor/link id on the Members and Projects pages. `email` is a
  required contact field, never rendered or shipped to the browser, and
  is not used for linking.
- `projects.json`: `participants` is a list of member `id`s.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README for id-based member/project linking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** schema changes (Task 1), `computeMemberId` rename/reorder (Task 4), rendering code reading stored `id` (Task 4), `content-store.mjs` (Task 2), resolve-content refactor (Task 3), migration script with dry-run default and `--apply` (Task 5), running it against demo content (Task 6), README update (Task 7) — every section of `docs/superpowers/specs/2026-09-29-member-ids-design.md` has a corresponding task.
- **No placeholders:** every step has complete, runnable code — no TBDs.
- **Type/name consistency:** `computeMemberId(firstname, lastname)` (Task 4) is called with the same argument order in `migrate-member-ids.mjs` (Task 5). `content-store.mjs`'s exports (`readContentFile`, `writeContentFile`, `isRemoteContentPath`, `authHeaders`) are named identically everywhere they're imported (Tasks 3 and 5). `member.id` / `participants: string[]` is the consistent shape across schema, rendering code, tests, and the migration script.
