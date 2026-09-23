# Static Build Pipeline & Generic Content Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side fetch-and-render architecture with a Node build step (`npm run build`) that pre-renders crawlable, accessible static HTML from a reorganized `content/` tree into `public/`, ships zero raw content JSON to the browser, and ships fully generic/fictitious default content so the repo works as a distributable template.

**Architecture:** A new `scripts/build.mjs` resolves content (local `content/` by default, or `CONTENT_PATH` — a local path or remote URL — for a real deployment), then reuses the existing pure render-to-string functions in `assets/js/*.js` (unchanged import paths, same files also still shipped to the browser for the handful of things that stay genuinely interactive) to generate one static HTML file per page/document into `public/`. The browser's remaining job shrinks to: portrait-fallback wiring, the Members/Projects filter boxes and view toggles (now DOM-based, no fetch), and the Projects graph (D3, fed a build-time-sanitized JSON with no email addresses).

**Tech Stack:** Node.js (`--test`, `--watch`, `--env-file-if-exists`), `marked` (new devDependency, build-time Markdown rendering), `ajv-cli` (existing, still via `npx`), plain ESM modules shared between Node and the browser via the existing `typeof document !== 'undefined'` guard pattern already used throughout `assets/js/`.

---

## Before you start

Read `docs/superpowers/specs/2026-09-23-static-build-pipeline-design.md` in full — this plan implements it exactly. Also skim `docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`, which the new spec supersedes in part (data field shapes and visual design system still apply).

The repo currently has **uncommitted changes** from earlier session work (`data/site.json`, `data/schema/site.schema.json`, Members filter/list-view code, README/CSS tweaks). Task 1 snapshots the *current working tree* (including these uncommitted changes) into `.local/content/`, so do not stash or discard them first.

---

## Phase A — Preserve real content, then reorganize directories

### Task 1: Snapshot current content into `.local/content/`

**Files:**
- Create: `.local/content/data/site.json`, `.local/content/data/members.json`, `.local/content/data/projects.json`, `.local/content/data/events.json`, `.local/content/data/news.json`
- Create: `.local/content/pages/about.md`, `.local/content/pages/example.html`
- Create: `.local/content/images/` (empty — no images exist yet)

- [ ] **Step 1: Create the snapshot**

```bash
mkdir -p .local/content/data .local/content/pages .local/content/images
cp data/site.json data/members.json data/projects.json data/events.json data/news.json .local/content/data/
cp pages/about.md pages/example.html .local/content/pages/
```

- [ ] **Step 2: Verify**

```bash
diff data/members.json .local/content/data/members.json   # expect no output
ls .local/content/pages                                    # about.md example.html
```

This snapshot is gitignored (Task 6) — it exists only on disk, never committed. It preserves the pre-genericization content (including anything real in `about.md`) so it can be pointed at later via `CONTENT_PATH=.local/content` while the checked-in `content/` becomes fully generic.

No commit for this task — `.local/` isn't tracked yet (gitignore added in Task 6); nothing to stage.

---

### Task 2: Move JSON Schemas to top-level `schema/`

**Files:**
- Move: `data/schema/*.json` → `schema/*.json`

- [ ] **Step 1: Move the directory**

```bash
git mv data/schema schema
```

- [ ] **Step 2: Verify**

```bash
ls schema
# events.schema.json  members.schema.json  news.schema.json  projects.schema.json  site.schema.json
ls data/schema 2>&1   # expect "No such file or directory"
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Move JSON Schemas to top-level schema/"
```

---

### Task 3: Move JSON content files to `content/data/`

**Files:**
- Move: `data/site.json`, `data/members.json`, `data/projects.json`, `data/events.json`, `data/news.json` → `content/data/`

- [ ] **Step 1: Move each file**

```bash
mkdir -p content/data
git mv data/site.json content/data/site.json
git mv data/members.json content/data/members.json
git mv data/projects.json content/data/projects.json
git mv data/events.json content/data/events.json
git mv data/news.json content/data/news.json
```

- [ ] **Step 2: Verify `data/` is now empty of tracked files**

```bash
git status --short | grep '^ D data/' | wc -l   # expect 5 (or fewer if data/ already gone from earlier moves)
ls data 2>&1   # expect "No such file or directory" once nothing is left in it
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Move JSON content files to content/data/"
```

---

### Task 4: Move `pages/` to `content/pages/`

**Files:**
- Move: `pages/.gitkeep`, `pages/about.md`, `pages/example.html` → `content/pages/`

- [ ] **Step 1: Move the directory**

```bash
git mv pages content/pages
```

- [ ] **Step 2: Verify**

```bash
ls content/pages
# .gitkeep  about.md  example.html
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Move pages/ to content/pages/"
```

---

### Task 5: Add `content/images/` with a placeholder favicon and logo

**Files:**
- Create: `content/images/favicon.ico`
- Create: `content/images/logo.png`

- [ ] **Step 1: Generate both files**

Both are generated with pure Python (no ImageMagick/PIL dependency) as a solid `--color-accent` (`#2c5282`) square — a valid, real PNG and a valid, real modern (PNG-in-ICO) favicon, not empty stub files:

```bash
mkdir -p content/images
python3 - <<'PY'
import struct, zlib, pathlib

def png_bytes(size, rgba=(44, 82, 130, 255)):
    row = bytes([0]) + bytes(rgba) * size  # filter byte + RGBA per pixel
    raw = row * size

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

logo = png_bytes(64)
pathlib.Path('content/images/logo.png').write_bytes(logo)

favicon_png = png_bytes(32)
header = struct.pack('<HHH', 0, 1, 1)
entry = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(favicon_png), 22)
pathlib.Path('content/images/favicon.ico').write_bytes(header + entry + favicon_png)
PY
```

- [ ] **Step 2: Verify**

```bash
file content/images/logo.png     # PNG image data, 64 x 64, ...
file content/images/favicon.ico  # MS Windows icon resource - 1 icon, 32x32
```

- [ ] **Step 3: Commit**

```bash
git add content/images/logo.png content/images/favicon.ico
git commit -m "Add placeholder favicon and logo"
```

---

### Task 6: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the two new ignored paths**

Current content:
```
# Local secrets (see .env.example)
.env

# OS cruft
.DS_Store
Thumbs.db

# Visual brainstorming companion mockups/state (not project deliverables)
.superpowers/

# npx-installed tooling (ajv-cli), never committed
node_modules/
```

New content:
```
# Local secrets (see .env.example)
.env

# OS cruft
.DS_Store
Thumbs.db

# Visual brainstorming companion mockups/state (not project deliverables)
.superpowers/

# npx-installed tooling (ajv-cli), never committed
node_modules/

# Build output — generated by `npm run build`, never hand-edited or committed
/public/

# Real (non-generic) content, preserved locally outside the generic template
/.local/
```

- [ ] **Step 2: Verify `.local/` is now actually ignored**

```bash
git status --short .local   # expect no output
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "Ignore build output and local real-content mirror"
```

---

### Task 7: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add `CONTENT_PATH` and optional remote-auth variables**

Current content:
```
# Copy this file to .env and fill in your own values. .env is gitignored —
# never commit real credentials.
#
# Personal access token for gitlab.gwdg.de, used for local tooling (creating
# the project, pushing, configuring repo/Pages settings via the GitLab API).
# Not used by the deployed site itself, which has no backend and no secrets.
GITLAB_TOKEN=
GITLAB_HOST=gitlab.gwdg.de
```

New content:
```
# Copy this file to .env and fill in your own values. .env is gitignored —
# never commit real credentials.
#
# Personal access token for gitlab.gwdg.de, used for local tooling (creating
# the project, pushing, configuring repo/Pages settings via the GitLab API).
# Not used by the deployed site itself, which has no backend and no secrets.
GITLAB_TOKEN=
GITLAB_HOST=gitlab.gwdg.de

# Where `npm run build`/`npm run validate` read content from. Build-time only
# — never read by the browser. Leave blank to use the committed generic
# content/ tree. Point it at .local/content for real (non-generic) local
# data, or at a remote URL (e.g. a public, unauthenticated WebDAV share) for
# a real deployment.
CONTENT_PATH=

# Only needed if CONTENT_PATH is a remote URL that requires Basic Auth.
# Leave both blank for a public/unauthenticated source.
CONTENT_USERNAME=
CONTENT_PASSWORD=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "Add CONTENT_PATH to .env.example"
```

---

## Phase B — Content genericization

### Task 8: Genericize `content/data/site.json`, add favicon/logo, update its schema

**Files:**
- Modify: `content/data/site.json`
- Modify: `schema/site.schema.json`
- Modify: `tests/shared.test.js` (the `navHTML` fallback-label test — no change needed there, it tests the *code default*, not this file; verify in Step 3)

- [ ] **Step 1: Read the current schema**

```bash
cat schema/site.schema.json
```

Expected current content:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Site",
  "type": "object",
  "additionalProperties": false,
  "required": ["bannerLabel", "title", "subtitle"],
  "properties": {
    "bannerLabel": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "subtitle": { "type": "string", "minLength": 1 }
  }
}
```

- [ ] **Step 2: Add `favicon`/`logo` as optional properties**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Site",
  "type": "object",
  "additionalProperties": false,
  "required": ["bannerLabel", "title", "subtitle"],
  "properties": {
    "bannerLabel": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "subtitle": { "type": "string", "minLength": 1 },
    "favicon": { "type": "string", "minLength": 1 },
    "logo": { "type": "string", "minLength": 1 }
  }
}
```

- [ ] **Step 3: Replace `content/data/site.json` with generic content**

```json
{
  "bannerLabel": "CLFN",
  "title": "Comparative Legal Futures Network",
  "subtitle": "Approved as a working group of the International Association for Comparative Legal Studies (IACLS) at the Board meeting in Tallinn, Estonia, 12 March 2025.",
  "favicon": "favicon.ico",
  "logo": "logo.png"
}
```

- [ ] **Step 4: Validate**

```bash
npx --yes ajv-cli validate -s schema/site.schema.json -d content/data/site.json
# content/data/site.json valid
```

- [ ] **Step 5: Commit**

```bash
git add content/data/site.json schema/site.schema.json
git commit -m "Genericize site.json; add optional favicon/logo fields"
```

---

### Task 9: Genericize `content/data/projects.json`

**Files:**
- Modify: `content/data/projects.json`

- [ ] **Step 1: Replace RCSL references with the fictitious CLFN identity**

```json
[
  {
    "id": "history-of-clfn",
    "title": "A History of the CLFN",
    "subtitle": "Tracing the network's origins from 2019 to today",
    "description": "A collaborative research project reconstructing the institutional history of the Comparative Legal Futures Network through archival research and oral history interviews.",
    "url": "https://example.org/projects/history-of-clfn",
    "image_url": "https://picsum.photos/seed/clfn/600/400",
    "participants": ["ada.adler@example.edu", "bo.bergman@example.ac.uk", "dana.kovac@example.hr"]
  },
  {
    "id": "biographies-project",
    "title": "Biographical Dictionary of Comparative Legal Scholars",
    "subtitle": "A collective reference work on the field's founding generation",
    "description": "An edited volume gathering short critical biographies of scholars who shaped comparative legal studies as a discipline.",
    "url": "https://example.org/projects/biographies",
    "image_url": "https://picsum.photos/seed/biographies/600/400",
    "participants": ["ada.adler@example.edu", "chidi.okoro@example.edu.ng", "erik.sundstrom@example.se"]
  },
  {
    "id": "oral-history-archive",
    "title": "Oral History Archive",
    "subtitle": "Recorded interviews with senior scholars in comparative legal studies",
    "description": "A growing archive of recorded and transcribed interviews, conducted with founding and senior members of the field.",
    "participants": ["bo.bergman@example.ac.uk", "chidi.okoro@example.edu.ng"]
  }
]
```

- [ ] **Step 2: Validate and commit**

```bash
npx --yes ajv-cli validate -s schema/projects.schema.json -d content/data/projects.json
git add content/data/projects.json
git commit -m "Genericize projects.json"
```

---

### Task 10: Genericize `content/data/events.json`

**Files:**
- Modify: `content/data/events.json`

- [ ] **Step 1: Replace Bangor/Oñati/RCSL references**

```json
[
  { "date": "2022-01-20", "title": "Informal planning call" },
  { "date": "2023-03-10", "title": "Founding roundtable, Ljubljana", "url": "https://example.org/events/ljubljana-2023" },
  { "date": "2025-03-12", "title": "Working group approved at IACLS Board meeting, Tallinn, Estonia", "url": "https://example.org/events/tallinn-2025" },
  { "date": "2025-07-02", "title": "Second network meeting (online)", "url": "pages.html?doc=example.html" },
  { "date": "2026-11-12", "title": "Next network meeting, Vancouver", "url": "https://example.org/events/vancouver-2026" }
]
```

Note: the `pages.html?doc=example.html` URL shape is deliberately unchanged here — it's the source content's field shape (per the spec, "no other content field shapes change"). `scripts/build.mjs` rewrites it to a real static URL at build time (Task 26).

- [ ] **Step 2: Validate and commit**

```bash
npx --yes ajv-cli validate -s schema/events.schema.json -d content/data/events.json
git add content/data/events.json
git commit -m "Genericize events.json"
```

---

### Task 11: Genericize `content/data/news.json`

**Files:**
- Modify: `content/data/news.json`

- [ ] **Step 1: Replace RCSL references**

```json
[
  { "date": "2026-05-02", "title": "Call for participation: Oral History Archive project", "url": "https://example.org/news/oral-history-call" },
  { "date": "2026-09-04", "title": "Network approved as an official IACLS working group", "url": "https://example.org/news/wg-approved" },
  { "date": "2026-02-20", "title": "Website proof of concept launched", "url": "pages.html?doc=example.html" },
  { "date": "2026-07-15", "title": "About, Contact, and Membership details now online", "url": "pages.html?doc=about.md" }
]
```

- [ ] **Step 2: Validate and commit**

```bash
npx --yes ajv-cli validate -s schema/news.schema.json -d content/data/news.json
git add content/data/news.json
git commit -m "Genericize news.json"
```

---

### Task 12: Genericize `content/pages/about.md`

**Files:**
- Modify: `content/pages/about.md`

- [ ] **Step 1: Replace the real chair/institution/email with a fictitious one drawn from `members.json`**

```markdown
# About the Network

The Comparative Legal Futures Network (CLFN) brings together scholars
researching how legal systems anticipate, absorb, and respond to social
change. It was approved as a working group of the International
Association for Comparative Legal Studies (IACLS) at the Board meeting in
Tallinn, Estonia, on 12 March 2025.

<a href="#" target="_blank" rel="noopener">Board meeting presentation</a> &middot; <a href="#" target="_blank" rel="noopener">Roundtable minutes</a>

## Contact

Chair: Ada Adler, Institute for Legal History<br>
[ada.adler@example.edu](mailto:ada.adler@example.edu)

## Membership & mailing list

To join the mailing list, send a blank email to the list's subscribe
address, or use the <a href="#" target="_blank" rel="noopener">listinfo page</a>. Unsubscribing from the list is
treated as leaving the network. Formal membership requires IACLS
membership.

## Meetings

See the [Events page](events.html) for the full meeting history and the
next planned gathering.
```

- [ ] **Step 2: Commit**

```bash
git add content/pages/about.md
git commit -m "Genericize about.md"
```

---

### Task 13: Genericize `content/pages/example.html`

**Files:**
- Modify: `content/pages/example.html`

- [ ] **Step 1: Replace the RCSL mention**

```html
<h1>Example HTML Content Page</h1>
<p>This is a placeholder HTML content page for the Comparative Legal
Futures Network site, demonstrating that a content page can be raw HTML,
not just Markdown.</p>
<p>Real content should replace this file before launch.</p>
```

- [ ] **Step 2: Commit**

```bash
git add content/pages/example.html
git commit -m "Genericize example.html"
```

---

### Task 14: Remove the "Boulanger" test fixtures

**Files:**
- Modify: `tests/shared.test.js`
- Modify: `tests/members.test.js`

- [ ] **Step 1: Replace the fixture name in `tests/shared.test.js`**

Find:
```js
test('getInitials combines first letters of first and last name', () => {
  assert.equal(getInitials('Christian', 'Boulanger'), 'CB');
});

test('getInitials handles missing names gracefully', () => {
  assert.equal(getInitials('', ''), '');
  assert.equal(getInitials(undefined, 'Boulanger'), 'B');
});

test('hashColor is deterministic for the same key', () => {
  const a = hashColor('boulanger@lhlt.mpg.de');
  const b = hashColor('boulanger@lhlt.mpg.de');
  assert.equal(a, b);
});
```

Replace with:
```js
test('getInitials combines first letters of first and last name', () => {
  assert.equal(getInitials('Jordan', 'Lee'), 'JL');
});

test('getInitials handles missing names gracefully', () => {
  assert.equal(getInitials('', ''), '');
  assert.equal(getInitials(undefined, 'Lee'), 'L');
});

test('hashColor is deterministic for the same key', () => {
  const a = hashColor('jordan.lee@example.org');
  const b = hashColor('jordan.lee@example.org');
  assert.equal(a, b);
});
```

- [ ] **Step 2: Replace the fixture name in `tests/members.test.js`**

Find:
```js
const sample = [
  { firstname: 'Christian', lastname: 'Boulanger', affiliation: 'MPI', email: 'a@example.org' },
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'Uni X', email: 'b@example.org' },
];
```

Replace with:
```js
const sample = [
  { firstname: 'Jordan', lastname: 'Lee', affiliation: 'MPI', email: 'a@example.org' },
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'Uni X', email: 'b@example.org' },
];
```

(This changes the expected sort order in `sortMembersByLastname sorts alphabetically by lastname` from `['Adler', 'Boulanger']` to `['Adler', 'Lee']` — update that assertion too.)

Find:
```js
test('sortMembersByLastname sorts alphabetically by lastname', () => {
  const sorted = sortMembersByLastname(sample);
  assert.deepEqual(sorted.map((m) => m.lastname), ['Adler', 'Boulanger']);
});
```

Replace with:
```js
test('sortMembersByLastname sorts alphabetically by lastname', () => {
  const sorted = sortMembersByLastname(sample);
  assert.deepEqual(sorted.map((m) => m.lastname), ['Adler', 'Lee']);
});
```

- [ ] **Step 3: Run the tests**

```bash
npm test
```

Expected: all still pass (this is a pure rename, no behavior change).

- [ ] **Step 4: Commit**

```bash
git add tests/shared.test.js tests/members.test.js
git commit -m "Remove real-person test fixtures"
```

---

## Phase C — Shared pure-function changes (reused by both build and browser)

### Task 15: Add `memberSlug` and `textMatchesQuery` to `shared.js`

These replace email as the identifier used in generated URLs (Members-page anchor ids, Projects-page participant links) — using email there would leak it into static HTML source even though it's never rendered as visible text, defeating the point of removing it from display.

**Files:**
- Modify: `assets/js/shared.js`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/shared.test.js` (after the existing `isExternalLink` tests):

```js
import { escapeHTML, getInitials, hashColor, navHTML, isExternalLink, memberSlug, textMatchesQuery, skipLinkHTML } from '../assets/js/shared.js';
```

(replace the existing import line with this one — it adds `escapeHTML`, `memberSlug`, `textMatchesQuery`, `skipLinkHTML` to what's already imported)

```js
test('memberSlug builds a lowercase hyphenated slug from first and last name', () => {
  assert.equal(memberSlug({ firstname: 'Ada', lastname: 'Adler' }), 'ada-adler');
});

test('memberSlug strips characters that are not letters or digits', () => {
  assert.equal(memberSlug({ firstname: "O'Brien", lastname: 'Smith-Jones' }), 'o-brien-smith-jones');
});

test('textMatchesQuery treats an empty query as matching everything', () => {
  assert.equal(textMatchesQuery('', 'ada adler'), true);
  assert.equal(textMatchesQuery('   ', 'ada adler'), true);
});

test('textMatchesQuery matches a substring case-insensitively', () => {
  assert.equal(textMatchesQuery('ADLER', 'ada adler institute'), true);
  assert.equal(textMatchesQuery('nomatch', 'ada adler institute'), false);
});

test('skipLinkHTML links to #main-content', () => {
  assert.match(skipLinkHTML(), /href="#main-content"/);
  assert.match(skipLinkHTML(), /class="skip-link"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: `FAIL` — `memberSlug`, `textMatchesQuery`, `skipLinkHTML` are not exported yet.

- [ ] **Step 3: Add the three functions to `assets/js/shared.js`**

Add after `escapeHTML`:

```js
export function memberSlug(member) {
  const slugify = (value) =>
    String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slugify(member.firstname)}-${slugify(member.lastname)}`;
}

export function textMatchesQuery(query, searchText) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchText.toLowerCase().includes(q);
}

export function skipLinkHTML() {
  return '<a href="#main-content" class="skip-link">Skip to main content</a>';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: `PASS`, all tests green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/shared.js tests/shared.test.js
git commit -m "Add memberSlug, textMatchesQuery, skipLinkHTML to shared.js"
```

---

### Task 16: Remove browser-only fetch/nav functions from `shared.js`; move `titleFromFilename` in

`fetchJSON`, `renderPageDoc`, `loadSiteConfig`, `initNav` all depended on the browser doing a `fetch()` of content JSON at runtime — that no longer happens. `navHTML` stays (already a pure string-returning function, now called directly by the build). `isValidDocFilename`/`getDocType` stay (still needed, now by the build when scanning `content/pages/`). `titleFromFilename` moves here from `pages.js` (Task 19 deletes `pages.js`) since the build now needs it too.

**Files:**
- Modify: `assets/js/shared.js`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write the failing tests**

`isValidDocFilename`/`getDocType` are already defined in `shared.js` today, but so far only tested indirectly via `tests/pages.test.js` (which imports them from `assets/js/pages.js`'s re-export). Task 19 deletes `pages.js` and `tests/pages.test.js` — move their direct tests here now, alongside the new `titleFromFilename` test, so coverage isn't lost.

Replace the import line at the top of `tests/shared.test.js`:

```js
import { escapeHTML, getInitials, hashColor, navHTML, isExternalLink, memberSlug, textMatchesQuery, skipLinkHTML, isValidDocFilename, getDocType, titleFromFilename } from '../assets/js/shared.js';
```

Add these tests:

```js
test('isValidDocFilename accepts simple .md and .html filenames', () => {
  assert.equal(isValidDocFilename('about.md'), true);
  assert.equal(isValidDocFilename('example.html'), true);
  assert.equal(isValidDocFilename('my-page_v2.md'), true);
});

test('isValidDocFilename rejects path traversal and unsafe characters', () => {
  assert.equal(isValidDocFilename('../content/members.json'), false);
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

test('titleFromFilename strips the extension and title-cases hyphen/underscore-separated words', () => {
  assert.equal(titleFromFilename('about.md'), 'About');
  assert.equal(titleFromFilename('example.html'), 'Example');
  assert.equal(titleFromFilename('my-page_v2.md'), 'My Page V2');
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test
```

Expected: `FAIL` — `titleFromFilename` not exported from `shared.js` yet (the `isValidDocFilename`/`getDocType` tests pass already, since those functions already exist — only the new `titleFromFilename` test is red at this point).

- [ ] **Step 3: Edit `assets/js/shared.js`**

Remove `fetchJSON`, `renderPageDoc`, the `DEFAULT_SITE_CONFIG` constant, `loadSiteConfig`, and `initNav`. Add `titleFromFilename`. The full resulting file:

```js
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function getInitials(firstname, lastname) {
  const f = (firstname || '').trim().charAt(0);
  const l = (lastname || '').trim().charAt(0);
  return (f + l).toUpperCase();
}

const AVATAR_PALETTE = ['#c05621', '#2f855a', '#6b46c1', '#b83280', '#2b6cb0', '#975a16'];

export function hashColor(key, palette = AVATAR_PALETTE) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function isExternalLink(url) {
  return /^https?:\/\//i.test(url);
}

export function memberSlug(member) {
  const slugify = (value) =>
    String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slugify(member.firstname)}-${slugify(member.lastname)}`;
}

export function textMatchesQuery(query, searchText) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchText.toLowerCase().includes(q);
}

export function skipLinkHTML() {
  return '<a href="#main-content" class="skip-link">Skip to main content</a>';
}

const DOC_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.(md|html)$/;

export function isValidDocFilename(name) {
  return typeof name === 'string' && DOC_FILENAME_PATTERN.test(name);
}

export function getDocType(name) {
  if (!isValidDocFilename(name)) return null;
  return name.endsWith('.md') ? 'markdown' : 'html';
}

export function titleFromFilename(name) {
  const stem = name.replace(/\.(md|html)$/, '');
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'members.html', label: 'Members', page: 'members' },
  { href: 'projects.html', label: 'Projects', page: 'projects' },
  { href: 'events.html', label: 'Events', page: 'events' },
  { href: 'news.html', label: 'News', page: 'news' },
];

export function navHTML(activePage, bannerLabel = 'RCSL WG Histories') {
  const items = NAV_LINKS.map(
    (l) => `<a href="${l.href}"${l.page === activePage ? ' class="active"' : ''}>${l.label}</a>`
  ).join('');
  return `<nav class="site-nav"><span class="site-title">${escapeHTML(bannerLabel)}</span><div class="nav-links">${items}</div></nav>`;
}

export function wirePortraitFallback(root = document) {
  root.querySelectorAll('img[data-portrait-fallback]').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        const initials = img.dataset.initials || '';
        const color = img.dataset.avatarColor || '#2c5282';
        const wrapper = document.createElement('div');
        wrapper.className = 'avatar-fallback';
        wrapper.style.backgroundColor = color;
        wrapper.textContent = initials;
        img.replaceWith(wrapper);
      },
      { once: true }
    );
  });
}
```

Note: `navHTML`'s fallback label stays `'RCSL WG Histories'` — it's just the *code default* used if no `bannerLabel` argument is passed (matches the existing `navHTML defaults to the fallback banner label when none is given` test, unchanged). The actual site nav is always built by `build.mjs` passing the real `bannerLabel` from `content/data/site.json` (`CLFN`), so this code default is never what ships.

- [ ] **Step 4: Delete the now-obsolete tests for removed functions**

Remove any `tests/shared.test.js` tests that reference `fetchJSON`, `renderPageDoc`, `loadSiteConfig`, or `initNav` (there should be none currently testing those directly — confirm with `grep -n "fetchJSON\|renderPageDoc\|loadSiteConfig\|initNav" tests/shared.test.js` and remove any matches).

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add assets/js/shared.js tests/shared.test.js
git commit -m "Move page-doc/nav rendering out of the browser bundle into shared build-time helpers"
```

---

### Task 17: Update `members.js` — slug-based ids, `data-search` attributes

**Files:**
- Modify: `assets/js/members.js`
- Modify: `tests/members.test.js`

- [ ] **Step 1: Write the failing tests**

Update `tests/members.test.js`'s import line:

```js
import { sortMembersByLastname, renderMemberCard, memberMatches, memberSearchText, renderMemberListItem } from '../assets/js/members.js';
```

Add these tests (after the existing `renderMemberCard does not expose the email address` test):

```js
test('renderMemberCard uses a name-based slug as its id, not the email', () => {
  const html = renderMemberCard(sample[0]);
  assert.match(html, /id="jordan-lee"/);
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
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test
```

Expected: `FAIL` — `id="jordan-lee"` not present yet (still `id="a%40example.org"`), `memberSearchText` not exported, no `data-search` attribute yet.

- [ ] **Step 3: Rewrite `assets/js/members.js`**

Full new content of the pure/exported section (the client-runtime block at the bottom is rewritten separately in Task 30 — for now, replace the whole file with this, which keeps the *old* fetch-based client block temporarily so the file stays syntactically complete and the site doesn't break mid-refactor; Task 30 replaces that block):

```js
import { escapeHTML, getInitials, hashColor, memberSlug, textMatchesQuery, wirePortraitFallback } from './shared.js';

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

export function renderMemberCard(member) {
  const initials = getInitials(member.firstname, member.lastname);
  const color = hashColor(member.email);
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  const portrait = member.portrait_url
    ? `<img class="avatar" src="${escapeHTML(member.portrait_url)}" alt="" data-portrait-fallback data-initials="${escapeHTML(initials)}" data-avatar-color="${color}">`
    : `<div class="avatar-fallback" style="background-color:${color}">${escapeHTML(initials)}</div>`;
  return `<li class="member-card" id="${memberSlug(member)}" data-search="${escapeHTML(memberSearchText(member))}">${portrait}<h3>${nameHTML}</h3><p class="affiliation">${escapeHTML(member.affiliation)}</p></li>`;
}

export function renderMembers(members, container) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-grid">${sorted.map(renderMemberCard).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

export function renderMemberListItem(member) {
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  return `<li class="member-list-item" data-search="${escapeHTML(memberSearchText(member))}"><span class="name">${nameHTML}</span>${
    member.affiliation ? `<span class="affiliation">${escapeHTML(member.affiliation)}</span>` : ''
  }</li>`;
}

export function renderMemberList(members, container) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-list">${sorted.map(renderMemberListItem).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

// The client-runtime block below is replaced in a later task (DOM filtering,
// no fetch). Left as a no-op guard for now so the file stays valid between tasks.
if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  wirePortraitFallback(document.getElementById('members-grid'));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/members.js tests/members.test.js
git commit -m "Use name-based slugs instead of email in members.js; add data-search"
```

---

### Task 18: Update `projects-graph.js` — slug-based participant links, export `renderListView`

**Files:**
- Modify: `assets/js/projects-graph.js`
- Modify: `tests/projects-graph.test.js`

- [ ] **Step 1: Write the failing tests**

Update `tests/projects-graph.test.js`'s import line:

```js
import { buildGraphData, filterMatches, buildProjectListItems, renderListView, sanitizeGraphData } from '../assets/js/projects-graph.js';
```

Add these tests (after `buildProjectListItems drops unknown participants`):

```js
test('buildProjectListItems attaches a slug instead of an email', () => {
  const items = buildProjectListItems(projects, members);
  assert.deepEqual(items[0].participantNames.map((p) => p.slug), ['ada-adler', 'bo-bergman']);
  assert.equal('email' in items[0].participantNames[0], false);
});

test('renderListView links participants by slug, not email', () => {
  const container = {};
  renderListView(projects, members, container);
  assert.match(container.innerHTML, /href="members.html#ada-adler"/);
  assert.doesNotMatch(container.innerHTML, /ada%40example\.org/);
});

test('sanitizeGraphData drops email and keeps a slug on scholar nodes', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const scholar = sanitized.find((n) => n.type === 'scholar');
  assert.equal('email' in scholar.data, false);
  assert.equal(scholar.data.slug, 'ada-adler');
});

test('sanitizeGraphData drops the participants list from project nodes', () => {
  const { nodes } = buildGraphData(projects, members);
  const { nodes: sanitized } = sanitizeGraphData(nodes, []);
  const project = sanitized.find((n) => n.type === 'project');
  assert.equal('participants' in project.data, false);
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test
```

Expected: `FAIL` — `renderListView`/`sanitizeGraphData` not exported yet, participant objects still carry `email`.

- [ ] **Step 3: Edit `assets/js/projects-graph.js`**

Update the import line at the top:

```js
import { escapeHTML, getInitials, hashColor, memberSlug } from './shared.js';
```

Replace `buildProjectListItems`:

```js
export function buildProjectListItems(projects, members) {
  const memberByEmail = new Map(members.map((m) => [m.email, m]));
  return projects.map((project) => ({
    ...project,
    participantNames: (project.participants || [])
      .map((email) => memberByEmail.get(email))
      .filter(Boolean)
      .map((m) => ({
        name: m.affiliation ? `${m.firstname} ${m.lastname} (${m.affiliation})` : `${m.firstname} ${m.lastname}`,
        slug: memberSlug(m),
      })),
  }));
}
```

Change `renderListView` from an unexported `function` to an exported one, and update the participant link to use `slug`:

```js
export function renderListView(projects, members, container) {
  const items = buildProjectListItems(projects, members);
  container.innerHTML = items.length
    ? items
        .map(
          (p) => `<li>
            <h3>${escapeHTML(p.title)}</h3>
            ${p.subtitle ? `<p class="subtitle">${escapeHTML(p.subtitle)}</p>` : ''}
            ${p.description ? `<p>${escapeHTML(p.description)}</p>` : ''}
            <p class="participants">${p.participantNames
              .map((s) => `<a href="members.html#${s.slug}">${escapeHTML(s.name)}</a>`)
              .join(', ')}</p>
            ${p.url ? `<a href="${escapeHTML(p.url)}" target="_blank" rel="noopener">Visit project &#8599;</a>` : ''}
          </li>`
        )
        .join('')
    : '<li class="empty-state">No projects yet.</li>';
}
```

Add a new exported `sanitizeGraphData` function (place it after `buildGraphData`):

```js
export function sanitizeGraphData(nodes, links) {
  const sanitizedNodes = nodes.map((n) => {
    if (n.type === 'project') {
      const { id, title, subtitle, description, url, image_url } = n.data;
      return { id: n.id, type: 'project', data: { id, title, subtitle, description, url, image_url } };
    }
    const { firstname, lastname, affiliation, portrait_url, url } = n.data;
    return {
      id: n.id,
      type: 'scholar',
      data: { firstname, lastname, affiliation, portrait_url, url, slug: memberSlug(n.data) },
    };
  });
  const sanitizedLinks = links.map((l) => ({
    source: typeof l.source === 'object' ? l.source.id : l.source,
    target: typeof l.target === 'object' ? l.target.id : l.target,
  }));
  return { nodes: sanitizedNodes, links: sanitizedLinks };
}
```

(The `typeof l.source === 'object'` check handles both the pre-simulation shape, where `source`/`target` are plain id strings, and the post-simulation shape, where D3's `forceLink` has mutated them in place into references to the actual node objects — `sanitizeGraphData` is only ever called at build time, before any simulation runs, but this makes it robust either way.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/projects-graph.js tests/projects-graph.test.js
git commit -m "Use slugs instead of email in projects-graph.js; add sanitizeGraphData"
```

---

### Task 19: Delete `pages.js`/`pages.html`'s viewer logic; add `page-back-link.js`

`titleFromFilename` moved to `shared.js` in Task 16 (now used at build time). `resolveBackLink` is the one piece that must stay client-side (it reads `document.referrer`, only known at runtime) — it moves into a small new file shipped only on the generated `pages/*.html` documents.

**Files:**
- Delete: `assets/js/pages.js`
- Delete: `tests/pages.test.js`
- Create: `assets/js/page-back-link.js`
- Create: `tests/page-back-link.test.js`

- [ ] **Step 1: Write the failing test for the new file**

Create `tests/page-back-link.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackLink } from '../assets/js/page-back-link.js';

test('resolveBackLink recognizes a news.html referrer', () => {
  assert.deepEqual(resolveBackLink('https://site.example/news.html'), { label: 'All News', href: 'news.html' });
  assert.deepEqual(resolveBackLink('https://site.example/news.html?x=1'), { label: 'All News', href: 'news.html' });
});

test('resolveBackLink recognizes an events.html referrer', () => {
  assert.deepEqual(resolveBackLink('https://site.example/events.html'), { label: 'All Events', href: 'events.html' });
});

test('resolveBackLink does not false-positive on a similarly-named page', () => {
  assert.equal(resolveBackLink('https://site.example/not-news.html'), null);
});

test('resolveBackLink returns null for an unrelated or missing referrer', () => {
  assert.equal(resolveBackLink('https://site.example/projects.html'), null);
  assert.equal(resolveBackLink(''), null);
  assert.equal(resolveBackLink(undefined), null);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: `FAIL` — `assets/js/page-back-link.js` doesn't exist yet.

- [ ] **Step 3: Create `assets/js/page-back-link.js`**

```js
export function resolveBackLink(referrer) {
  if (typeof referrer !== 'string' || !referrer) return null;
  if (/\/news\.html(?:[?#]|$)/.test(referrer)) return { label: 'All News', href: 'news.html' };
  if (/\/events\.html(?:[?#]|$)/.test(referrer)) return { label: 'All Events', href: 'events.html' };
  return null;
}

if (typeof document !== 'undefined') {
  const backLinkEl = document.getElementById('page-back-link');
  if (backLinkEl) {
    const backLink = resolveBackLink(document.referrer);
    backLinkEl.innerHTML = backLink ? `<a href="../${backLink.href}">&larr; ${backLink.label}</a>` : '';
  }
}
```

Note the `../` prefix: generated page documents live at `public/pages/<name>.html`, one directory below the site root where `news.html`/`events.html` live (Task 27).

- [ ] **Step 4: Delete the old files**

```bash
git rm assets/js/pages.js tests/pages.test.js
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: `PASS` — the `isValidDocFilename`/`getDocType`/`titleFromFilename` coverage that used to live in `tests/pages.test.js` already moved to `tests/shared.test.js` in Task 16, so deleting `tests/pages.test.js` here loses no coverage.

- [ ] **Step 6: Commit**

```bash
git add assets/js/page-back-link.js tests/page-back-link.test.js
git commit -m "Replace pages.js with a small client-only back-link script"
```

---

## Phase D — Content resolution & build scripts infrastructure

### Task 20: Write `scripts/lib/resolve-content.mjs` (local resolution)

**Files:**
- Create: `scripts/lib/resolve-content.mjs`
- Test: `tests/resolve-content.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/resolve-content.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContent } from '../scripts/lib/resolve-content.mjs';

test('resolveContent returns the absolute path of a local directory as-is', async () => {
  const dir = await resolveContent('content');
  assert.ok(dir.endsWith('content'));
  assert.equal(dir.startsWith('/'), true);
});

test('resolveContent rejects a local path that does not exist', async () => {
  await assert.rejects(() => resolveContent('./does-not-exist'), /does not exist/);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: `FAIL` — `scripts/lib/resolve-content.mjs` doesn't exist yet.

- [ ] **Step 3: Create `scripts/lib/resolve-content.mjs`**

```js
import { existsSync } from 'node:fs';
import path from 'node:path';

function isRemote(contentPath) {
  return /^https?:\/\//i.test(contentPath);
}

export async function resolveContent(contentPath = process.env.CONTENT_PATH || './content') {
  if (isRemote(contentPath)) {
    const { materializeRemote } = await import('./resolve-content-remote.mjs');
    return materializeRemote(contentPath.replace(/\/+$/, ''));
  }
  if (!existsSync(contentPath)) {
    throw new Error(`CONTENT_PATH "${contentPath}" does not exist`);
  }
  return path.resolve(contentPath);
}
```

(The remote branch is implemented in Task 21, in a separate file — kept apart so this file's tests don't need network mocking.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/resolve-content.mjs tests/resolve-content.test.js
git commit -m "Add local content resolution"
```

---

### Task 21: Extend content resolution for a remote `CONTENT_PATH`

**Files:**
- Create: `scripts/lib/resolve-content-remote.mjs`
- Test: `tests/resolve-content-remote.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/resolve-content-remote.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { materializeRemote } from '../scripts/lib/resolve-content-remote.mjs';

const FIXTURE_SITE = { bannerLabel: 'CLFN', title: 'Test', subtitle: 'Test', favicon: 'favicon.ico', logo: 'logo.png' };
const FIXTURE_NEWS = [{ date: '2026-01-01', title: 'x', url: 'pages.html?doc=about.md' }];
const FIXTURE_EVENTS = [];

function fakeFetch(files) {
  return async (url, options = {}) => {
    const key = url.replace(/^https:\/\/example\.org\/content\//, '');
    if (!(key in files)) {
      return { ok: false, status: 404, statusText: 'Not Found' };
    }
    const body = files[key];
    return {
      ok: true,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      arrayBuffer: async () => new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)).buffer,
    };
  };
}

test('materializeRemote fetches known JSON files, referenced pages, and referenced images', async () => {
  const files = {
    'data/site.json': FIXTURE_SITE,
    'data/members.json': [],
    'data/projects.json': [],
    'data/events.json': FIXTURE_EVENTS,
    'data/news.json': FIXTURE_NEWS,
    'pages/about.md': '# About',
    'images/favicon.ico': 'fake-ico-bytes',
    'images/logo.png': 'fake-png-bytes',
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(files);
  try {
    const dir = await materializeRemote('https://example.org/content');
    const site = JSON.parse(await readFile(path.join(dir, 'data', 'site.json'), 'utf8'));
    assert.equal(site.bannerLabel, 'CLFN');
    const about = await readFile(path.join(dir, 'pages', 'about.md'), 'utf8');
    assert.equal(about, '# About');
    const favicon = await readFile(path.join(dir, 'images', 'favicon.ico'), 'utf8');
    assert.equal(favicon, 'fake-ico-bytes');
    await rm(dir, { recursive: true, force: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('materializeRemote throws with the failing URL when a fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch({});
  try {
    await assert.rejects(() => materializeRemote('https://example.org/content'), /data\/site\.json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: `FAIL` — `scripts/lib/resolve-content-remote.mjs` doesn't exist yet.

- [ ] **Step 3: Create `scripts/lib/resolve-content-remote.mjs`**

```js
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DATA_FILES = ['site', 'members', 'projects', 'events', 'news'];

function authHeaders() {
  const username = process.env.CONTENT_USERNAME;
  const password = process.env.CONTENT_PASSWORD;
  if (!username && !password) return {};
  const token = Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function fetchOk(url) {
  const res = await fetch(url, { headers: authHeaders() });
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
    const text = await (await fetchOk(`${baseUrl}/data/${name}.json`)).text();
    await writeFile(path.join(dir, 'data', `${name}.json`), text, 'utf8');
    data[name] = JSON.parse(text);
  }

  for (const name of referencedPageNames(data.news, data.events)) {
    const text = await (await fetchOk(`${baseUrl}/pages/${name}`)).text();
    await writeFile(path.join(dir, 'pages', name), text, 'utf8');
  }

  for (const name of [data.site.favicon, data.site.logo].filter(Boolean)) {
    const buffer = Buffer.from(await (await fetchOk(`${baseUrl}/images/${name}`)).arrayBuffer());
    await writeFile(path.join(dir, 'images', name), buffer);
  }

  return dir;
}
```

- [ ] **Step 4: Wire it into `resolve-content.mjs`**

Confirm the dynamic `import('./resolve-content-remote.mjs')` call added in Task 20's `resolveContent` now resolves correctly — no edit needed there if Task 20 was followed exactly.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/resolve-content-remote.mjs tests/resolve-content-remote.test.js
git commit -m "Add remote CONTENT_PATH resolution"
```

---

### Task 22: Write `scripts/validate.mjs`; update `package.json`

**Files:**
- Create: `scripts/validate.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/validate.mjs`**

```js
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveContent } from './lib/resolve-content.mjs';

const SCHEMAS = ['site', 'members', 'projects', 'events', 'news'];

async function main() {
  const contentDir = await resolveContent();
  let failed = false;
  for (const name of SCHEMAS) {
    const schema = path.join('schema', `${name}.schema.json`);
    const data = path.join(contentDir, 'data', `${name}.json`);
    const result = spawnSync('npx', ['--yes', 'ajv-cli', 'validate', '-s', schema, '-d', data], {
      stdio: 'inherit',
    });
    if (result.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main();
```

- [ ] **Step 2: Update `package.json`**

Replace the `scripts` block:

```json
{
  "name": "rcsl-wg-histories",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "validate": "node --env-file-if-exists=.env scripts/validate.mjs",
    "build": "node --env-file-if-exists=.env scripts/build.mjs",
    "build:watch": "node --env-file-if-exists=.env --watch scripts/build.mjs"
  },
  "devDependencies": {
    "marked": "^12.0.2"
  }
}
```

(`marked` is added here as a real dependency — `build.mjs`, written in Task 24 onward, needs to `import { marked } from 'marked'`. This replaces the CDN `<script>` tag the browser used to load. `build:watch`/`build` reference `scripts/build.mjs`, which doesn't exist until Task 24 — that's fine, this task just wires up the scripts.)

- [ ] **Step 3: Install the new dependency**

```bash
npm install
```

- [ ] **Step 4: Verify `npm run validate` still works against the (now-relocated) schemas/content**

```bash
npm run validate
```

Expected: five `content/data/*.json valid` lines, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.mjs package.json package-lock.json
git commit -m "Replace ajv-cli npm scripts with scripts/validate.mjs; add marked devDependency"
```

---

## Phase E — Build script

### Task 23: Write `scripts/lib/page-template.mjs` and `scripts/lib/rewrite-pages-url.mjs`

**Files:**
- Create: `scripts/lib/page-template.mjs`
- Create: `scripts/lib/rewrite-pages-url.mjs`
- Test: `tests/rewrite-pages-url.test.js`

- [ ] **Step 1: Write the failing test for the URL rewriter**

Create `tests/rewrite-pages-url.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rewritePagesUrl } from '../scripts/lib/rewrite-pages-url.mjs';

test('rewritePagesUrl rewrites a pages.html?doc= URL to a static pages/ URL', () => {
  assert.equal(rewritePagesUrl('pages.html?doc=about.md'), 'pages/about.html');
  assert.equal(rewritePagesUrl('pages.html?doc=example.html'), 'pages/example.html');
});

test('rewritePagesUrl leaves other URLs unchanged', () => {
  assert.equal(rewritePagesUrl('https://example.org'), 'https://example.org');
  assert.equal(rewritePagesUrl(undefined), undefined);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

- [ ] **Step 3: Create `scripts/lib/rewrite-pages-url.mjs`**

```js
export function rewritePagesUrl(url) {
  const match = typeof url === 'string' ? url.match(/^pages\.html\?doc=(.+)$/) : null;
  if (!match) return url;
  const stem = match[1].replace(/\.(md|html)$/, '');
  return `pages/${stem}.html`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

- [ ] **Step 5: Create `scripts/lib/page-template.mjs`** (no test — pure string assembly, exercised end-to-end by `tests/build.test.js` in Task 29)

```js
import { navHTML, skipLinkHTML, escapeHTML } from '../../assets/js/shared.js';

export function renderPage({ title, activePage, bannerLabel, favicon, mainHTML, footerHTML = '', bodyScripts = [] }) {
  const faviconTag = favicon ? `<link rel="icon" href="images/${escapeHTML(favicon)}">` : '';
  const scriptTags = bodyScripts.map((src) => `<script type="module" src="${src}"></script>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" href="assets/css/style.css">
  ${faviconTag}
</head>
<body>
  ${skipLinkHTML()}
  ${navHTML(activePage, bannerLabel)}
  <main id="main-content">
${mainHTML}
  </main>
  ${footerHTML}
  ${scriptTags}
</body>
</html>
`;
}
```

Note the relative `images/...` and `assets/css/...` paths: this template is used both for top-level pages (`public/index.html`) and one level down (`public/pages/about.html`) — Task 27 passes a `pathPrefix` adjustment for the latter (see that task).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/rewrite-pages-url.mjs scripts/lib/page-template.mjs tests/rewrite-pages-url.test.js
git commit -m "Add the shared page template and pages-URL rewriter"
```

---

### Task 24: `scripts/build.mjs` — bootstrap, content loading, `index.html`

**Files:**
- Create: `scripts/build.mjs`

- [ ] **Step 1: Create `scripts/build.mjs` with the bootstrap and landing page**

```js
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { resolveContent } from './lib/resolve-content.mjs';
import { renderPage } from './lib/page-template.mjs';
import { rewritePagesUrl } from './lib/rewrite-pages-url.mjs';
import { escapeHTML } from '../assets/js/shared.js';
import { renderNewsTeaser } from '../assets/js/news.js';
import { renderEventsTeaser } from '../assets/js/events.js';

const PUBLIC_DIR = path.resolve('public');

async function loadContent(contentDir) {
  const readJSON = async (name) => JSON.parse(await readFile(path.join(contentDir, 'data', `${name}.json`), 'utf8'));
  return {
    site: await readJSON('site'),
    members: await readJSON('members'),
    projects: await readJSON('projects'),
    events: await readJSON('events'),
    news: await readJSON('news'),
  };
}

function withRewrittenUrls(items) {
  return items.map((item) => ({ ...item, url: rewritePagesUrl(item.url) }));
}

async function buildIndexPage(content) {
  const { site } = content;
  const logoTag = site.logo
    ? `<img class="hero-logo" src="images/${escapeHTML(site.logo)}" alt="${escapeHTML(site.title)}">`
    : '';
  const aboutMarkdown = await readFile(path.join(content.contentDir, 'pages', 'about.md'), 'utf8');
  const aboutHTML = marked.parse(aboutMarkdown);

  const newsTeaser = {};
  renderNewsTeaser(withRewrittenUrls(content.news), newsTeaser);
  const eventsTeaser = {};
  renderEventsTeaser(withRewrittenUrls(content.events), eventsTeaser);

  const mainHTML = `
    <section class="hero">
      <div class="hero-inner">
        ${logoTag}
        <div class="hero-text">
          <h1>${escapeHTML(site.title)}</h1>
          <p>${escapeHTML(site.subtitle)}</p>
        </div>
      </div>
    </section>
    <div class="landing-columns">
      <div class="landing-box doc-content" id="about-box">${aboutHTML}</div>
      <div class="landing-sidebar">
        <div class="landing-box">
          <h2>News</h2>
          <div id="news-teaser">${newsTeaser.innerHTML}</div>
        </div>
        <div class="landing-box">
          <h2>Events</h2>
          <div id="events-teaser">${eventsTeaser.innerHTML}</div>
        </div>
      </div>
    </div>`;

  const footerHTML = `<footer>
    <p><a href="members.html">Members</a> &middot; <a href="projects.html">Projects</a> &middot; <a href="events.html">Events</a> &middot; <a href="news.html">News</a></p>
  </footer>`;

  await writeFile(
    path.join(PUBLIC_DIR, 'index.html'),
    renderPage({
      title: site.title,
      activePage: 'home',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
      footerHTML,
    })
  );
}

async function main() {
  const contentDir = await resolveContent();
  const content = { ...(await loadContent(contentDir)), contentDir };

  await mkdir(PUBLIC_DIR, { recursive: true });
  await buildIndexPage(content);

  console.log(`Built into ${PUBLIC_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-run it**

```bash
npm run build
cat public/index.html | head -30
```

Expected: valid HTML, `<h1>Comparative Legal Futures Network</h1>`, nav with `CLFN`, About box rendered from `content/pages/about.md`, News/Events teasers populated. (`members.html`/`projects.html`/`events.html`/`news.html`/`pages/*` don't exist in `public/` yet — added in the following tasks.)

- [ ] **Step 3: Commit**

```bash
git add scripts/build.mjs
git commit -m "Add build.mjs bootstrap and landing page generation"
```

---

### Task 25: `build.mjs` — `members.html`

**Files:**
- Modify: `scripts/build.mjs`

- [ ] **Step 1: Add the import and the page-building function**

Add to the imports at the top:

```js
import { renderMembers, renderMemberList } from '../assets/js/members.js';
```

Add this function (after `buildIndexPage`):

```js
async function buildMembersPage(content) {
  const { site, members } = content;
  const gridContainer = {};
  renderMembers(members, gridContainer);
  const listContainer = {};
  renderMemberList(members, listContainer);

  const mainHTML = `
    <h1>Members</h1>
    <div class="list-controls">
      <input type="search" id="member-filter" class="filter-input" placeholder="Filter by name or affiliation" aria-label="Filter members">
      <button id="member-view-toggle" class="view-toggle-btn" type="button">Switch to list view</button>
    </div>
    <p id="member-filter-empty" class="empty-state" hidden>No members match your filter.</p>
    <div id="members-grid">${gridContainer.innerHTML}</div>
    <div id="members-list" hidden>${listContainer.innerHTML}</div>`;

  await writeFile(
    path.join(PUBLIC_DIR, 'members.html'),
    renderPage({
      title: `Members — ${site.bannerLabel}`,
      activePage: 'members',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
      bodyScripts: ['assets/js/members.js'],
    })
  );
}
```

- [ ] **Step 2: Call it from `main()`**

```js
  await buildIndexPage(content);
  await buildMembersPage(content);
```

- [ ] **Step 3: Smoke-run and check**

```bash
npm run build
grep -c 'class="member-card"' public/members.html   # 5
grep 'id="ada-adler"' public/members.html            # present
grep 'a%40example' public/members.html               # no output — no encoded email anywhere
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build.mjs
git commit -m "build.mjs: generate members.html"
```

---

### Task 26: `build.mjs` — `events.html`, `news.html`

**Files:**
- Modify: `scripts/build.mjs`

- [ ] **Step 1: Add the imports and page-building functions**

Add to imports:

```js
import { renderEvents } from '../assets/js/events.js';
import { renderNews } from '../assets/js/news.js';
```

Add:

```js
async function buildEventsPage(content) {
  const { site, events } = content;
  const listContainer = {};
  renderEvents(withRewrittenUrls(events), listContainer);
  const mainHTML = `<h1>Events</h1>\n<div id="events-list">${listContainer.innerHTML}</div>`;
  await writeFile(
    path.join(PUBLIC_DIR, 'events.html'),
    renderPage({
      title: `Events — ${site.bannerLabel}`,
      activePage: 'events',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
    })
  );
}

async function buildNewsPage(content) {
  const { site, news } = content;
  const listContainer = {};
  renderNews(withRewrittenUrls(news), listContainer);
  const mainHTML = `<h1>News</h1>\n<div id="news-list">${listContainer.innerHTML}</div>`;
  await writeFile(
    path.join(PUBLIC_DIR, 'news.html'),
    renderPage({
      title: `News — ${site.bannerLabel}`,
      activePage: 'news',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
    })
  );
}
```

Note: these pages get no `bodyScripts` — Events/News have no remaining client interactivity (no fetch, no filter box) at all, so they ship zero JS.

- [ ] **Step 2: Call both from `main()`**

```js
  await buildMembersPage(content);
  await buildEventsPage(content);
  await buildNewsPage(content);
```

- [ ] **Step 3: Smoke-run and check**

```bash
npm run build
grep 'href="pages/example.html"' public/events.html   # rewritten, not pages.html?doc=
grep 'href="pages/about.html"' public/news.html        # rewritten
grep 'badge upcoming' public/events.html                # present on future-dated entries
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build.mjs
git commit -m "build.mjs: generate events.html and news.html"
```

---

### Task 27: `build.mjs` — `content/pages/*` → `public/pages/*.html`

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `scripts/lib/page-template.mjs` (support a `pathPrefix` for one-level-deep pages)

- [ ] **Step 1: Add `pathPrefix` support to `renderPage`**

Edit `scripts/lib/page-template.mjs`:

```js
export function renderPage({ title, activePage, bannerLabel, favicon, mainHTML, footerHTML = '', bodyScripts = [], pathPrefix = '' }) {
  const faviconTag = favicon ? `<link rel="icon" href="${pathPrefix}images/${escapeHTML(favicon)}">` : '';
  const scriptTags = bodyScripts.map((src) => `<script type="module" src="${pathPrefix}${src}"></script>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" href="${pathPrefix}assets/css/style.css">
  ${faviconTag}
</head>
<body>
  ${skipLinkHTML()}
  ${navHTML(activePage, bannerLabel).replace(/href="/g, `href="${pathPrefix}`)}
  <main id="main-content">
${mainHTML}
  </main>
  ${footerHTML}
  ${scriptTags}
</body>
</html>
`;
}
```

- [ ] **Step 2: Retrofit the four existing call sites**

`buildIndexPage`, `buildMembersPage`, `buildEventsPage`, `buildNewsPage` don't need any change — `pathPrefix` defaults to `''`, which is exactly what they need (they're all at the site root).

- [ ] **Step 3: Add the pages-doc builder to `build.mjs`**

Add to imports:

```js
import { readdir } from 'node:fs/promises';
import { isValidDocFilename, getDocType, titleFromFilename } from '../assets/js/shared.js';
```

Add:

```js
async function buildPagesDocs(content) {
  const { site } = content;
  const pagesDir = path.join(content.contentDir, 'pages');
  await mkdir(path.join(PUBLIC_DIR, 'pages'), { recursive: true });
  const entries = (await readdir(pagesDir)).filter(isValidDocFilename);

  for (const filename of entries) {
    const source = await readFile(path.join(pagesDir, filename), 'utf8');
    const type = getDocType(filename);
    const bodyHTML = type === 'markdown' ? marked.parse(source) : source;
    const headingMatch = bodyHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '') : titleFromFilename(filename);
    const outName = filename.replace(/\.(md|html)$/, '.html');

    const mainHTML = `<div id="page-content" class="doc-content">${bodyHTML}</div>\n<p id="page-back-link"></p>`;
    await writeFile(
      path.join(PUBLIC_DIR, 'pages', outName),
      renderPage({
        title: `${title} — ${site.bannerLabel}`,
        activePage: 'pages',
        bannerLabel: site.bannerLabel,
        favicon: site.favicon,
        mainHTML,
        bodyScripts: ['assets/js/page-back-link.js'],
        pathPrefix: '../',
      })
    );
  }
}
```

- [ ] **Step 4: Call it from `main()`**

```js
  await buildNewsPage(content);
  await buildPagesDocs(content);
```

- [ ] **Step 5: Smoke-run and check**

```bash
npm run build
ls public/pages   # about.html example.html
grep '<title>About' public/pages/about.html   # title pulled from the doc's own <h1>
grep 'href="../news.html"' public/pages/about.html  # nav links correctly account for the extra directory depth
```

- [ ] **Step 6: Commit**

```bash
git add scripts/build.mjs scripts/lib/page-template.mjs
git commit -m "build.mjs: generate a static page per content/pages/ document"
```

---

### Task 28: `build.mjs` — `projects.html` (static list + sanitized graph JSON)

**Files:**
- Modify: `scripts/build.mjs`

- [ ] **Step 1: Add the imports and page-building function**

Add to imports:

```js
import { buildGraphData, renderListView, sanitizeGraphData } from '../assets/js/projects-graph.js';
```

Add:

```js
async function buildProjectsPage(content) {
  const { site, projects, members } = content;
  const listContainer = {};
  renderListView(projects, members, listContainer);

  const { nodes, links } = buildGraphData(projects, members);
  const graphData = sanitizeGraphData(nodes, links);
  await mkdir(path.join(PUBLIC_DIR, 'assets'), { recursive: true });
  await writeFile(path.join(PUBLIC_DIR, 'assets', 'projects-graph-data.json'), JSON.stringify(graphData));

  const mainHTML = `
    <h1>Projects</h1>
    <div class="list-controls">
      <input type="search" id="project-filter" class="filter-input" placeholder="Filter by scholar or project title" aria-label="Filter projects and scholars">
      <button id="view-toggle" class="view-toggle-btn" type="button">Switch to graph view</button>
    </div>
    <div id="graph-view" hidden>
      <svg id="graph-svg"></svg>
      <div id="scholar-tooltip" class="scholar-tooltip" hidden></div>
    </div>
    <div id="list-view">
      <ul id="project-list">${listContainer.innerHTML}</ul>
    </div>
    <div id="project-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" hidden>
      <div class="modal-content">
        <button id="modal-close" type="button" aria-label="Close">&times;</button>
        <img id="modal-image" alt="">
        <h2 id="modal-title"></h2>
        <p id="modal-subtitle"></p>
        <p id="modal-description"></p>
        <a id="modal-link" target="_blank" rel="noopener">Visit project &#8599;</a>
      </div>
    </div>`;

  await writeFile(
    path.join(PUBLIC_DIR, 'projects.html'),
    renderPage({
      title: `Projects — ${site.bannerLabel}`,
      activePage: 'projects',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
      bodyScripts: projects.length ? ['assets/js/projects-graph.js'] : [],
    })
  );
}
```

Note the page now starts in **list view by default** (`#graph-view` has `hidden`, `#list-view` doesn't, toggle button reads "Switch to graph view") — this is the accessibility-motivated change from the design spec: the pre-rendered list is real content present at first paint; the graph is a JS-driven progressive enhancement that switches itself to the default-on-wide-viewports state once it loads (Task 30 handles that switch, matching the original "graph first on wide viewports" behavior once JS has actually run).

Also note: when `projects.length === 0`, no `projects-graph.js` script tag is emitted at all, and the empty `#graph-view` is simply never switched to — the list view (already showing `<li class="empty-state">No projects yet.</li>`) is all there is, which is strictly better than the old behavior of leaving `#graph-view` with a client-inserted error message.

- [ ] **Step 2: Call it from `main()`**

```js
  await buildPagesDocs(content);
  await buildProjectsPage(content);
```

- [ ] **Step 3: Smoke-run and check**

```bash
npm run build
grep -c '<h3>' public/projects.html            # 3, one per project
grep 'href="members.html#ada-adler"' public/projects.html   # present
cat public/assets/projects-graph-data.json | python3 -m json.tool | grep -i email   # no output
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build.mjs
git commit -m "build.mjs: generate projects.html and the sanitized graph JSON"
```

---

### Task 29: `build.mjs` — copy static assets; `tests/build.test.js`

**Files:**
- Modify: `scripts/build.mjs`
- Create: `tests/build.test.js`

- [ ] **Step 1: Add the asset-copy step to `build.mjs`**

Add to `main()`, after all the page-building calls:

```js
  await cp('assets/css', path.join(PUBLIC_DIR, 'assets', 'css'), { recursive: true });
  await cp(path.join(content.contentDir, 'images'), path.join(PUBLIC_DIR, 'images'), { recursive: true });
  await mkdir(path.join(PUBLIC_DIR, 'assets', 'js'), { recursive: true });
  for (const file of ['members.js', 'projects-graph.js', 'page-back-link.js', 'shared.js']) {
    await cp(path.join('assets', 'js', file), path.join(PUBLIC_DIR, 'assets', 'js', file));
  }
```

(`shared.js` is copied even though nothing currently imports it client-side from a `<script src>` — `members.js`/`projects-graph.js`/`page-back-link.js` `import` it via a relative path, so it needs to exist alongside them in `public/assets/js/` for the browser's ES module resolution to find it.)

- [ ] **Step 2: Write `tests/build.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function writeFixtureContent(dir) {
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'pages'), { recursive: true });
  await mkdir(path.join(dir, 'images'), { recursive: true });
  await writeFile(
    path.join(dir, 'data', 'site.json'),
    JSON.stringify({ bannerLabel: 'TX', title: 'Test Network', subtitle: 'A test subtitle.' })
  );
  await writeFile(
    path.join(dir, 'data', 'members.json'),
    JSON.stringify([{ firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' }])
  );
  await writeFile(
    path.join(dir, 'data', 'projects.json'),
    JSON.stringify([{ id: 'p1', title: 'Test Project', participants: ['secret@example.org'] }])
  );
  await writeFile(path.join(dir, 'data', 'events.json'), JSON.stringify([]));
  await writeFile(path.join(dir, 'data', 'news.json'), JSON.stringify([]));
  await writeFile(path.join(dir, 'pages', 'about.md'), '# About\n\nTest content.');
}

test('build.mjs produces static HTML with no raw email addresses anywhere in the output', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  await writeFixtureContent(contentDir);

  execFileSync('node', ['scripts/build.mjs'], {
    env: { ...process.env, CONTENT_PATH: contentDir },
    stdio: 'pipe',
  });

  const indexHTML = await readFile('public/index.html', 'utf8');
  assert.match(indexHTML, /Test Network/);

  const membersHTML = await readFile('public/members.html', 'utf8');
  assert.doesNotMatch(membersHTML, /secret@example\.org/);
  assert.doesNotMatch(membersHTML, /secret%40example\.org/);

  const projectsHTML = await readFile('public/projects.html', 'utf8');
  assert.doesNotMatch(projectsHTML, /secret@example\.org/);

  const graphJSON = await readFile('public/assets/projects-graph-data.json', 'utf8');
  assert.doesNotMatch(graphJSON, /secret@example\.org/);

  const aboutHTML = await readFile('public/pages/about.html', 'utf8');
  assert.match(aboutHTML, /Test content/);

  await rm(contentDir, { recursive: true, force: true });
});
```

This test runs the real `scripts/build.mjs` as a subprocess against a fixture `CONTENT_PATH`, then asserts on the real `public/` output — it necessarily writes to the repo's actual `public/` directory (gitignored, fine to leave as a build artifact; there's no test-local override for `PUBLIC_DIR` in this iteration of `build.mjs`, which is an acceptable simplification since `public/` is always safe to regenerate).

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: `PASS`, including the new `build.test.js`.

- [ ] **Step 4: Full build smoke-check**

```bash
npm run build
ls public
# assets  events.html  index.html  members.html  news.html  pages  projects.html  images
ls public/pages
# about.html  example.html
grep -rl 'secret@\|email' public/*.html public/pages/*.html public/assets/*.json 2>/dev/null
# expect no matches at all
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs tests/build.test.js
git commit -m "build.mjs: copy static assets; add build integration test"
```

---

## Phase F — Client runtime rewrite (filtering, toggles, graph, accessibility)

### Task 30: Rewrite the `members.js` client-runtime block (DOM filtering, no fetch)

**Files:**
- Modify: `assets/js/members.js`

- [ ] **Step 1: Replace the placeholder block from Task 17**

Replace:

```js
// The client-runtime block below is replaced in a later task (DOM filtering,
// no fetch). Left as a no-op guard for now so the file stays valid between tasks.
if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  wirePortraitFallback(document.getElementById('members-grid'));
}
```

With:

```js
if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  const gridContainer = document.getElementById('members-grid');
  const listContainer = document.getElementById('members-list');
  const filterInput = document.getElementById('member-filter');
  const filterEmptyState = document.getElementById('member-filter-empty');
  const toggle = document.getElementById('member-view-toggle');

  wirePortraitFallback(gridContainer);

  function applyFilter(query) {
    const items = document.querySelectorAll('#members-grid [data-search], #members-list [data-search]');
    let anyVisible = false;
    items.forEach((el) => {
      const match = textMatchesQuery(query, el.dataset.search);
      el.hidden = !match;
      if (match) anyVisible = true;
    });
    filterEmptyState.hidden = items.length === 0 || anyVisible;
  }
  filterInput.addEventListener('input', (e) => applyFilter(e.target.value));

  function setView(mode) {
    gridContainer.hidden = mode !== 'grid';
    listContainer.hidden = mode !== 'list';
    toggle.textContent = mode === 'grid' ? 'Switch to list view' : 'Switch to grid view';
  }
  let mode = window.innerWidth < 700 ? 'list' : 'grid';
  setView(mode);
  toggle.addEventListener('click', () => {
    mode = mode === 'grid' ? 'list' : 'grid';
    setView(mode);
  });
}
```

- [ ] **Step 2: Run the unit tests (unaffected — this block has no pure-function surface, covered by manual/Playwright smoke check in Task 37)**

```bash
npm test
```

Expected: `PASS`.

- [ ] **Step 3: Rebuild and manually verify in a browser**

```bash
npm run build
cd public && python3 -m http.server 8010
```

Open `http://localhost:8010/members.html`: grid view shows by default (wide window), typing in the filter box hides non-matching cards live, the view toggle switches to list and back, no network request for any `.json` file appears in the browser's Network tab.

- [ ] **Step 4: Commit**

```bash
git add assets/js/members.js
git commit -m "Rewrite members.js client runtime as DOM filtering, no fetch"
```

---

### Task 31: Rewrite the `projects-graph.js` client-runtime block

**Files:**
- Modify: `assets/js/projects-graph.js`

- [ ] **Step 1: Update the imports**

Replace the top import line:

```js
import { escapeHTML, getInitials, hashColor, memberSlug } from './shared.js';
```

with (no `fetchJSON`/`initNav` needed anymore):

```js
import { escapeHTML, getInitials, hashColor, memberSlug } from './shared.js';
```

(unchanged from Task 18 — confirming no further import edit is needed here, since `fetchJSON`/`initNav` were never imported by this file in the first place... actually they *were*, in the original file. Check the current top line with `head -1 assets/js/projects-graph.js`; if it still reads `import { fetchJSON, getInitials, hashColor, initNav, escapeHTML } from './shared.js';`, replace it with the line above.)

- [ ] **Step 2: Add reduced-motion support to `renderGraphView`**

Change the function signature and add the reduced-motion branch. Find:

```js
function renderGraphView(nodes, links, svg) {
  const width = svg.clientWidth || 900;
  const height = 600;
  const d3svg = d3.select(svg).attr('viewBox', [0, 0, width, height]);
  d3svg.selectAll('*').remove();
```

Replace with:

```js
function renderGraphView(nodes, links, svg, { reducedMotion = false } = {}) {
  const width = svg.clientWidth || 900;
  const height = 600;
  const d3svg = d3.select(svg).attr('viewBox', [0, 0, width, height]);
  d3svg.selectAll('*').remove();
```

Find:

```js
  const simulation = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-250))
    .force('link', d3.forceLink(links).id((d) => d.id).distance(110))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(90));
```

Replace with:

```js
  const simulation = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-250))
    .force('link', d3.forceLink(links).id((d) => d.id).distance(110))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(90));

  if (reducedMotion) {
    simulation.stop();
    for (let i = 0; i < 300; i += 1) simulation.tick();
  }
```

Find (near the end of the function, right before `return { node, link };`):

```js
  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  return { node, link };
```

Replace with:

```js
  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  if (reducedMotion) {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  return { node, link };
```

- [ ] **Step 3: Add modal focus management and Escape-to-close**

Find:

```js
function openModal(project) {
  const modal = document.getElementById('project-modal');
  document.getElementById('modal-title').textContent = project.title;
  document.getElementById('modal-subtitle').textContent = project.subtitle || '';
  document.getElementById('modal-description').textContent = project.description || '';

  const img = document.getElementById('modal-image');
  if (project.image_url) {
    img.src = project.image_url;
    img.hidden = false;
  } else {
    img.hidden = true;
  }

  const link = document.getElementById('modal-link');
  if (project.url) {
    link.href = project.url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  modal.hidden = false;
}

function closeModal() {
  document.getElementById('project-modal').hidden = true;
}
```

Replace with:

```js
let lastFocusedBeforeModal = null;

function handleModalKeydown(event) {
  const modal = document.getElementById('project-modal');
  if (event.key === 'Escape') {
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = modal.querySelectorAll('button, a[href]');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openModal(project) {
  const modal = document.getElementById('project-modal');
  document.getElementById('modal-title').textContent = project.title;
  document.getElementById('modal-subtitle').textContent = project.subtitle || '';
  document.getElementById('modal-description').textContent = project.description || '';

  const img = document.getElementById('modal-image');
  if (project.image_url) {
    img.src = project.image_url;
    img.hidden = false;
  } else {
    img.hidden = true;
  }

  const link = document.getElementById('modal-link');
  if (project.url) {
    link.href = project.url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  lastFocusedBeforeModal = document.activeElement;
  modal.hidden = false;
  document.getElementById('modal-close').focus();
  document.addEventListener('keydown', handleModalKeydown);
}

function closeModal() {
  document.getElementById('project-modal').hidden = true;
  document.removeEventListener('keydown', handleModalKeydown);
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
    lastFocusedBeforeModal.focus();
  }
}
```

- [ ] **Step 4: Replace the bottom fetch-based init block**

Find (the whole final `if (typeof document !== 'undefined' ...) { ... }` block):

```js
if (typeof document !== 'undefined' && document.getElementById('graph-svg')) {
  initNav('projects');

  Promise.all([fetchJSON('data/projects.json'), fetchJSON('data/members.json')])
    .then(([projects, members]) => {
      renderListView(projects, members, document.getElementById('project-list'));

      const { nodes, links } = buildGraphData(projects, members);

      if (projects.length === 0) {
        document.getElementById('graph-view').innerHTML = '<p class="empty-state">No projects yet.</p>';
      } else {
        const { node, link } = renderGraphView(nodes, links, document.getElementById('graph-svg'));

        document.getElementById('project-filter').addEventListener('input', (e) => {
          applyFilter(e.target.value, nodes, node, link);
        });

        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('project-modal').addEventListener('click', (e) => {
          if (e.target.id === 'project-modal') closeModal();
        });

        document.addEventListener('click', hideScholarLabel);
      }

      const toggle = document.getElementById('view-toggle');
      let mode = window.innerWidth < 700 ? 'list' : 'graph';
      setView(mode);
      toggle.addEventListener('click', () => {
        mode = mode === 'graph' ? 'list' : 'graph';
        setView(mode);
      });
    })
    .catch((err) => {
      document.getElementById('graph-view').innerHTML = '<p class="error-state">Couldn\'t load project data.</p>';
      console.error(err);
    });
}
```

Replace with:

```js
if (typeof document !== 'undefined' && document.getElementById('graph-svg')) {
  fetch('assets/projects-graph-data.json')
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load graph data: ${res.status}`);
      return res.json();
    })
    .then(({ nodes, links }) => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const { node, link } = renderGraphView(nodes, links, document.getElementById('graph-svg'), { reducedMotion });

      document.getElementById('project-filter').addEventListener('input', (e) => {
        applyFilter(e.target.value, nodes, node, link);
      });

      document.getElementById('modal-close').addEventListener('click', closeModal);
      document.getElementById('project-modal').addEventListener('click', (e) => {
        if (e.target.id === 'project-modal') closeModal();
      });

      document.addEventListener('click', hideScholarLabel);

      const toggle = document.getElementById('view-toggle');
      let mode = window.innerWidth < 700 ? 'list' : 'graph';
      setView(mode);
      toggle.addEventListener('click', () => {
        mode = mode === 'graph' ? 'list' : 'graph';
        setView(mode);
      });
    })
    .catch((err) => {
      // The static list view (already in the page) remains the fallback —
      // nothing to replace it with; just log for diagnosis.
      console.error(err);
    });
}
```

Note: `openModal(d.data)` is still called with just the project data (see the `node.each` click handler further up the file, unchanged) — the modal now reads `id/title/subtitle/description/url/image_url` from the sanitized data, which `sanitizeGraphData` (Task 18) already includes.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: `PASS` (the pure functions `filterMatches`/`buildGraphData`/`sanitizeGraphData`/`buildProjectListItems`/`renderListView` are unchanged by this task; this task only touched browser-runtime code, which isn't unit-tested).

- [ ] **Step 6: Rebuild and manually verify**

```bash
npm run build
cd public && python3 -m http.server 8010
```

Open `http://localhost:8010/projects.html`: list view shows first (build-time default), then on a wide window the graph should appear (Task 32 adds the initial-mode-on-load logic that actually flips to graph view once JS runs — if it doesn't yet, that's expected until Task 32 lands). Click a project box → modal opens with focus on the close button; press `Tab` repeatedly and confirm focus stays trapped inside the modal; press `Escape` → modal closes and focus returns to the project box.

- [ ] **Step 7: Commit**

```bash
git add assets/js/projects-graph.js
git commit -m "Rewrite projects-graph.js client runtime: sanitized JSON, modal a11y, reduced motion"
```

---

### Task 32: CSS — skip link, hero logo layout, focus-visible states

**Files:**
- Modify: `assets/css/style.css`

- [ ] **Step 1: Add the skip-link styles**

Add near the top of the file, after the `:root` block:

```css
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--color-accent);
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 0 0 6px 0;
  z-index: 100;
  text-decoration: none;
}
.skip-link:focus {
  left: 0;
}
```

- [ ] **Step 2: Add focus-visible styles**

Add right after the `a { color: var(--color-accent); }` rule:

```css
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Add the hero logo layout**

Add right after the existing `.hero { ... }` rule:

```css
.hero-inner { display: flex; align-items: center; gap: 1.5rem; }
.hero-logo { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; border-radius: 8px; }
.hero-text { flex: 1; min-width: 200px; }
.hero-text h1, .hero-text p { margin: 0; }
.hero-text p { margin-top: 0.5rem; }

@media (max-width: 700px) {
  .hero-inner { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 4: Rebuild and visually verify**

```bash
npm run build
cd public && python3 -m http.server 8010
```

Open `http://localhost:8010/index.html`: logo sits to the left of the title/subtitle at normal width; resize below ~700px and confirm it stacks above the text. Tab from the browser address bar into the page and confirm the skip link becomes visible on the very first `Tab` press, and that a visible outline appears on nav links, buttons, and the filter input as you continue tabbing.

- [ ] **Step 5: Commit**

```bash
git add assets/css/style.css
git commit -m "Add skip-link, hero logo layout, and focus-visible styles"
```

---

### Task 33: Make the Projects graph the default view on load (wide viewports), matching prior behavior

**Files:**
- Modify: `assets/js/projects-graph.js`

Task 28 made the *build-time* default `list-view` visible (so it's real content at first paint, for crawlers and no-JS users). This task makes the client JS immediately switch to graph view on load for wide viewports once it has successfully fetched and rendered the graph — restoring the original "graph first on desktop" experience for capable browsers, while everything still degrades to the static list if JS doesn't run.

- [ ] **Step 1: Confirm the existing `mode`/`setView` logic in the block edited in Task 31 already does this**

Re-read the block added in Task 31, Step 4 — it already computes `let mode = window.innerWidth < 700 ? 'list' : 'graph'; setView(mode);` right after the graph successfully renders. No code change needed; this task is a **verification-only** task.

- [ ] **Step 2: Verify with the browser**

```bash
npm run build
cd public && python3 -m http.server 8010
```

At a window width ≥700px, open `http://localhost:8010/projects.html` — confirm the page briefly shows the static list (visible for an instant before JS runs, or indefinitely if JS is disabled via devtools), then switches to the graph view once the sanitized JSON loads and `setView('graph')` runs.

- [ ] **Step 3: No commit needed** — no files changed in this task.

---

## Phase G — Cleanup, CI, docs, final verification

### Task 34: Delete the now-obsolete root HTML source files

`index.html`, `members.html`, `projects.html`, `events.html`, `news.html`, `pages.html` are all now generated by `build.mjs` into `public/` — the root copies are dead weight and, if left in place, would confusingly still work when served directly (with all their old `data/`-fetching, now-broken behavior) alongside the real `public/` output.

**Files:**
- Delete: `index.html`, `members.html`, `projects.html`, `events.html`, `news.html`, `pages.html`

- [ ] **Step 1: Confirm `build.mjs` covers everything they contained**

```bash
npm run build
diff <(grep -o 'id="[a-z-]*"' public/index.html | sort) <(grep -o 'id="[a-z-]*"' index.html | sort)
```

Expect only the `nav`/`about-box` placeholder-id differences already accounted for by the build (the generated page has the *rendered* nav/about content in place of the old empty placeholder divs, so their inner ids may differ — eyeball the diff rather than requiring it to be empty; there should be no *page* (`members.html`, etc.) missing from `public/` that existed at the root).

- [ ] **Step 2: Delete the root files**

```bash
git rm index.html members.html projects.html events.html news.html pages.html
```

- [ ] **Step 3: Verify `npm run build` still succeeds from a clean state**

```bash
rm -rf public
npm run build
ls public
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove root HTML source files, superseded by build.mjs-generated public/"
```

---

### Task 35: Update `.gitlab-ci.yml`

**Files:**
- Modify: `.gitlab-ci.yml`

- [ ] **Step 1: Replace the `pages` job**

Current:
```yaml
pages:
  stage: pages
  image: alpine:latest
  script:
    - mkdir -p public
    - cp -r index.html members.html projects.html events.html news.html pages.html assets data pages public/
  artifacts:
    paths:
      - public
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

New:
```yaml
pages:
  stage: pages
  image: node:22-alpine
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - public
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

`CONTENT_PATH`/`CONTENT_USERNAME`/`CONTENT_PASSWORD` are read automatically by `npm run build` from the job's environment when a real deployment sets them as GitLab CI/CD variables (Settings → CI/CD → Variables); when unset, the build uses the committed generic `content/` tree, same as the `validate` stage already does.

- [ ] **Step 2: Verify the full file**

```bash
cat .gitlab-ci.yml
```

Expected:
```yaml
stages:
  - validate
  - pages

validate:
  stage: validate
  image: node:22-alpine
  script:
    - npm run validate
    - npm test
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'

pages:
  stage: pages
  image: node:22-alpine
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - public
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

- [ ] **Step 3: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "CI: build the static site with Node instead of a raw file copy"
```

---

### Task 36: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the full file**

```markdown
# Comparative Legal Futures Network — Website

Static, no-backend website for the Comparative Legal Futures Network
(CLFN), a fictitious example research collaboration used as this
repo's generic default content. See
`docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md` and
`docs/superpowers/specs/2026-09-23-static-build-pipeline-design.md` for
the full design.

A Node build step (`npm run build`) turns hand-maintained JSON/Markdown
content in `content/` into fully static, crawlable HTML in `public/` — the
directory GitLab Pages publishes. Node is a build-time tool only; the
deployed site itself needs no Node, no backend, no secrets.

**Reusing this template for a real group:** replace everything under
`content/` (JSON files, `content/pages/`, `content/images/`) with your own
data in the same shape (see `schema/`), or point `CONTENT_PATH` (see
`.env.example`) at a local directory or remote URL holding your real data
instead of editing the committed generic content directly.

## Local preview

    npm install
    npm run build
    cd public && python3 -m http.server 8000

Then open `http://localhost:8000/index.html`. Re-run `npm run build` (or
use `npm run build:watch` to rebuild automatically on every save) after any
content or code change — what's in `public/` is exactly what ships.

## Running checks

    npm run validate   # JSON Schema validation of content/data/*.json
    npm test            # unit tests for pure logic (node --test)

Both require Node.js locally (only for tooling — the deployed site itself
needs no Node, no backend, no secrets).

## Editing content

Add or edit a member, project, event, or news item by hand-editing the
matching JSON file in `content/data/` and opening a merge request. Each
file must validate against its schema in `schema/` (`npm run validate`
checks this locally; CI enforces it on every push).

- `site.json`: site-wide text and branding (nav banner label, landing page
  title/subtitle, optional `favicon`/`logo` filenames pointing at
  `content/images/`).
- `members.json`: `email` is the unique id, referenced by
  `projects[].participants`. Email addresses are never rendered or shipped
  to the browser — they're used only at build time to resolve
  participants, and a name-based slug (not the email) is used for any
  generated link/anchor id.
- `projects.json`: `participants` is a list of member emails.
- `events.json`: sorted newest-first automatically at build time — no need
  to keep the file itself in date order.
- `news.json`: same shape as `events.json`. `url` can be an absolute
  `http(s)://` link (opens in a new tab) or `pages.html?doc=<filename>`
  (rewritten at build time to the real static page URL, opens in the same
  tab).

Adding a longer write-up (e.g. to link from a news item) means adding a
`.md` or `.html` file under `content/pages/` — the build turns it into its
own static page (`content/pages/about.md` → `public/pages/about.html`), no
code changes required. Link to it from `news.json`/`events.json` with
`pages.html?doc=<filename>`.

The landing page's "About" box is `content/pages/about.md` too — rendered
into `index.html` directly at build time. Editing it updates both places.

### Pointing the build at real (non-generic) data

`CONTENT_PATH` (in `.env`, or a CI/CD variable) overrides which `content/`
tree the build reads from. Locally:

    cp .env.example .env
    # edit .env: CONTENT_PATH=.local/content
    npm run build

`.local/content/` is gitignored and holds this repo's real (as opposed to
the committed generic template) data — see `.env.example` for the remote
(local path or URL) forms `CONTENT_PATH` accepts.

## Manual smoke checklist (after any change)

- [ ] `npm run build` succeeds from a clean `public/`.
- [ ] Landing page: hero shows logo (if configured) to the left of the
      title/subtitle, stacking above on a narrow window; two-column layout
      below the hero (About box left, stacked News/Events boxes right);
      narrow window (<700px) collapses to one column.
- [ ] Members page, grid view: cards sorted by lastname; portraits or
      initials-avatar fallback render correctly; no email address anywhere
      in the page source (`view-source:`, not just the rendered page).
- [ ] Members page, list view: toggle works both ways; narrow window
      (<700px) defaults to list view; filter box narrows both views by
      name or affiliation, live, with no network request.
- [ ] Projects page: static list view is the page's real content (visible
      immediately, before/without JS); on a wide window with JS enabled it
      switches to the graph view — nodes render, drag/pan/zoom work,
      filter dims non-matches, clicking a project opens the modal,
      clicking a scholar highlights their subgraph; no email address
      anywhere in the page source or in `assets/projects-graph-data.json`.
- [ ] Events page: sorted newest-first, "Upcoming" badge on future dates;
      landing page's Events box shows only the 3 most recent entries plus a
      "See all events" link.
- [ ] News page: sorted newest-first; landing page's News box shows only
      the 3 most recent entries plus a "See all news" link.
- [ ] A `content/pages/` document renders at its own static URL
      (`public/pages/<name>.html`); reaching it from News or Events shows a
      "← All News"/"← All Events" back-link.
- [ ] Keyboard-only pass: the skip link is the first focusable element on
      every page and jumps to the main content; nav, filter boxes, view
      toggles, and the project modal (including `Escape` to close and
      focus returning to the triggering element) are all reachable and
      operable without a mouse.
- [ ] JS-disabled pass: every page's real content is present and readable
      with JavaScript turned off; only the Projects graph and the filter
      boxes are expected to be inert (the Projects list view still shows).
- [ ] `npm run validate` and `npm test` both pass.

## Local tooling credentials

Copy `.env.example` to `.env` and fill in `GITLAB_TOKEN` for local GitLab
API tooling, and/or `CONTENT_PATH`/`CONTENT_USERNAME`/`CONTENT_PASSWORD` to
build from real or remote content. Never commit `.env` or paste any of its
values into chat/logs.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Rewrite README for the build pipeline and generic template"
```

---

### Task 37: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Clean install and full test/validate pass**

```bash
rm -rf node_modules public
npm install
npm test
npm run validate
```

Expected: all green.

- [ ] **Step 2: Clean build**

```bash
npm run build
```

Expected: succeeds, `public/` contains `index.html`, `members.html`, `projects.html`, `events.html`, `news.html`, `pages/about.html`, `pages/example.html`, `assets/css/style.css`, `assets/js/{members,projects-graph,page-back-link,shared}.js`, `assets/projects-graph-data.json`, `images/{favicon.ico,logo.png}`.

- [ ] **Step 3: Confirm zero email exposure anywhere in the shipped output**

```bash
grep -rl "@example\." public/ 2>/dev/null
```

Expected: **no output** — no email address appears anywhere under `public/`, in any file, HTML or JSON.

- [ ] **Step 4: Confirm no leftover RCSL/Boulanger references in what ships or in tests**

```bash
grep -rli "rcsl\|boulanger\|lhlt.mpg.de" public/ content/ tests/ README.md 2>/dev/null
```

Expected: **no output**. (`docs/superpowers/specs/2026-09-22-*` and `docs/superpowers/plans/2026-09-22-*` are historical planning documents and are expected to still mention the original name — that's fine, they're not shipped content and not re-checked here.)

- [ ] **Step 5: Manual browser smoke pass**

```bash
cd public && python3 -m http.server 8010
```

Walk the full README smoke checklist (Task 36) by hand in a real browser: landing page hero/logo, Members grid+list+filter, Projects list-then-graph+filter+modal+keyboard+Escape, Events/News, a `content/pages/` document with its back-link, skip link, and a JS-disabled pass (devtools → disable JavaScript → reload each page).

- [ ] **Step 6: Confirm CI would pass**

```bash
cat .gitlab-ci.yml   # eyeball: validate stage unchanged in spirit, pages stage runs npm install && npm run build
```

- [ ] **Step 7: Final commit (only if any fixes were needed in the steps above)**

```bash
git add -A
git status --short   # review before committing anything unexpected
git commit -m "Fix issues found in final verification pass"
```

If Steps 1–6 all passed cleanly with no fixes needed, skip this step — there's nothing to commit.

---

## Summary of what changed

- `data/` no longer exists. `content/` (JSON + `pages/` + `images/`) is the swappable input; `schema/` is top-level code.
- `scripts/build.mjs` generates fully static, crawlable `public/` — zero raw content JSON ever reaches the browser; only a build-time-sanitized `projects-graph-data.json` (no emails) ships, for the one genuinely interactive feature.
- Member/project anchor links use a name-based slug, never the email.
- `pages.html?doc=` is gone; every `content/pages/` document gets its own static URL.
- The browser's remaining JS is small: portrait-fallback wiring, Members/Projects DOM-based filtering and view toggles, and the Projects D3 graph (now with keyboard-trapped/`Escape`-closing modal and `prefers-reduced-motion` support). A skip link is on every page.
- `content/`, `README.md`, and test fixtures are fully genericized to a fictitious "Comparative Legal Futures Network"; the pre-refactor real-ish data is preserved, gitignored, in `.local/content/`.
- CI's `pages` job runs `npm run build` instead of a raw file copy.
