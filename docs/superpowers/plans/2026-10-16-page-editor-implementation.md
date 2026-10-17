# Page Editing in the Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pages" section to the local admin editor (`npm run edit`) so `content/pages/*.md|*.html` files can be listed, opened, edited (via Toast UI Editor), created, and deleted — without hand-editing files on the content share.

**Architecture:** `scripts/lib/content-store.mjs` gains a directory-listing and delete capability (local `readdir`/`unlink`, remote WebDAV `PROPFIND`/`DELETE`). `scripts/edit-server.mjs` exposes this as a new `/api/pages` REST namespace, parallel to the existing `/api/data` one. A new `scripts/editor/pages-view.js` module drives a new "Pages" panel in `scripts/editor/index.html`, using Toast UI Editor (CDN, no bundler) for the actual content editing — Markdown mode for `.md` pages, WYSIWYG mode for `.html` pages.

**Tech Stack:** Node.js (`node --test`), vanilla JS (ES modules, no bundler), Toast UI Editor 3.2.2 (CDN), DataTables 3.1.2 (already in use), jsdom (existing test pattern).

**Builds on:** `docs/superpowers/specs/2026-10-16-page-editor-design.md`.

---

## Task 1: `content-store.mjs` — directory listing and delete

**Files:**
- Modify: `scripts/lib/content-store.mjs`
- Test: `tests/content-store.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/content-store.test.js` (after the existing `import` line, add `readdir` and `mkdir` to the `node:fs/promises` import, and `listContentDir`, `deleteContentFile` to the `content-store.mjs` import):

```js
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
```

```js
import { readContentFile, writeContentFile, deleteContentFile, listContentDir, isRemoteContentPath, authHeaders } from '../scripts/lib/content-store.mjs';
```

Append these tests at the end of the file:

```js
test('listContentDir lists local files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await mkdir(path.join(dir, 'pages'));
  await writeFile(path.join(dir, 'pages', 'about.md'), '# About', 'utf8');
  await writeFile(path.join(dir, 'pages', 'example.html'), '<h1>Example</h1>', 'utf8');
  const names = await listContentDir(dir, 'pages');
  assert.deepEqual(names.sort(), ['about.md', 'example.html']);
  await rm(dir, { recursive: true, force: true });
});

test('listContentDir sends a PROPFIND to a remote directory and extracts filenames from the multistatus response', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/files/user/content/pages/</d:href></d:response>
  <d:response><d:href>/dav/files/user/content/pages/about.md</d:href></d:response>
  <d:response><d:href>/dav/files/user/content/pages/example.html</d:href></d:response>
</d:multistatus>`,
    };
  };
  try {
    const names = await listContentDir('https://example.org/content', 'pages');
    assert.deepEqual(names.sort(), ['about.md', 'example.html']);
    assert.equal(requests[0].url, 'https://example.org/content/pages/');
    assert.equal(requests[0].options.method, 'PROPFIND');
    assert.equal(requests[0].options.headers.Depth, '1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listContentDir handles a multistatus response with no namespace prefix on <href>', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => `<?xml version="1.0"?>
<multistatus xmlns="DAV:">
  <response><href>/content/pages/</href></response>
  <response><href>/content/pages/about.md</href></response>
</multistatus>`,
  });
  try {
    const names = await listContentDir('https://example.org/content', 'pages');
    assert.deepEqual(names, ['about.md']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listContentDir throws a descriptive error on a failed remote PROPFIND', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
  try {
    await assert.rejects(
      () => listContentDir('https://example.org/content', 'pages'),
      /Failed to list https:\/\/example\.org\/content\/pages\/: 404 Not Found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteContentFile removes a local file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-store-'));
  await writeFile(path.join(dir, 'about.md'), '# About', 'utf8');
  await deleteContentFile(dir, 'about.md');
  await assert.rejects(() => readFile(path.join(dir, 'about.md'), 'utf8'));
  await rm(dir, { recursive: true, force: true });
});

test('deleteContentFile DELETEs a remote file', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    await deleteContentFile('https://example.org/content', 'pages/about.md');
    assert.equal(requests[0].url, 'https://example.org/content/pages/about.md');
    assert.equal(requests[0].options.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteContentFile throws a descriptive error on a failed remote DELETE', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
  try {
    await assert.rejects(
      () => deleteContentFile('https://example.org/content', 'pages/about.md'),
      /Failed to delete https:\/\/example\.org\/content\/pages\/about\.md: 403 Forbidden/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeContentFile sends a custom Content-Type when given one', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    await writeContentFile('https://example.org/content', 'pages/about.md', '# About', 'text/markdown');
    assert.equal(requests[0].options.headers['Content-Type'], 'text/markdown');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/content-store.test.js`
Expected: FAIL — `listContentDir`, `deleteContentFile` are not exported functions (`TypeError`), and the new `writeContentFile` test fails because the 4th argument is currently ignored.

- [ ] **Step 3: Implement**

Replace the full contents of `scripts/lib/content-store.mjs` with:

```js
// Reads/writes a single file inside a CONTENT_PATH tree, which is either a
// local directory or a remote http(s) URL (WebDAV). Shared by the build's
// remote-content fetcher and any tool that needs to write content back
// (migration scripts, the local data editor).
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
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
    if (!res.ok) throw Object.assign(new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`), { status: res.status });
    return res.text();
  }
  return readFile(path.join(contentPath, relPath), 'utf8');
}

export async function writeContentFile(contentPath, relPath, content, contentType = 'application/json') {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(
      url,
      { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': contentType }, body: content },
      timeoutOpts()
    );
    if (!res.ok) throw new Error(`Failed to write ${url}: ${res.status} ${res.statusText}`);
    return;
  }
  const fullPath = path.join(contentPath, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

export async function deleteContentFile(contentPath, relPath) {
  if (isRemoteContentPath(contentPath)) {
    const url = remoteUrl(contentPath, relPath);
    const res = await fetchWithTimeout(url, { method: 'DELETE', headers: authHeaders() }, timeoutOpts());
    if (!res.ok) throw new Error(`Failed to delete ${url}: ${res.status} ${res.statusText}`);
    return;
  }
  await unlink(path.join(contentPath, relPath));
}

// Lists the basenames of the files directly inside a content-tree directory
// (no recursion). Remote listing uses WebDAV PROPFIND (Depth: 1); the
// response is a multistatus XML document, which is parsed with a targeted
// regex rather than a full XML parser — the <href> tag's namespace prefix
// varies by server ("d:href", "D:href", or none with a default namespace),
// so the prefix is optional in the pattern. The directory's own self-entry
// (always present, href ending in the directory name itself with a trailing
// slash) is included in the raw list but has no file extension, so callers
// that filter by filename pattern (e.g. isValidDocFilename) drop it naturally.
export async function listContentDir(contentPath, relPath) {
  if (isRemoteContentPath(contentPath)) {
    const dirPath = relPath.replace(/\/+$/, '') + '/';
    const url = remoteUrl(contentPath, dirPath);
    const res = await fetchWithTimeout(
      url,
      { method: 'PROPFIND', headers: { ...authHeaders(), Depth: '1' } },
      timeoutOpts()
    );
    if (!res.ok) throw new Error(`Failed to list ${url}: ${res.status} ${res.statusText}`);
    const text = await res.text();
    const names = new Set();
    for (const match of text.matchAll(/<(?:[^:>]*:)?href>([^<]+)<\/(?:[^:>]*:)?href>/gi)) {
      const decoded = decodeURIComponent(match[1]);
      const basename = decoded.split('/').filter(Boolean).pop();
      if (basename) names.add(basename);
    }
    return [...names];
  }
  return readdir(path.join(contentPath, relPath));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/content-store.test.js`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/content-store.mjs tests/content-store.test.js
git commit -m "feat: add directory listing and delete to content-store"
```

---

## Task 2: `edit-server.mjs` — `/api/pages` routes and static serving

**Files:**
- Modify: `scripts/edit-server.mjs`
- Test: `tests/edit-server.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/edit-server.test.js`, change the `startTestServer` helper to also create the `pages` directory (so pages tests don't need to repeat this), by adding one line after the existing `mkdir(path.join(contentPath, 'data'), ...)` call:

```js
  await mkdir(path.join(contentPath, 'data'), { recursive: true });
  await mkdir(path.join(contentPath, 'pages'), { recursive: true });
```

Append these tests at the end of the file:

```js
test('GET /api/pages lists pages sorted by title, deriving titles from <h1> or the filename', async () => {
  const ctx = await startTestServer({});
  try {
    await writeFile(path.join(ctx.contentPath, 'pages', 'zzz-first.md'), '# A Title\n\nBody text.', 'utf8');
    await writeFile(path.join(ctx.contentPath, 'pages', 'no-heading.html'), '<p>no heading here</p>', 'utf8');
    const res = await fetch(`${ctx.base}/api/pages`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, [
      { filename: 'no-heading.html', type: 'html', title: 'No Heading' },
      { filename: 'zzz-first.md', type: 'markdown', title: 'A Title' },
    ]);
  } finally {
    await ctx.close();
  }
});

test('GET /api/pages/:filename returns the raw source', async () => {
  const ctx = await startTestServer({});
  try {
    await writeFile(path.join(ctx.contentPath, 'pages', 'about.md'), '# About\n\nHello.', 'utf8');
    const res = await fetch(`${ctx.base}/api/pages/about.md`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { filename: 'about.md', type: 'markdown', content: '# About\n\nHello.' });

    assert.equal((await fetch(`${ctx.base}/api/pages/missing.md`)).status, 404);
    assert.equal((await fetch(`${ctx.base}/api/pages/..%2f..%2fetc%2fpasswd`)).status, 404);
  } finally {
    await ctx.close();
  }
});

test('POST /api/pages creates a markdown page by default, slugifying the title', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/api/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Our Team!' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.deepEqual(body, { filename: 'our-team.md', type: 'markdown', content: '# Our Team!\n', title: 'Our Team!' });
    assert.equal(await readFile(path.join(ctx.contentPath, 'pages', 'our-team.md'), 'utf8'), '# Our Team!\n');
  } finally {
    await ctx.close();
  }
});

test('POST /api/pages creates an HTML page when format is "html"', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/api/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Our Team', format: 'html' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.deepEqual(body, { filename: 'our-team.html', type: 'html', content: '<h1>Our Team</h1>\n', title: 'Our Team' });
  } finally {
    await ctx.close();
  }
});

test('POST /api/pages rejects a duplicate filename and a title with no usable slug', async () => {
  const ctx = await startTestServer({});
  try {
    await writeFile(path.join(ctx.contentPath, 'pages', 'our-team.md'), '# Our Team\n', 'utf8');
    const dup = await fetch(`${ctx.base}/api/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Our Team' }),
    });
    assert.equal(dup.status, 409);

    const empty = await fetch(`${ctx.base}/api/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '!!!' }),
    });
    assert.equal(empty.status, 400);
  } finally {
    await ctx.close();
  }
});

test('PUT /api/pages/:filename overwrites the content', async () => {
  const ctx = await startTestServer({});
  try {
    await writeFile(path.join(ctx.contentPath, 'pages', 'about.md'), '# Old', 'utf8');
    const res = await fetch(`${ctx.base}/api/pages/about.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { filename: 'about.md', type: 'markdown', content: '# New' });
    assert.equal(await readFile(path.join(ctx.contentPath, 'pages', 'about.md'), 'utf8'), '# New');

    assert.equal(
      (await fetch(`${ctx.base}/api/pages/about.md`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })).status,
      400
    );
    assert.equal(
      (await fetch(`${ctx.base}/api/pages/not-a-valid-name`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'x' }) })).status,
      404
    );
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/pages/:filename removes the page', async () => {
  const ctx = await startTestServer({});
  try {
    await writeFile(path.join(ctx.contentPath, 'pages', 'about.md'), '# About', 'utf8');
    const res = await fetch(`${ctx.base}/api/pages/about.md`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    await assert.rejects(() => readFile(path.join(ctx.contentPath, 'pages', 'about.md'), 'utf8'));
    assert.equal((await fetch(`${ctx.base}/api/pages/about.md`, { method: 'DELETE' })).status, 404);
  } finally {
    await ctx.close();
  }
});

test('the editor serves shared.js and pages-view.js', async () => {
  const ctx = await startTestServer({});
  try {
    assert.equal((await fetch(`${ctx.base}/assets/js/shared.js`)).status, 200);
    assert.equal((await fetch(`${ctx.base}/pages-view.js`)).status, 200);
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/edit-server.test.js`
Expected: FAIL — every new test gets a 404 (no `/api/pages` route exists yet), and the static-serving test's `shared.js`/`pages-view.js` requests 404.

- [ ] **Step 3: Implement**

In `scripts/edit-server.mjs`, update the imports at the top of the file:

```js
import { readContentFile, writeContentFile, deleteContentFile, listContentDir } from './lib/content-store.mjs';
```

```js
import { computeMemberId, slugify, isValidDocFilename, getDocType, titleFromFilename, escapeHTML } from '../assets/js/shared.js';
```

Add, right after the existing imports:

```js
import { marked } from 'marked';
```

Change the `SHARED_JS` constant:

```js
// Browser modules shared between the public site and the editor.
const SHARED_JS = /^\/assets\/js\/(record-form|shared)\.js$/;
```

Add `'/pages-view.js'` to `STATIC_FILES`:

```js
const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html' },
  '/index.html': { file: 'index.html', type: 'text/html' },
  '/app.js': { file: 'app.js', type: 'text/javascript' },
  '/style.css': { file: 'style.css', type: 'text/css' },
  '/inbox-view.js': { file: 'inbox-view.js', type: 'text/javascript' },
  '/pages-view.js': { file: 'pages-view.js', type: 'text/javascript' },
};
```

Add this helper function near `loadRecords`/`loadSingleton` (same area, since it reads content the same way):

```js
  async function pageTitle(filename) {
    const source = await readContentFile(contentPath, `pages/${filename}`);
    const bodyHTML = getDocType(filename) === 'markdown' ? marked.parse(source) : source;
    const headingMatch = bodyHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
    return headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '') : titleFromFilename(filename);
  }

  async function listPageFilenames() {
    return (await listContentDir(contentPath, 'pages')).filter(isValidDocFilename);
  }
```

In `handleApi`, insert this whole block immediately before the existing `if (parts[1] === 'data' && parts.length >= 3) {` line:

```js
    if (parts[1] === 'pages') {
      if (parts.length === 2 && req.method === 'GET') {
        const filenames = await listPageFilenames();
        const entries = await Promise.all(
          filenames.map(async (filename) => ({ filename, type: getDocType(filename), title: await pageTitle(filename) }))
        );
        entries.sort((a, b) => a.title.localeCompare(b.title));
        return sendJSON(res, 200, entries);
      }

      if (parts.length === 2 && req.method === 'POST') {
        const body = await readJSONBody(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const format = body.format === 'html' ? 'html' : 'markdown';
        const slug = slugify(title);
        if (!slug) return sendError(res, 400, 'Title must contain at least one letter or number.');
        const filename = `${slug}.${format === 'html' ? 'html' : 'md'}`;
        if ((await listPageFilenames()).includes(filename)) {
          return sendError(res, 409, `A page named "${filename}" already exists.`);
        }
        const content = format === 'html' ? `<h1>${escapeHTML(title)}</h1>\n` : `# ${title}\n`;
        await writeContentFile(contentPath, `pages/${filename}`, content, format === 'html' ? 'text/html' : 'text/markdown');
        return sendJSON(res, 201, { filename, type: format, content, title });
      }

      if (parts.length === 3) {
        let filename;
        try {
          filename = decodeURIComponent(parts[2]);
        } catch {
          return sendError(res, 400, 'Malformed filename');
        }
        if (!isValidDocFilename(filename)) return sendError(res, 404, 'Not found');

        if (req.method === 'GET') {
          let content;
          try {
            content = await readContentFile(contentPath, `pages/${filename}`);
          } catch {
            return sendError(res, 404, `No page named "${filename}"`);
          }
          return sendJSON(res, 200, { filename, type: getDocType(filename), content });
        }

        if (req.method === 'PUT') {
          const body = await readJSONBody(req);
          if (typeof body.content !== 'string') return sendError(res, 400, 'content must be a string');
          const type = getDocType(filename);
          await writeContentFile(contentPath, `pages/${filename}`, body.content, type === 'html' ? 'text/html' : 'text/markdown');
          return sendJSON(res, 200, { filename, type, content: body.content });
        }

        if (req.method === 'DELETE') {
          try {
            await deleteContentFile(contentPath, `pages/${filename}`);
          } catch {
            return sendError(res, 404, `No page named "${filename}"`);
          }
          return sendJSON(res, 204, null);
        }
      }
    }

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/edit-server.test.js`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/edit-server.mjs tests/edit-server.test.js
git commit -m "feat: add /api/pages CRUD routes to the edit server"
```

---

## Task 3: `scripts/editor/pages-view.js` — the Pages panel controller

**Files:**
- Create: `scripts/editor/pages-view.js`
- Test: `tests/pages-view.test.js`

**Context for the engineer:** this module is loaded as an ES module by `scripts/editor/app.js` (added in Task 5) and talks to the `/api/pages` routes added in Task 2. It renders a page list using the `DataTable` global (from the DataTables CDN script, already loaded elsewhere in `index.html`) and mounts a `toastui.Editor` (from the Toast UI Editor CDN script, added in Task 4) to edit one page at a time. Both of those are real browser globals with no Node/jsdom equivalent, so — exactly like the rest of this module — the constructors are injectable (`DataTableCtor`, `EditorCtor`), defaulting to the real globals, so tests can supply lightweight stubs instead. This mirrors the dependency-injection style already used by `assets/js/edit-page.js` (`fetchFn`, `postFn`).

It expects the following elements to already exist in the document (added to `scripts/editor/index.html` in Task 4):
`#pages-nav-link`, `#type-panel`, `#form-panel`, `#pages-panel`, `#pages-new-button`, `#pages-loading`, `#pages-load-error`, `#pages-table` (with empty `<thead>`/`<tbody>`), `#page-new-panel`, `#page-new-error`, `#page-new-form`, `#page-new-title`, `#page-new-format`, `#page-new-cancel`, `#page-editor-panel`, `#page-editor-title`, `#page-save-button`, `#page-delete-button`, `#page-editor-close`, `#page-html-notice`, `#page-editor-message`, `#page-editor-error`, `#page-editor-host`.

- [ ] **Step 1: Write the failing tests**

Create `tests/pages-view.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initPagesView, hidePagesPanels } from '../scripts/editor/pages-view.js';

const PAGE_HTML = `
<a href="#" id="pages-nav-link">Pages</a>
<div id="type-panel"></div>
<div id="form-panel"></div>

<section id="pages-panel" hidden>
  <button id="pages-new-button" type="button">New</button>
  <div id="pages-loading" hidden></div>
  <div id="pages-load-error" hidden></div>
  <table id="pages-table"><thead></thead><tbody></tbody></table>
</section>

<div id="page-new-panel" hidden>
  <div id="page-new-error" hidden></div>
  <form id="page-new-form">
    <input id="page-new-title">
    <select id="page-new-format">
      <option value="markdown" selected>Markdown</option>
      <option value="html">HTML</option>
    </select>
    <button id="page-new-cancel" type="button">Cancel</button>
  </form>
</div>

<section id="page-editor-panel" hidden>
  <h1 id="page-editor-title"></h1>
  <button id="page-save-button" type="button">Save</button>
  <button id="page-delete-button" type="button">Delete</button>
  <button id="page-editor-close" type="button">Close</button>
  <p id="page-html-notice" hidden></p>
  <div id="page-editor-message" hidden></div>
  <div id="page-editor-error" hidden></div>
  <div id="page-editor-host"></div>
</section>
`;

class StubDataTable {
  constructor(selector, options) {
    this.selector = selector;
    this.options = options;
  }
  destroy() {}
}

let lastEditor;
class StubEditor {
  constructor(options) {
    this.options = options;
    this.value = options.initialValue ?? '';
    lastEditor = this;
  }
  setHTML(html) { this.value = html; }
  getHTML() { return this.value; }
  getMarkdown() { return this.value; }
  destroy() {}
}

function setup({ fetchFn, confirmFn = () => true, alertFn = () => {} } = {}) {
  const dom = new JSDOM(PAGE_HTML);
  const doc = dom.window.document;
  initPagesView({ doc, fetchFn, confirmFn, alertFn, DataTableCtor: StubDataTable, EditorCtor: StubEditor });
  return { dom, doc };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('clicking the Pages nav link hides the type panels and loads the list', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('type-panel').hidden = false;
  doc.getElementById('form-panel').hidden = false;

  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('type-panel').hidden, true);
  assert.equal(doc.getElementById('form-panel').hidden, true);
  assert.equal(doc.getElementById('pages-panel').hidden, false);
  assert.deepEqual(calls, ['/api/pages']);
  assert.equal(doc.querySelector('#pages-table tbody tr td').textContent, 'About');
});

test('a load error is shown and the list stays hidden', async () => {
  const fetchFn = async () => jsonResponse({ error: 'offline' }, 500);
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(doc.getElementById('pages-load-error').textContent, /offline/);
  assert.equal(doc.getElementById('pages-load-error').hidden, false);
});

test('clicking a row opens it in the editor with the loaded content', async () => {
  const fetchFn = async (url) => {
    if (url === '/api/pages') return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    if (url === '/api/pages/about.md') return jsonResponse({ filename: 'about.md', type: 'markdown', content: '# About' });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('page-editor-panel').hidden, false);
  assert.equal(doc.getElementById('pages-panel').hidden, true);
  assert.equal(doc.getElementById('page-editor-title').textContent, 'about.md');
  assert.equal(doc.getElementById('page-html-notice').hidden, true);
  assert.equal(lastEditor.options.initialEditType, 'markdown');
  assert.equal(lastEditor.value, '# About');
});

test('opening an html page mounts the editor in wysiwyg mode via setHTML and shows the fidelity notice', async () => {
  const fetchFn = async (url) => {
    if (url === '/api/pages') return jsonResponse([{ filename: 'example.html', type: 'html', title: 'Example' }]);
    if (url === '/api/pages/example.html') return jsonResponse({ filename: 'example.html', type: 'html', content: '<h1>Example</h1>' });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(lastEditor.options.initialEditType, 'wysiwyg');
  assert.equal(lastEditor.value, '<h1>Example</h1>');
  assert.equal(doc.getElementById('page-html-notice').hidden, false);
});

test('saving a markdown page PUTs getMarkdown() and shows a confirmation', async () => {
  const puts = [];
  const fetchFn = async (url, options) => {
    if (url === '/api/pages') return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    if (url === '/api/pages/about.md' && (!options || options.method === undefined)) {
      return jsonResponse({ filename: 'about.md', type: 'markdown', content: '# About' });
    }
    if (url === '/api/pages/about.md' && options.method === 'PUT') {
      puts.push(JSON.parse(options.body));
      return jsonResponse({ filename: 'about.md', type: 'markdown', content: JSON.parse(options.body).content });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  lastEditor.value = '# About\n\nEdited.';
  doc.getElementById('page-save-button').dispatchEvent(new doc.defaultView.Event('click'));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(puts, [{ content: '# About\n\nEdited.' }]);
  assert.match(doc.getElementById('page-editor-message').textContent, /Saved/);
});

test('deleting a page from the list asks for confirmation and removes the row', async () => {
  const deletes = [];
  let confirmed = false;
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse(
        confirmed
          ? []
          : [{ filename: 'about.md', type: 'markdown', title: 'About' }]
      );
    }
    if (url === '/api/pages/about.md' && options?.method === 'DELETE') {
      deletes.push(url);
      confirmed = true;
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const confirmCalls = [];
  const confirmFn = (message) => {
    confirmCalls.push(message);
    return true;
  };
  const { doc } = setup({ fetchFn, confirmFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.querySelector('#pages-table tbody button[data-action="delete"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(confirmCalls.length, 1);
  assert.deepEqual(deletes, ['/api/pages/about.md']);
  assert.equal(doc.querySelectorAll('#pages-table tbody tr').length, 0);
});

test('declining the confirmation does not delete', async () => {
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn, confirmFn: () => false });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody button[data-action="delete"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(doc.querySelectorAll('#pages-table tbody tr').length, 1);
});

test('creating a new page posts title and format, then opens the created page', async () => {
  const posts = [];
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) return jsonResponse([]);
    if (url === '/api/pages' && options.method === 'POST') {
      posts.push(JSON.parse(options.body));
      return jsonResponse({ filename: 'our-team.html', type: 'html', content: '<h1>Our Team</h1>\n', title: 'Our Team' }, 201);
    }
    if (url === '/api/pages/our-team.html') return jsonResponse({ filename: 'our-team.html', type: 'html', content: '<h1>Our Team</h1>\n' });
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.getElementById('pages-new-button').dispatchEvent(new doc.defaultView.Event('click'));
  assert.equal(doc.getElementById('page-new-panel').hidden, false);

  doc.getElementById('page-new-title').value = 'Our Team';
  doc.getElementById('page-new-format').value = 'html';
  doc.getElementById('page-new-form').dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(posts, [{ title: 'Our Team', format: 'html' }]);
  assert.equal(doc.getElementById('page-editor-panel').hidden, false);
  assert.equal(doc.getElementById('page-editor-title').textContent, 'our-team.html');
});

test('a failing create shows the error without leaving the new-page form', async () => {
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) return jsonResponse([]);
    if (url === '/api/pages' && options.method === 'POST') return jsonResponse({ error: 'A page named "x.md" already exists.' }, 409);
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.getElementById('pages-new-button').dispatchEvent(new doc.defaultView.Event('click'));
  doc.getElementById('page-new-title').value = 'x';
  doc.getElementById('page-new-form').dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('page-new-panel').hidden, false);
  assert.match(doc.getElementById('page-new-error').textContent, /already exists/);
});

test('hidePagesPanels hides all three pages panels', () => {
  const dom = new JSDOM(PAGE_HTML);
  const doc = dom.window.document;
  doc.getElementById('pages-panel').hidden = false;
  doc.getElementById('page-new-panel').hidden = false;
  doc.getElementById('page-editor-panel').hidden = false;
  hidePagesPanels(doc);
  assert.equal(doc.getElementById('pages-panel').hidden, true);
  assert.equal(doc.getElementById('page-new-panel').hidden, true);
  assert.equal(doc.getElementById('page-editor-panel').hidden, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pages-view.test.js`
Expected: FAIL — `../scripts/editor/pages-view.js` does not exist yet (module not found).

- [ ] **Step 3: Implement**

Create `scripts/editor/pages-view.js`:

```js
import { escapeHTML } from '../../assets/js/shared.js';

export function hidePagesPanels(doc = document) {
  doc.getElementById('pages-panel').hidden = true;
  doc.getElementById('page-new-panel').hidden = true;
  doc.getElementById('page-editor-panel').hidden = true;
}

export function initPagesView({
  doc = document,
  fetchFn = (...args) => fetch(...args),
  confirmFn = (message) => confirm(message),
  alertFn = (message) => alert(message),
  DataTableCtor = globalThis.DataTable,
  EditorCtor = globalThis.toastui?.Editor,
} = {}) {
  const state = { current: null, editor: null };
  let pagesDataTable = null;

  async function fetchJSON(url, options) {
    const res = await fetchFn(url, options);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.error || `Request failed: ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return body;
  }

  const typePanel = () => doc.getElementById('type-panel');
  const formPanel = () => doc.getElementById('form-panel');
  const pagesPanel = doc.getElementById('pages-panel');
  const newPanel = doc.getElementById('page-new-panel');
  const editorPanel = doc.getElementById('page-editor-panel');

  function showList() {
    typePanel().hidden = true;
    formPanel().hidden = true;
    newPanel.hidden = true;
    editorPanel.hidden = true;
    pagesPanel.hidden = false;
  }

  function destroyEditor() {
    if (state.editor) {
      state.editor.destroy();
      state.editor = null;
    }
  }

  async function loadList() {
    const loading = doc.getElementById('pages-loading');
    const errorBox = doc.getElementById('pages-load-error');
    errorBox.hidden = true;
    loading.hidden = false;
    let pages;
    try {
      pages = await fetchJSON('/api/pages');
    } catch (err) {
      loading.hidden = true;
      errorBox.textContent = `Could not load pages: ${err.message}`;
      errorBox.hidden = false;
      return;
    }
    loading.hidden = true;
    renderList(pages);
  }

  function renderList(pages) {
    if (pagesDataTable) {
      pagesDataTable.destroy();
      pagesDataTable = null;
    }
    doc.querySelector('#pages-table thead').innerHTML = '<tr><th>Title</th><th>Filename</th><th>Type</th><th>Actions</th></tr>';
    const tbody = doc.querySelector('#pages-table tbody');
    tbody.innerHTML = pages
      .map(
        (page) => `<tr data-filename="${escapeHTML(page.filename)}">
          <td>${escapeHTML(page.title)}</td>
          <td>${escapeHTML(page.filename)}</td>
          <td>${escapeHTML(page.type)}</td>
          <td class="row-actions"><button type="button" data-action="delete" data-filename="${escapeHTML(page.filename)}">Delete</button></td>
        </tr>`
      )
      .join('');
    pagesDataTable = new DataTableCtor('#pages-table', {
      paging: false,
      order: [[0, 'asc']],
      columnDefs: [{ targets: -1, orderable: false, searchable: false }],
    });
  }

  function showEditorMessage(text) {
    const el = doc.getElementById('page-editor-message');
    el.textContent = text;
    el.hidden = !text;
  }

  function showEditorError(text) {
    const el = doc.getElementById('page-editor-error');
    el.textContent = text;
    el.hidden = !text;
  }

  function mountEditor(page) {
    destroyEditor();
    state.current = page;
    doc.getElementById('page-editor-title').textContent = page.filename;
    doc.getElementById('page-html-notice').hidden = page.type !== 'html';
    showEditorMessage('');
    showEditorError('');
    const host = doc.getElementById('page-editor-host');
    host.innerHTML = '';
    if (page.type === 'html') {
      state.editor = new EditorCtor({ el: host, initialEditType: 'wysiwyg', height: '480px' });
      state.editor.setHTML(page.content);
    } else {
      state.editor = new EditorCtor({ el: host, initialEditType: 'markdown', previewStyle: 'vertical', height: '480px', initialValue: page.content });
    }
  }

  async function openPage(filename) {
    typePanel().hidden = true;
    formPanel().hidden = true;
    pagesPanel.hidden = true;
    newPanel.hidden = true;
    editorPanel.hidden = false;
    let page;
    try {
      page = await fetchJSON(`/api/pages/${encodeURIComponent(filename)}`);
    } catch (err) {
      showEditorError(err.message);
      return;
    }
    mountEditor(page);
  }

  async function savePage() {
    if (!state.current || !state.editor) return;
    const content = state.current.type === 'html' ? state.editor.getHTML() : state.editor.getMarkdown();
    try {
      const updated = await fetchJSON(`/api/pages/${encodeURIComponent(state.current.filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      state.current = updated;
      showEditorMessage('Saved.');
    } catch (err) {
      showEditorError(err.message);
    }
  }

  async function deletePage(filename) {
    if (!confirmFn(`Delete the page "${filename}"?`)) return;
    try {
      await fetchJSON(`/api/pages/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    } catch (err) {
      alertFn(err.message);
      return;
    }
    if (state.current && state.current.filename === filename) {
      destroyEditor();
      editorPanel.hidden = true;
      pagesPanel.hidden = false;
    }
    await loadList();
  }

  doc.getElementById('pages-nav-link').addEventListener('click', (e) => {
    e.preventDefault();
    showList();
    loadList();
  });

  doc.querySelector('#pages-table tbody').addEventListener('click', (e) => {
    const deleteButton = e.target.closest('button[data-action="delete"]');
    if (deleteButton) {
      e.stopPropagation();
      deletePage(deleteButton.dataset.filename);
      return;
    }
    const row = e.target.closest('tr[data-filename]');
    if (row) openPage(row.dataset.filename);
  });

  doc.getElementById('pages-new-button').addEventListener('click', () => {
    pagesPanel.hidden = true;
    newPanel.hidden = false;
    doc.getElementById('page-new-error').hidden = true;
    doc.getElementById('page-new-form').reset();
  });

  doc.getElementById('page-new-cancel').addEventListener('click', () => {
    newPanel.hidden = true;
    pagesPanel.hidden = false;
  });

  doc.getElementById('page-new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = doc.getElementById('page-new-title').value.trim();
    const format = doc.getElementById('page-new-format').value;
    const errorBox = doc.getElementById('page-new-error');
    errorBox.hidden = true;
    let page;
    try {
      page = await fetchJSON('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, format }),
      });
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      return;
    }
    newPanel.hidden = true;
    await openPage(page.filename);
  });

  doc.getElementById('page-save-button').addEventListener('click', savePage);
  doc.getElementById('page-delete-button').addEventListener('click', () => {
    if (state.current) deletePage(state.current.filename);
  });
  doc.getElementById('page-editor-close').addEventListener('click', () => {
    destroyEditor();
    editorPanel.hidden = true;
    pagesPanel.hidden = false;
    loadList();
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/pages-view.test.js`
Expected: PASS.

The relative import path (`../../assets/js/shared.js`, from `scripts/editor/pages-view.js` up to the project root and into `assets/js/shared.js`) resolves correctly both ways: under Node it's a real filesystem path, and in the browser, `pages-view.js` is served at the server root (`http://127.0.0.1:4848/pages-view.js`, per `STATIC_FILES` in Task 2), so a `<script type="module">`'s relative specifier resolution turns `../../assets/js/shared.js` into `http://127.0.0.1:4848/assets/js/shared.js` (extra `..` segments above the root are simply dropped per URL resolution rules) — exactly the path Task 2's updated `SHARED_JS` regex serves.

- [ ] **Step 5: Commit**

```bash
git add scripts/editor/pages-view.js tests/pages-view.test.js
git commit -m "feat: add the Pages panel controller module"
```

---

## Task 4: `scripts/editor/index.html` and `style.css` — markup and styling

**Files:**
- Modify: `scripts/editor/index.html`
- Modify: `scripts/editor/style.css`

- [ ] **Step 1: Add the Toast UI Editor CDN stylesheet**

In `scripts/editor/index.html`, add this line right after the existing DataTables stylesheet `<link>` in `<head>`:

```html
<link rel="stylesheet" href="https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css">
```

- [ ] **Step 2: Add the Pages nav link**

Add this markup right after the existing `<nav id="type-nav" class="type-nav"></nav>` line, still inside `.sidebar` and before `<div class="sidebar-tools">`:

```html
    <nav class="type-nav">
      <a href="#pages" id="pages-nav-link">Pages</a>
    </nav>
```

- [ ] **Step 3: Give the existing type panel an id**

Change the opening tag of the existing (unmodified otherwise) table panel from:

```html
    <div class="table-panel">
```

to:

```html
    <div id="type-panel" class="table-panel">
```

- [ ] **Step 4: Add the Pages panels**

Add this markup inside `<main class="main">`, right after the existing `<div id="form-panel" ...>...</div>` block's closing `</div>` and before the closing `</main>` tag:

```html
    <section id="pages-panel" class="table-panel" hidden>
      <div class="table-header">
        <h1>Pages</h1>
        <button id="pages-new-button" type="button">New</button>
      </div>
      <div id="pages-loading" class="loading" hidden role="status">Loading pages…</div>
      <div id="pages-load-error" class="form-error" hidden role="alert"></div>
      <div id="pages-table-body"><table id="pages-table"><thead></thead><tbody></tbody></table></div>
    </section>

    <div id="page-new-panel" class="form-panel" hidden>
      <h2>New page</h2>
      <div id="page-new-error" class="form-error" hidden></div>
      <form id="page-new-form">
        <div class="field">
          <label for="page-new-title">Title</label>
          <input type="text" id="page-new-title" name="title" required>
        </div>
        <div class="field">
          <label for="page-new-format">Format</label>
          <select id="page-new-format" name="format">
            <option value="markdown" selected>Markdown</option>
            <option value="html">HTML</option>
          </select>
        </div>
        <div class="field">
          <button type="submit">Create</button>
          <button type="button" id="page-new-cancel">Cancel</button>
        </div>
      </form>
    </div>

    <section id="page-editor-panel" class="table-panel" hidden>
      <div class="table-header">
        <h1 id="page-editor-title"></h1>
        <div>
          <button id="page-save-button" type="button">Save</button>
          <button id="page-delete-button" type="button">Delete</button>
          <button id="page-editor-close" type="button">Close</button>
        </div>
      </div>
      <p id="page-html-notice" class="inbox-warning" hidden>
        This page is raw HTML. Saving normalizes its markup to what the editor can represent — custom classes, embeds, or unusual nesting may be simplified.
      </p>
      <div id="page-editor-message" class="form-message" hidden role="status"></div>
      <div id="page-editor-error" class="form-error" hidden role="alert"></div>
      <div id="page-editor-host"></div>
    </section>
```

- [ ] **Step 5: Add the Toast UI Editor CDN script**

Add this line right after the existing `<script src="https://cdn.datatables.net/v/dt/dt-3.1.2/datatables.min.js"></script>` line, still before `<script type="module" src="app.js"></script>` (same reasoning as the DataTables script: a classic script runs before a deferred module script, so the `toastui` global exists before `app.js`/`pages-view.js` run):

```html
<script src="https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js"></script>
```

- [ ] **Step 6: Add editor-host sizing to `style.css`**

Append to `scripts/editor/style.css`:

```css
#page-editor-host { min-height: 480px; margin-top: 1rem; }
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS (this task touches no files any test imports directly, so nothing should change, but confirm no accidental breakage).

- [ ] **Step 8: Commit**

```bash
git add scripts/editor/index.html scripts/editor/style.css
git commit -m "feat: add Pages panel markup and Toast UI Editor assets to the editor shell"
```

---

## Task 5: `scripts/editor/app.js` — wire the Pages panel into the nav

**Files:**
- Modify: `scripts/editor/app.js`

- [ ] **Step 1: Import the new module**

Add to the top of `scripts/editor/app.js`, after the existing `import { renderInboxEntries } from '/inbox-view.js';` line:

```js
import { initPagesView, hidePagesPanels } from '/pages-view.js';
```

- [ ] **Step 2: Hide the Pages panels when a schema type is selected**

In the `loadTypes()` function, the nav click handler currently reads:

```js
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-type]');
    if (!a) return;
    e.preventDefault();
    selectType(a.dataset.type);
  });
```

Change it to:

```js
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-type]');
    if (!a) return;
    e.preventDefault();
    hidePagesPanels();
    selectType(a.dataset.type);
  });
```

- [ ] **Step 3: Make sure the type panel is shown again after being hidden by Pages**

In `selectType()`, the function currently starts with:

```js
async function selectType(name) {
  state.currentType = state.types.find((t) => t.name === name);
  document.querySelectorAll('#type-nav a').forEach((a) => a.classList.toggle('active', a.dataset.type === name));
  document.getElementById('type-title').textContent = name;
  document.getElementById('load-error').hidden = true;
  document.getElementById('table-body').hidden = true;
  document.getElementById('new-button').hidden = true;
  document.getElementById('form-panel').hidden = true;
```

Add one line so the outer panel (hidden by `hidePagesPanels`'s sibling toggle in `pages-view.js`, not by `hidePagesPanels` itself, but by `pages-view.js`'s own `showList()`/`openPage()`) is always visible again once a schema type is chosen:

```js
async function selectType(name) {
  state.currentType = state.types.find((t) => t.name === name);
  document.getElementById('type-panel').hidden = false;
  document.querySelectorAll('#type-nav a').forEach((a) => a.classList.toggle('active', a.dataset.type === name));
  document.getElementById('type-title').textContent = name;
  document.getElementById('load-error').hidden = true;
  document.getElementById('table-body').hidden = true;
  document.getElementById('new-button').hidden = true;
  document.getElementById('form-panel').hidden = true;
```

- [ ] **Step 4: Boot the Pages view**

Add this as the new last line of the file, after the existing `loadTypes().then(...)` block:

```js
initPagesView();
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (`app.js` has no dedicated test file, same as before this change — this is a sanity check that nothing else regressed).

- [ ] **Step 6: Commit**

```bash
git add scripts/editor/app.js
git commit -m "feat: wire the Pages panel into the editor's nav and type switching"
```

---

## Task 6: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS, every test file including the three touched/added in this plan.

- [ ] **Step 2: Run the editor locally against the repo's own `content/` folder**

Run: `CONTENT_PATH=./content npm run edit`
Expected: opens a browser at `http://127.0.0.1:4848`. Manually verify:
- A "Pages" link appears in the left nav, below the schema type links.
- Clicking it shows a list containing "About" (from `content/pages/about.md`) and "Example Html Content Page" (from `content/pages/example.html`, titled from its own `<h1>`).
- Clicking the "About" row opens Toast UI Editor in Markdown mode with the file's actual content.
- Clicking the "Example Html Content Page" row opens Toast UI Editor in WYSIWYG mode, showing the fidelity notice.
- Edit and Save a page, then reload the editor and confirm the change persisted in `content/pages/`.
- Use "New", create a page, confirm it's created with the right filename (slugified title + extension) and opens immediately.
- Delete that new page and confirm it disappears from both the list and `content/pages/`.
- Click back to a schema type (e.g. "members") and confirm its table/form reappear correctly (the Pages panels and the schema panel never show at the same time).

- [ ] **Step 3: Stop the editor**

Stop the `npm run edit` process (Ctrl-C). No commit for this task — it's verification only.

---

## Out of scope (see the design doc for the full list)

- Adding pages to the public ntfy-inbox submission flow.
- Renaming a page or converting it between markdown/HTML after creation.
- Any locking/conflict handling beyond this tool's existing single-admin assumption.
- Self-hosting Toast UI Editor via npm instead of the CDN.
