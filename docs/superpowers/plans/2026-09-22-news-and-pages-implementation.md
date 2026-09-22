# News and Pages Content Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a News section (works like Events, teased on the landing page) and a generic Pages content viewer (`pages.html?doc=<file>`, rendering Markdown via marked.js or raw HTML from `pages/`) to the already-implemented RCSL WG Histories site, per the spec update in `docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`.

**Architecture:** Same patterns as the rest of the site: plain ES modules with pure/testable functions at the top and a guarded DOM bootstrap at the bottom, `node --test` for pure logic, manual smoke-testing for DOM/CDN-library rendering. One new CDN dependency (marked.js), scoped to `pages.html` only, same as D3 is scoped to `projects.html` only.

**Tech Stack:** Same as the rest of the site — HTML5, CSS3, vanilla ES modules, `node --test`, `npx ajv-cli`, plus [marked](https://marked.js.org/) (CDN) for Markdown rendering.

## Global Constraints

- No backend, no database, no build step/bundler/framework. (spec: Architecture)
- `news.json` has the same shape and sort order as `events.json`: `{date, title, url}[]`, sorted by `date` descending (newest first). All three fields required. (spec: `data/news.json`)
- `news.json`'s `url` may be an absolute `http(s)://` URL (external, opens in a new tab with `target="_blank" rel="noopener"`) or a relative link into the Pages viewer (internal, opens in the same tab, no target attribute). Decide which by checking whether `url` starts with `http`. (spec: `data/news.json`, News page)
- Landing page shows the 3 most recent news items (date + linked title) plus a "See all news →" link to `news.html`. Rendered client-side from `news.json` — no news content hardcoded into `index.html`. (spec: Pages → Landing page, item 7)
- `pages.html` is reached only via links (e.g. from News) — it is deliberately NOT added to the main nav (`shared.js`'s `NAV_LINKS`), since it's a generic viewer, not a fixed section. (spec: Pages → Landing page, item 1)
- `pages.html?doc=<filename>` fetches `pages/<filename>`: `.html` files are injected via `innerHTML` directly (untouched); `.md` files are parsed with marked.js then injected via `innerHTML`. Any other extension, or a missing/unreadable file, or a missing `doc` param, shows an error/empty state, never a blank screen. (spec: Pages content viewer)
- The `doc` query-param value must be validated against a filename allowlist (letters, digits, hyphens, underscores, a single dot before the extension `.md` or `.html`, no `/`) before being used in the fetch path. (spec: Pages content viewer, "`doc` parameter safety")
- Documents under `pages/` are maintainer-authored, same trust model as `data/*.json` and `index.html`'s own hardcoded markup — they are intentionally rendered **unescaped**. This is the one deliberate exception to the data-field HTML-escaping rule established in the rest of the site (`escapeHTML` from `shared.js`), which applies to individual data-file field values, not to whole documents meant to contain rich HTML. (spec: Pages content viewer "Trust model", Error handling & edge cases)
- CI's `validate` stage must also validate `data/news.json` against its schema, and the `pages` stage must include `news.html`, `pages.html`, and the `pages/` directory in what gets copied to `public/`. (spec: Deployment & CI)
- Every new/modified JS module keeps pure, unit-testable logic in exported functions at the top, and a DOM bootstrap at the bottom guarded by `typeof document !== 'undefined' && document.getElementById(...)`, matching every existing page module in this codebase.

---

## File Structure

```
/
├── index.html                  # Modify (Task 2): add News section + script tag
├── news.html                   # Create (Task 2)
├── pages.html                  # Create (Task 3)
├── data/
│   ├── news.json               # Create (Task 1) — fake data
│   └── schema/
│       └── news.schema.json    # Create (Task 1)
├── pages/
│   ├── about.md                # Create (Task 3) — example Markdown doc
│   └── example.html            # Create (Task 3) — example HTML doc
├── assets/
│   ├── css/style.css           # Modify (Task 2): news styles; Modify (Task 3): page-content styles
│   └── js/
│       ├── shared.js           # Modify (Task 1): add News to NAV_LINKS
│       ├── news.js             # Create (Task 2)
│       └── pages.js            # Create (Task 3)
├── tests/
│   ├── news.test.js            # Create (Task 2)
│   └── pages.test.js           # Create (Task 3)
├── package.json                 # Modify (Task 1): add validate:news script
├── .gitlab-ci.yml               # Modify (Task 4)
└── README.md                    # Modify (Task 4)
```

---

### Task 1: News data, schema, shared nav, and validation wiring

**Files:**
- Create: `data/schema/news.schema.json`
- Create: `data/news.json`
- Modify: `assets/js/shared.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing new (extends existing `shared.js` `NAV_LINKS` array and `package.json` scripts).
- Produces: `data/news.json` (fetched by Task 2's `news.js`), `data/schema/news.schema.json` (used by CI and `npm run validate`), an updated `NAV_LINKS` in `shared.js` including a News entry.

- [ ] **Step 1: Create `data/schema/news.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "News",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["date", "title", "url"],
    "properties": {
      "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
      "title": { "type": "string", "minLength": 1 },
      "url": { "type": "string", "pattern": "^(https?://[^\\s\"'<>]+|[^\\s\"'<>:]+)$" }
    }
  }
}
```

The `url` pattern accepts either an absolute `http(s)://` URL (external) or any relative string with no whitespace, quotes, angle brackets, or colon (internal — the missing colon rules out `javascript:`/`data:` URLs while still allowing relative paths with query strings like `pages.html?doc=about.md`).

- [ ] **Step 2: Create fake `data/news.json`**

```json
[
  {
    "date": "2026-09-04",
    "title": "Working Group approved as an official RCSL Working Group",
    "url": "https://example.org/news/wg-approved"
  },
  {
    "date": "2026-07-15",
    "title": "New page: how the Working Group got started",
    "url": "pages.html?doc=about.md"
  },
  {
    "date": "2026-05-02",
    "title": "Call for participation: Oral History Archive project",
    "url": "https://example.org/news/oral-history-call"
  },
  {
    "date": "2026-02-20",
    "title": "Website proof of concept launched",
    "url": "pages.html?doc=example.html"
  }
]
```

Note: 4 entries (not 3), deliberately, so the landing page's "3 most recent" teaser differs from the full News page's list — this makes the "last 3" behavior actually observable when testing. Entries are not pre-sorted, same as `events.json`, to exercise the render-time sort.

- [ ] **Step 3: Add News to `assets/js/shared.js`'s `NAV_LINKS`**

Find the `NAV_LINKS` array in `assets/js/shared.js`:

```js
const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'members.html', label: 'Members', page: 'members' },
  { href: 'projects.html', label: 'Projects', page: 'projects' },
  { href: 'events.html', label: 'Events', page: 'events' },
];
```

Change it to:

```js
const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'members.html', label: 'Members', page: 'members' },
  { href: 'projects.html', label: 'Projects', page: 'projects' },
  { href: 'events.html', label: 'Events', page: 'events' },
  { href: 'news.html', label: 'News', page: 'news' },
];
```

Do not add a `pages.html` entry — the Pages viewer is deliberately not in the main nav (see Global Constraints).

- [ ] **Step 4: Re-run the existing shared.js tests to confirm nothing broke**

Run: `node --test tests/shared.test.js`
Expected: still 6/6 passing (no existing test asserts the exact contents of `NAV_LINKS`, only that `'members'` gets marked active and `'nonexistent'` does not — both still true with a 5th link added).

- [ ] **Step 5: Add a `validate:news` script to `package.json`**

Find the `scripts` block in `package.json`:

```json
  "scripts": {
    "test": "node --test tests/*.test.js",
    "validate:members": "npx --yes ajv-cli validate -s data/schema/members.schema.json -d data/members.json",
    "validate:projects": "npx --yes ajv-cli validate -s data/schema/projects.schema.json -d data/projects.json",
    "validate:events": "npx --yes ajv-cli validate -s data/schema/events.schema.json -d data/events.json",
    "validate": "npm run validate:members && npm run validate:projects && npm run validate:events"
  }
```

Change it to:

```json
  "scripts": {
    "test": "node --test tests/*.test.js",
    "validate:members": "npx --yes ajv-cli validate -s data/schema/members.schema.json -d data/members.json",
    "validate:projects": "npx --yes ajv-cli validate -s data/schema/projects.schema.json -d data/projects.json",
    "validate:events": "npx --yes ajv-cli validate -s data/schema/events.schema.json -d data/events.json",
    "validate:news": "npx --yes ajv-cli validate -s data/schema/news.schema.json -d data/news.json",
    "validate": "npm run validate:members && npm run validate:projects && npm run validate:events && npm run validate:news"
  }
```

(If the exact current content of `package.json`'s `scripts` block differs slightly from what's shown above — e.g. from later fixes — preserve whatever is already there and add only the `validate:news` line plus the `&& npm run validate:news` chain addition.)

- [ ] **Step 6: Validate the new data file**

Run: `npm run validate:news`
Expected: `data/news.json valid` (exit code 0).

- [ ] **Step 7: Commit**

```bash
git add data/schema/news.schema.json data/news.json assets/js/shared.js package.json
git commit -m "Add news data, schema, and nav entry"
```

---

### Task 2: News page and landing page teaser

**Files:**
- Create: `assets/js/news.js`
- Create: `tests/news.test.js`
- Create: `news.html`
- Modify: `index.html`
- Modify: `assets/css/style.css`

**Interfaces:**
- Consumes: `shared.js`'s `fetchJSON`, `initNav`, `escapeHTML`.
- Produces: `sortNewsByDateDesc(items): array`, `isExternalLink(url): boolean`, `renderNewsItem(item): string`, `renderNews(items, container): void`, `renderNewsTeaser(items, container): void`. Nothing later depends on these directly (Task 3 is independent), but `index.html` now depends on `news.js`'s bootstrap rendering into `#news-teaser`.

- [ ] **Step 1: Write `assets/js/news.js`**

```js
import { fetchJSON, initNav, escapeHTML } from './shared.js';

export function sortNewsByDateDesc(items) {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function isExternalLink(url) {
  return /^https?:\/\//i.test(url);
}

export function renderNewsItem(item) {
  const external = isExternalLink(item.url);
  const attrs = external ? ' target="_blank" rel="noopener"' : '';
  return `<li class="news-item"><span class="news-date">${escapeHTML(item.date)}</span><a href="${escapeHTML(item.url)}"${attrs}>${escapeHTML(item.title)}</a></li>`;
}

export function renderNews(items, container) {
  const sorted = sortNewsByDateDesc(items);
  container.innerHTML = sorted.length
    ? `<ul class="news-list">${sorted.map(renderNewsItem).join('')}</ul>`
    : '<p class="empty-state">No news yet.</p>';
}

export function renderNewsTeaser(items, container) {
  const sorted = sortNewsByDateDesc(items).slice(0, 3);
  container.innerHTML = sorted.length
    ? `<ul class="news-list">${sorted.map(renderNewsItem).join('')}</ul><p><a href="news.html">See all news &rarr;</a></p>`
    : '<p class="empty-state">No news yet.</p>';
}

if (typeof document !== 'undefined') {
  const newsList = document.getElementById('news-list');
  if (newsList) {
    initNav('news');
    fetchJSON('data/news.json')
      .then((items) => renderNews(items, newsList))
      .catch((err) => {
        newsList.innerHTML = '<p class="error-state">Couldn\'t load news.</p>';
        console.error(err);
      });
  }

  const newsTeaser = document.getElementById('news-teaser');
  if (newsTeaser) {
    fetchJSON('data/news.json')
      .then((items) => renderNewsTeaser(items, newsTeaser))
      .catch((err) => {
        newsTeaser.innerHTML = '<p class="error-state">Couldn\'t load news.</p>';
        console.error(err);
      });
  }
}
```

Note both bootstrap branches are independent `if` blocks (not `if/else`): `news.html` has only `#news-list`, `index.html` has only `#news-teaser`, but the file is written so either, both, or neither can be present without error.

- [ ] **Step 2: Write `tests/news.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNewsByDateDesc, isExternalLink, renderNewsItem } from '../assets/js/news.js';

const items = [
  { date: '2024-09-04', title: 'Old news', url: 'https://example.org' },
  { date: '2026-11-10', title: 'New news', url: 'pages.html?doc=about.md' },
  { date: '2023-01-15', title: 'Oldest news', url: 'https://example.org/a' },
];

test('sortNewsByDateDesc orders newest first', () => {
  const sorted = sortNewsByDateDesc(items);
  assert.deepEqual(sorted.map((e) => e.date), ['2026-11-10', '2024-09-04', '2023-01-15']);
});

test('isExternalLink recognizes absolute http(s) URLs', () => {
  assert.equal(isExternalLink('https://example.org'), true);
  assert.equal(isExternalLink('http://example.org'), true);
});

test('isExternalLink treats relative links as internal', () => {
  assert.equal(isExternalLink('pages.html?doc=about.md'), false);
});

test('renderNewsItem adds target=_blank only for external links', () => {
  const external = renderNewsItem(items[0]);
  const internal = renderNewsItem(items[1]);
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
});
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/news.test.js`
Expected: 4 tests pass, 0 failures.

- [ ] **Step 4: Write `news.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>News — RCSL WG Histories</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div id="nav"></div>
  <main>
    <h1>News</h1>
    <div id="news-list"></div>
  </main>
  <script type="module" src="assets/js/news.js"></script>
</body>
</html>
```

- [ ] **Step 5: Modify `index.html`** to add the News section, the News/full-list footer link, and the `news.js` script tag

Read the current `index.html` first. Then:

1. Add a new `<section>` for News, immediately after the "Meetings" section and before the closing `</main>` tag:

```html
    <section>
      <h2>News</h2>
      <div id="news-teaser"></div>
    </section>
```

2. In the `<footer>`, add a News link alongside the existing Members/Projects/Events links (use whatever separator character the existing footer already uses between links):

```html
  <footer>
    <p><a href="members.html">Members</a> &middot; <a href="projects.html">Projects</a> &middot; <a href="events.html">Events</a> &middot; <a href="news.html">News</a></p>
  </footer>
```

3. Add a `news.js` module script tag, alongside the existing inline `initNav` module script (order doesn't matter — they touch different DOM elements):

```html
  <script type="module" src="assets/js/news.js"></script>
```

- [ ] **Step 6: Append news CSS to `assets/css/style.css`**

```css
.news-list { list-style: none; margin: 0; padding: 0; }
.news-item {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
}
.news-date { color: var(--color-muted); font-variant-numeric: tabular-nums; min-width: 6.5rem; }
```

- [ ] **Step 7: Manual verification**

With the site served locally (e.g. `python -m http.server 8000`, or a Node-based static server if Python isn't available — see the existing README for the exact local-preview command), open `http://localhost:8000/news.html`.
Expected: 4 news items, newest first (2026-09-04 on top), the 2026-02-20 and 2026-07-15 entries link to `pages.html?doc=...` (same tab, no new-tab icon/behavior expected since `pages.html` doesn't exist until Task 3 — a 404 at this point is expected and fine), the other two entries open in a new tab.

Open `http://localhost:8000/index.html`.
Expected: a "News" section appears after "Meetings" showing only the 3 most recent items (2026-09-04, 2026-07-15, 2026-05-02 — NOT 2026-02-20) plus a "See all news →" link to `news.html`. "News" appears in the nav on every page, underlined/highlighted only on `news.html`.

- [ ] **Step 8: Commit**

```bash
git add assets/js/news.js tests/news.test.js news.html index.html assets/css/style.css
git commit -m "Add News page and landing page teaser"
```

---

### Task 3: Pages content viewer

**Files:**
- Create: `assets/js/pages.js`
- Create: `tests/pages.test.js`
- Create: `pages.html`
- Create: `pages/about.md`
- Create: `pages/example.html`
- Modify: `assets/css/style.css`

**Interfaces:**
- Consumes: `shared.js`'s `initNav`. Also the global `marked` object from the CDN `<script>` tag loaded before this module in `pages.html`.
- Produces: `isValidDocFilename(name): boolean`, `getDocType(name): 'markdown' | 'html' | null`. Nothing later depends on this file.

- [ ] **Step 1: Write `assets/js/pages.js`**

```js
import { initNav } from './shared.js';

const DOC_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.(md|html)$/;

export function isValidDocFilename(name) {
  return typeof name === 'string' && DOC_FILENAME_PATTERN.test(name);
}

export function getDocType(name) {
  if (!isValidDocFilename(name)) return null;
  return name.endsWith('.md') ? 'markdown' : 'html';
}

if (typeof document !== 'undefined' && document.getElementById('page-content')) {
  initNav('pages');
  const container = document.getElementById('page-content');
  const params = new URLSearchParams(window.location.search);
  const doc = params.get('doc');

  if (!doc || !isValidDocFilename(doc)) {
    container.innerHTML = '<p class="error-state">No page specified.</p>';
  } else {
    fetch(`pages/${doc}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load pages/${doc}: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const type = getDocType(doc);
        container.innerHTML = type === 'markdown' ? marked.parse(text) : text;
      })
      .catch((err) => {
        container.innerHTML = '<p class="error-state">Couldn\'t load this page.</p>';
        console.error(err);
      });
  }
}
```

Note: `isValidDocFilename`/`getDocType` intentionally do NOT use `escapeHTML` — they're a filename allowlist check, not HTML rendering. The `marked.parse(text)` / raw-`.html`-text-into-`innerHTML` paths are the deliberate unescaped-rendering exception documented in the spec's "Trust model" — do not add escaping there.

- [ ] **Step 2: Write `tests/pages.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDocFilename, getDocType } from '../assets/js/pages.js';

test('isValidDocFilename accepts simple .md and .html filenames', () => {
  assert.equal(isValidDocFilename('about.md'), true);
  assert.equal(isValidDocFilename('example.html'), true);
  assert.equal(isValidDocFilename('my-page_v2.md'), true);
});

test('isValidDocFilename rejects path traversal and unsafe characters', () => {
  assert.equal(isValidDocFilename('../data/members.json'), false);
  assert.equal(isValidDocFilename('about.md/../evil'), false);
  assert.equal(isValidDocFilename('a b.md'), false);
  assert.equal(isValidDocFilename('script.js'), false);
});

test('isValidDocFilename rejects non-string or empty input', () => {
  assert.equal(isValidDocFilename(''), false);
  assert.equal(isValidDocFilename(null), false);
  assert.equal(isValidDocFilename(undefined), false);
});

test('getDocType returns markdown or html for valid filenames', () => {
  assert.equal(getDocType('about.md'), 'markdown');
  assert.equal(getDocType('example.html'), 'html');
});

test('getDocType returns null for invalid filenames', () => {
  assert.equal(getDocType('../evil'), null);
  assert.equal(getDocType('script.js'), null);
});
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/pages.test.js`
Expected: 5 tests pass, 0 failures.

- [ ] **Step 4: Write `pages.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RCSL WG Histories</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div id="nav"></div>
  <main>
    <div id="page-content"></div>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
  <script type="module" src="assets/js/pages.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write `pages/about.md`**

```markdown
# How the Working Group Got Started

This is placeholder content for the RCSL Working Group "Histories of the
Sociology of Law" — a proof-of-concept page demonstrating the Pages content
viewer. Real content should replace this file before launch.

## Markdown features

This page is rendered from **Markdown** via [marked](https://marked.js.org/),
so it supports:

- Headings
- **Bold** and *italic* text
- [Links](https://gitlab.gwdg.de/rcsl-wg-histories/website)
- Lists like this one
```

- [ ] **Step 6: Write `pages/example.html`**

```html
<h1>Example HTML Content Page</h1>
<p>This is a placeholder HTML content page for the RCSL WG Histories site,
demonstrating that <code>pages.html</code> can render raw HTML documents
directly, not just Markdown.</p>
<p>Real content should replace this file before launch.</p>
```

- [ ] **Step 7: Append page-content CSS to `assets/css/style.css`**

```css
#page-content { line-height: 1.6; }
#page-content h1, #page-content h2, #page-content h3 { margin-top: 1.5rem; }
#page-content img { max-width: 100%; }
```

- [ ] **Step 8: Manual verification**

With the site served locally, open `http://localhost:8000/pages.html?doc=about.md`.
Expected: the Markdown content renders as HTML (a real `<h1>`, bold/italic text, a working link, a bullet list) — not raw Markdown source text.

Open `http://localhost:8000/pages.html?doc=example.html`.
Expected: the HTML content renders directly.

Open `http://localhost:8000/pages.html` (no `doc` param).
Expected: "No page specified." error state, not a blank page.

Open `http://localhost:8000/pages.html?doc=../data/members.json` and `http://localhost:8000/pages.html?doc=nope.txt`.
Expected: both rejected by `isValidDocFilename` before any fetch happens — same "No page specified." error state (the filename-allowlist check treats an invalid filename the same as a missing one).

Go back to `news.html` from Task 2 and click the two internal links (2026-02-20 and 2026-07-15 entries).
Expected: both now correctly land on a rendered Pages-viewer document instead of 404ing (Task 2's manual check noted this 404 as expected-at-the-time; it should be gone now).

- [ ] **Step 9: Commit**

```bash
git add assets/js/pages.js tests/pages.test.js pages.html pages/about.md pages/example.html assets/css/style.css
git commit -m "Add Pages content viewer"
```

---

### Task 4: CI and README updates

**Files:**
- Modify: `.gitlab-ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing further depends on this task; it is the final integration point for this plan.

- [ ] **Step 1: Modify `.gitlab-ci.yml`'s `pages` job**

Read the current `.gitlab-ci.yml` first. Find the `pages` job's `cp -r` line:

```yaml
    - cp -r index.html members.html projects.html events.html assets data public/
```

Change it to include the two new HTML entry points and the new `pages/` content directory:

```yaml
    - cp -r index.html members.html projects.html events.html news.html pages.html assets data pages public/
```

The `validate` job's script already runs `npm run validate` (unchanged) — Task 1 already extended that npm script to include `validate:news`, and the existing test-running step (if present from prior work) or `npm test` should already cover `tests/news.test.js` and `tests/pages.test.js` automatically since they're picked up by the `tests/*.test.js` glob. Confirm this is the case by reading the `validate` job's `script:` list; if it does not already include `npm test` alongside `npm run validate`, add it.

- [ ] **Step 2: Modify `README.md`**

Read the current `README.md` first. Update it in two places:

1. In the "Editing data" section, add a bullet after the existing `events.json` bullet:

```markdown
- `news.json`: same shape as `events.json`. `url` can be an absolute
  `http(s)://` link (opens in a new tab) or a relative link into the Pages
  viewer, e.g. `pages.html?doc=about.md` (opens in the same tab).
```

And add a short paragraph after that list (or wherever the data-editing section ends) about the Pages viewer:

```markdown
Adding a longer write-up (e.g. to link from a news item) means adding a
`.md` or `.html` file under `pages/` — no code changes required. Link to it
with `pages.html?doc=<filename>`.
```

2. In the "Manual smoke checklist", add these two items after the existing "Events page" line:

```markdown
- [ ] News page: sorted newest-first; landing page shows only the 3 most
      recent entries plus a "See all news" link.
- [ ] Pages viewer: a `.md` doc renders as formatted HTML (not raw
      Markdown source); an `.html` doc renders directly; a missing/invalid
      `doc` param shows an error state instead of a blank page.
```

3. Update the top "Current state: proof of concept" paragraph to also mention `news.json` and the placeholder `pages/` content, alongside the existing mention of `members.json`/`projects.json`/`events.json` and the landing-page copy.

- [ ] **Step 3: Full automated check**

Run: `npm run validate && npm test`
Expected: all four schema validations pass (`members`, `projects`, `events`, `news`), and all unit tests pass — the total should now be 22 (previous) + 4 (news.test.js) + 5 (pages.test.js) = 31, 0 failures.

- [ ] **Step 4: Full manual smoke check**

Work through the updated README checklist end-to-end against a locally-served copy of the site (all 6 pages, both Pages-viewer document types).

- [ ] **Step 5: Commit**

```bash
git add .gitlab-ci.yml README.md
git commit -m "Wire News and Pages into CI and README"
```

---

## Not covered by this plan

- Replacing the fake `data/news.json` content and the placeholder `pages/about.md` / `pages/example.html` content with real material — same deferral as the rest of the site's fake data, per the ongoing proof-of-concept approach.
- Pinning a Subresource Integrity (SRI) hash for the marked.js CDN script — not currently done for D3 either; a pre-existing gap noted in an earlier review, not scope for this plan.
