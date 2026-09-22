# RCSL WG Histories Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the static, no-backend RCSL WG Histories website (landing, Members, Projects, Events pages) described in `docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`, populated with fake/placeholder data as a proof of concept ahead of real data entry.

**Architecture:** Plain HTML/CSS/vanilla JS, ES modules loaded via `<script type="module">`, zero build step. D3 (v7, CDN `<script>` tag) powers only the Projects graph. Each page fetches its JSON from `data/*.json` client-side and renders the DOM directly. JSON Schemas in `data/schema/` validate the three data files, checked locally via `ajv-cli` (via `npx`, no persisted dependency) and later in CI.

**Tech Stack:** HTML5, CSS3 (custom properties, flexbox/grid), vanilla ES modules, D3 v7 (CDN), Node.js built-in test runner (`node --test`) for unit-testable pure logic, `ajv-cli` (via `npx`) for JSON Schema validation, GitLab CI/CD, GitLab Pages.

## Global Constraints

- No backend, no database, no build step/bundler/framework — plain static files served as-is. (spec: Architecture)
- D3 is the only external dependency, loaded via CDN `<script>` tag, used only by the Projects graph. (spec: Architecture)
- `email` is the unique id for members, referenced by `projects[].participants`. (spec: Data model)
- Optional fields (`url`, `portrait_url`, `subtitle`, `description`, `url`, `image_url`) must degrade gracefully when absent — no broken layout, no dead links. (spec: Data model, Error handling)
- Accent color `#2c5282`; system sans-serif stack `-apple-system, "Helvetica Neue", Arial, sans-serif`; white/near-white background; content max-width ~1100–1200px. (spec: Visual design system)
- Initials-avatar fallback, fill color deterministically hashed from the member's email. (spec: Visual design system, Error handling)
- Responsive breakpoint ~700px: Projects page defaults to list view below it. (spec: Accessible list view)
- Project modal's external link uses `target="_blank" rel="noopener"`. (spec: Projects graph)
- Events sorted newest-first (`date` descending) so the next/most-recent meeting is always on top; landing page links to the Events page rather than duplicating the list. (spec: Data model, Pages)
- Dangling `participants` email references are logged as a warning and simply not rendered — must not crash the graph. (spec: Error handling)
- No persisted Node dependency in the repo (`npx ajv-cli`, no committed `node_modules`). (spec: CI data validation)
- All data for this implementation pass is **fake/placeholder data** — clearly fictional names, affiliations, and placeholder image services (pravatar.cc, picsum.photos) — to be replaced with real data later. This does not change the data *shape*, only its content.
- Per spec's Testing approach, a formal test suite is not warranted for DOM rendering — apply automated `node --test` unit tests only to pure, non-DOM logic; verify DOM/D3 rendering by manual smoke check.

---

## File Structure

```
/
├── index.html                 # landing page (Task 3)
├── members.html                # Task 4
├── events.html                 # Task 5
├── projects.html               # Task 7
├── package.json                 # Task 1 — "type": "module", test/validate scripts, no deps
├── data/
│   ├── members.json             # Task 1 — fake data
│   ├── projects.json            # Task 1 — fake data
│   ├── events.json              # Task 1 — fake data
│   └── schema/
│       ├── members.schema.json  # Task 1
│       ├── projects.schema.json # Task 1
│       └── events.schema.json   # Task 1
├── assets/
│   ├── css/style.css            # Task 3 (base) + Task 4/5/7 (additions)
│   └── js/
│       ├── shared.js            # Task 2 — nav, initials/hash, fetch helper, portrait fallback
│       ├── members.js           # Task 4
│       ├── events.js            # Task 5
│       └── projects-graph.js    # Task 6 (pure data helpers) + Task 7 (D3 rendering)
├── tests/
│   ├── shared.test.js           # Task 2
│   ├── members.test.js          # Task 4
│   ├── events.test.js           # Task 5
│   └── projects-graph.test.js   # Task 6
├── .gitlab-ci.yml               # Task 8 — validate + pages stages
├── .gitignore                    # already exists; Task 1 adds node_modules/
├── .env.example                  # already exists, unchanged
└── README.md                     # Task 8 — data-editing + local preview + smoke checklist
```

Each JS module keeps pure, unit-testable logic in exported functions at the top, and a DOM "bootstrap" block at the bottom guarded by `typeof document !== 'undefined' && document.getElementById(...)`, so the same file can be `import`-ed by both the browser (`<script type="module">`) and Node's test runner without executing browser-only code under Node.

---

### Task 1: Project scaffolding, JSON Schemas, and fake data

**Files:**
- Create: `package.json`
- Create: `data/schema/members.schema.json`
- Create: `data/schema/projects.schema.json`
- Create: `data/schema/events.schema.json`
- Create: `data/members.json`
- Create: `data/projects.json`
- Create: `data/events.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: the three data files and their schemas, which every later task's JS fetches/renders; `npm run validate` / `npm test` scripts used by Tasks 2, 4, 5, 6.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rcsl-wg-histories",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "validate:members": "npx --yes ajv-cli validate -s data/schema/members.schema.json -d data/members.json",
    "validate:projects": "npx --yes ajv-cli validate -s data/schema/projects.schema.json -d data/projects.json",
    "validate:events": "npx --yes ajv-cli validate -s data/schema/events.schema.json -d data/events.json",
    "validate": "npm run validate:members && npm run validate:projects && npm run validate:events"
  }
}
```

- [ ] **Step 2: Add `node_modules/` to `.gitignore`**

Append to the existing `.gitignore`:

```
# npx-installed tooling (ajv-cli), never committed
node_modules/
```

- [ ] **Step 3: Create `data/schema/members.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Members",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["lastname", "firstname", "affiliation", "email"],
    "properties": {
      "lastname": { "type": "string", "minLength": 1 },
      "firstname": { "type": "string", "minLength": 1 },
      "affiliation": { "type": "string", "minLength": 1 },
      "email": { "type": "string", "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
      "url": { "type": "string", "pattern": "^https?://" },
      "portrait_url": { "type": "string", "pattern": "^https?://" }
    }
  }
}
```

- [ ] **Step 4: Create `data/schema/projects.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Projects",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "title", "participants"],
    "properties": {
      "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
      "title": { "type": "string", "minLength": 1 },
      "subtitle": { "type": "string" },
      "description": { "type": "string" },
      "url": { "type": "string", "pattern": "^https?://" },
      "image_url": { "type": "string", "pattern": "^https?://" },
      "participants": {
        "type": "array",
        "items": { "type": "string", "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" }
      }
    }
  }
}
```

- [ ] **Step 5: Create `data/schema/events.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Events",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["date", "title"],
    "properties": {
      "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
      "title": { "type": "string", "minLength": 1 },
      "url": { "type": "string", "pattern": "^https?://" }
    }
  }
}
```

- [ ] **Step 6: Create fake `data/members.json`**

```json
[
  {
    "lastname": "Adler",
    "firstname": "Ada",
    "affiliation": "Institute for Legal History",
    "url": "https://example.edu/people/adler",
    "email": "ada.adler@example.edu",
    "portrait_url": "https://i.pravatar.cc/300?img=47"
  },
  {
    "lastname": "Bergman",
    "firstname": "Bo",
    "affiliation": "Centre for Socio-Legal Studies",
    "url": "https://example.ac.uk/people/bergman",
    "email": "bo.bergman@example.ac.uk"
  },
  {
    "lastname": "Okoro",
    "firstname": "Chidi",
    "affiliation": "Faculty of Law, University of Lagos",
    "url": "https://example.edu.ng/people/okoro",
    "email": "chidi.okoro@example.edu.ng",
    "portrait_url": "https://i.pravatar.cc/300?img=12"
  },
  {
    "lastname": "Kovac",
    "firstname": "Dana",
    "affiliation": "Department of Sociology, University of Zagreb",
    "url": "https://example.hr/people/kovac",
    "email": "dana.kovac@example.hr",
    "portrait_url": "https://i.pravatar.cc/300?img=32"
  },
  {
    "lastname": "Sundstrom",
    "firstname": "Erik",
    "affiliation": "Faculty of Law, Uppsala University",
    "email": "erik.sundstrom@example.se"
  }
]
```

Note: `Bergman` and `Sundstrom` intentionally omit `portrait_url` to exercise the initials-avatar fallback.

- [ ] **Step 7: Create fake `data/projects.json`**

```json
[
  {
    "id": "history-of-rcsl",
    "title": "A History of the RCSL",
    "subtitle": "Tracing the network's origins from 1962 to today",
    "description": "A collaborative research project reconstructing the institutional history of the Research Committee on Sociology of Law through archival research and oral history interviews.",
    "url": "https://example.org/projects/history-of-rcsl",
    "image_url": "https://picsum.photos/seed/rcsl/600/400",
    "participants": ["ada.adler@example.edu", "bo.bergman@example.ac.uk", "dana.kovac@example.hr"]
  },
  {
    "id": "biographies-project",
    "title": "Biographical Dictionary of Socio-Legal Scholars",
    "subtitle": "A collective reference work on the field's founding generation",
    "description": "An edited volume gathering short critical biographies of scholars who shaped the sociology of law as a discipline.",
    "url": "https://example.org/projects/biographies",
    "image_url": "https://picsum.photos/seed/biographies/600/400",
    "participants": ["ada.adler@example.edu", "chidi.okoro@example.edu.ng", "erik.sundstrom@example.se"]
  },
  {
    "id": "oral-history-archive",
    "title": "Oral History Archive",
    "subtitle": "Recorded interviews with senior scholars in the sociology of law",
    "description": "A growing archive of recorded and transcribed interviews, conducted with founding and senior members of the field.",
    "participants": ["bo.bergman@example.ac.uk", "chidi.okoro@example.edu.ng"]
  }
]
```

Note: `oral-history-archive` intentionally omits `url` and `image_url` to exercise optional-field handling in the modal and list view.

- [ ] **Step 8: Create fake `data/events.json`**

```json
[
  {
    "date": "2022-01-20",
    "title": "Informal planning call"
  },
  {
    "date": "2023-03-10",
    "title": "Founding roundtable, Onati",
    "url": "https://example.org/events/onati-2023"
  },
  {
    "date": "2024-09-04",
    "title": "Working Group approved at RCSL Board meeting, Bangor, Wales",
    "url": "https://example.org/events/bangor-2024"
  },
  {
    "date": "2025-07-02",
    "title": "Second Working Group meeting (online)"
  },
  {
    "date": "2026-11-12",
    "title": "Next Working Group meeting, Berlin",
    "url": "https://example.org/events/berlin-2026"
  }
]
```

Note: entries are deliberately **not** pre-sorted, and one date (`2026-11-12`) is in the future relative to today (2026-09-22), so the render-time sort in Task 5 has something real to prove.

- [ ] **Step 9: Validate all three files pass their schemas**

Run: `npm run validate`
Expected: all three `ajv-cli validate` calls print `data/members.json valid`, `data/projects.json valid`, `data/events.json valid` (exit code 0).

- [ ] **Step 10: Confirm the schema actually rejects bad data**

Temporarily remove the `"title"` line from the first entry in `data/events.json`, run `npm run validate:events`, and confirm it FAILS (non-zero exit, error mentioning `required property 'title'`). Then revert the file to the Step 8 content exactly.

- [ ] **Step 11: Commit**

```bash
git add package.json .gitignore data/
git commit -m "Add data schemas and fake proof-of-concept data"
```

---

### Task 2: `shared.js` — nav, avatar helpers, fetch wrapper

**Files:**
- Create: `assets/js/shared.js`
- Create: `tests/shared.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (imported by every later page module): `getInitials(firstname, lastname): string`, `hashColor(key, palette?): string`, `fetchJSON(url): Promise<any>`, `navHTML(activePage): string`, `initNav(activePage): void`, `wirePortraitFallback(root?): void`.

- [ ] **Step 1: Write `assets/js/shared.js`**

```js
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

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'members.html', label: 'Members', page: 'members' },
  { href: 'projects.html', label: 'Projects', page: 'projects' },
  { href: 'events.html', label: 'Events', page: 'events' },
];

export function navHTML(activePage) {
  const items = NAV_LINKS.map(
    (l) => `<a href="${l.href}"${l.page === activePage ? ' class="active"' : ''}>${l.label}</a>`
  ).join('');
  return `<nav class="site-nav"><span class="site-title">RCSL WG Histories</span><div class="nav-links">${items}</div></nav>`;
}

export function initNav(activePage) {
  const mount = document.getElementById('nav');
  if (mount) mount.outerHTML = navHTML(activePage);
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

- [ ] **Step 2: Write `tests/shared.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitials, hashColor, navHTML } from '../assets/js/shared.js';

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

test('hashColor returns a color from the given palette', () => {
  const palette = ['#111111', '#222222'];
  const color = hashColor('someone@example.org', palette);
  assert.ok(palette.includes(color));
});

test('navHTML marks the active page link', () => {
  const html = navHTML('members');
  assert.match(html, /<a href="members.html" class="active">Members<\/a>/);
});

test('navHTML has no active class when page does not match any link', () => {
  const html = navHTML('nonexistent');
  assert.doesNotMatch(html, /class="active"/);
});
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/shared.test.js`
Expected: 6 tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add assets/js/shared.js tests/shared.test.js
git commit -m "Add shared.js with nav, avatar, and fetch helpers"
```

---

### Task 3: Base CSS design system + landing page

**Files:**
- Create: `assets/css/style.css`
- Create: `index.html`

**Interfaces:**
- Consumes: `shared.js`'s `initNav`.
- Produces: the base stylesheet (design tokens, nav, hero, section spacing, footer, empty/error states) that Tasks 4/5/7 append to.

- [ ] **Step 1: Write `assets/css/style.css`**

```css
:root {
  --color-bg: #ffffff;
  --color-bg-alt: #fafafa;
  --color-text: #1a1a1a;
  --color-muted: #666666;
  --color-accent: #2c5282;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --max-width: 1150px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.5;
}

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

a { color: var(--color-accent); }

.site-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #eee;
}

.site-title { font-weight: 600; }

.nav-links a {
  margin-left: 1.5rem;
  text-decoration: none;
  color: var(--color-text);
  padding-bottom: 0.25rem;
}

.nav-links a.active {
  color: var(--color-accent);
  border-bottom: 2px solid var(--color-accent);
}

section + section { margin-top: 2.5rem; }

.hero { background: var(--color-bg-alt); padding: 2.5rem 1.5rem; border-radius: 8px; }

footer {
  max-width: var(--max-width);
  margin: 2rem auto;
  padding: 1.5rem;
  color: var(--color-muted);
}

.empty-state, .error-state { color: var(--color-muted); }

@media (max-width: 700px) {
  .site-nav { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
  .nav-links a { margin-left: 0; margin-right: 1rem; }
}
```

- [ ] **Step 2: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RCSL WG Histories of the Sociology of Law</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div id="nav"></div>
  <main>
    <section class="hero">
      <h1>RCSL Working Group &ldquo;Histories of the Sociology of Law&rdquo;</h1>
      <p>Approved as a Working Group of the Research Committee on Sociology of Law (RCSL) at the Board meeting in Bangor, Wales, 4 September 2024.</p>
    </section>

    <section>
      <h2>About the Working Group</h2>
      <p>The Working Group brings together scholars researching the intellectual, institutional, and biographical history of the sociology of law as a field.</p>
      <p><a href="#" target="_blank" rel="noopener">Board meeting presentation</a> &middot; <a href="#" target="_blank" rel="noopener">Roundtable minutes</a></p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>Chair: Christian Boulanger, Max Planck Institute for Legal History and Legal Theory<br>
      <a href="mailto:boulanger@lhlt.mpg.de">boulanger@lhlt.mpg.de</a></p>
    </section>

    <section>
      <h2>Membership &amp; mailing list</h2>
      <p>To join the mailing list, send a blank email to the list's subscribe address, or use the
      <a href="#" target="_blank" rel="noopener">listinfo page</a>. Unsubscribing from the list is treated as
      leaving the Working Group. Formal membership in the Working Group requires RCSL membership.</p>
    </section>

    <section>
      <h2>Meetings</h2>
      <p>See the <a href="events.html">Events page</a> for the full meeting history and the next planned gathering.</p>
    </section>
  </main>
  <footer>
    <p><a href="members.html">Members</a> &middot; <a href="projects.html">Projects</a> &middot; <a href="events.html">Events</a></p>
  </footer>
  <script type="module">
    import { initNav } from './assets/js/shared.js';
    initNav('home');
  </script>
</body>
</html>
```

**Note:** this landing-page copy is placeholder text following the spec's section structure (Hero / About / Contact / Membership / Meetings), not a verbatim transcription of the real HedgeDoc pad — the exact pad wording wasn't available in this implementation pass. Flag for replacement with the real text before this goes live with real data.

- [ ] **Step 3: Manual verification**

Run: `python -m http.server 8000` from the repo root, open `http://localhost:8000/index.html`.
Expected: nav bar renders with "Home" underlined in blue, all five sections render with correct headings, footer links work.

- [ ] **Step 4: Commit**

```bash
git add assets/css/style.css index.html
git commit -m "Add base design system and landing page"
```

---

### Task 4: Members page

**Files:**
- Create: `assets/js/members.js`
- Create: `tests/members.test.js`
- Create: `members.html`
- Modify: `assets/css/style.css` (append member-grid styles)

**Interfaces:**
- Consumes: `shared.js`'s `getInitials`, `hashColor`, `fetchJSON`, `initNav`, `wirePortraitFallback`.
- Produces: `sortMembersByLastname(members): array`, `renderMemberCard(member): string`, `renderMembers(members, container): void`.

- [ ] **Step 1: Write `assets/js/members.js`**

```js
import { getInitials, hashColor, fetchJSON, initNav, wirePortraitFallback } from './shared.js';

export function sortMembersByLastname(members) {
  return [...members].sort((a, b) =>
    a.lastname.localeCompare(b.lastname, undefined, { sensitivity: 'base' })
  );
}

export function renderMemberCard(member) {
  const initials = getInitials(member.firstname, member.lastname);
  const color = hashColor(member.email);
  const nameHTML = member.url
    ? `<a href="${member.url}" target="_blank" rel="noopener">${member.firstname} ${member.lastname}</a>`
    : `${member.firstname} ${member.lastname}`;
  const portrait = member.portrait_url
    ? `<img class="avatar" src="${member.portrait_url}" alt="" data-portrait-fallback data-initials="${initials}" data-avatar-color="${color}">`
    : `<div class="avatar-fallback" style="background-color:${color}">${initials}</div>`;
  return `<li class="member-card">${portrait}<h3>${nameHTML}</h3><p class="affiliation">${member.affiliation}</p><p class="email"><a href="mailto:${member.email}">${member.email}</a></p></li>`;
}

export function renderMembers(members, container) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-grid">${sorted.map(renderMemberCard).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  initNav('members');
  const container = document.getElementById('members-grid');
  fetchJSON('data/members.json')
    .then((members) => {
      renderMembers(members, container);
      wirePortraitFallback(container);
    })
    .catch((err) => {
      container.innerHTML = '<p class="error-state">Couldn\'t load member data.</p>';
      console.error(err);
    });
}
```

- [ ] **Step 2: Write `tests/members.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMembersByLastname, renderMemberCard } from '../assets/js/members.js';

const sample = [
  { firstname: 'Christian', lastname: 'Boulanger', affiliation: 'MPI', email: 'a@example.org' },
  { firstname: 'Ada', lastname: 'Adler', affiliation: 'Uni X', email: 'b@example.org' },
];

test('sortMembersByLastname sorts alphabetically by lastname', () => {
  const sorted = sortMembersByLastname(sample);
  assert.deepEqual(sorted.map((m) => m.lastname), ['Adler', 'Boulanger']);
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
  assert.match(html, />CB</);
});
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/members.test.js`
Expected: 4 tests pass, 0 failures.

- [ ] **Step 4: Write `members.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Members — RCSL WG Histories</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div id="nav"></div>
  <main>
    <h1>Members</h1>
    <div id="members-grid"></div>
  </main>
  <script type="module" src="assets/js/members.js"></script>
</body>
</html>
```

- [ ] **Step 5: Append member-grid CSS to `assets/css/style.css`**

```css
.member-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}

.member-card {
  text-align: center;
  padding: 1.25rem;
  border: 1px solid #eee;
  border-radius: 8px;
}

.avatar, .avatar-fallback {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  margin: 0 auto 0.75rem;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 1.25rem;
}

.member-card h3 { margin: 0.25rem 0; font-size: 1rem; }
.member-card .affiliation { color: var(--color-muted); font-size: 0.9rem; margin: 0.25rem 0; }
.member-card .email a { font-size: 0.85rem; }

@media (max-width: 700px) {
  .member-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
}
```

- [ ] **Step 6: Manual verification**

With the local server still running, open `http://localhost:8000/members.html`.
Expected: 5 member cards sorted Adler, Bergman, Kovac, Okoro, Sundstrom; Bergman and Sundstrom show initials-avatar fallbacks (no portrait), the others show pravatar.cc photos; narrowing the browser window below ~700px collapses the grid to fewer columns.

- [ ] **Step 7: Commit**

```bash
git add assets/js/members.js tests/members.test.js members.html assets/css/style.css
git commit -m "Add Members page"
```

---

### Task 5: Events page

**Files:**
- Create: `assets/js/events.js`
- Create: `tests/events.test.js`
- Create: `events.html`
- Modify: `assets/css/style.css` (append event-list styles)

**Interfaces:**
- Consumes: `shared.js`'s `fetchJSON`, `initNav`.
- Produces: `sortEventsByDateDesc(events): array`, `isUpcoming(event, today?): boolean`, `renderEventItem(event, today): string`, `renderEvents(events, container, today?): void`.

- [ ] **Step 1: Write `assets/js/events.js`**

```js
import { fetchJSON, initNav } from './shared.js';

export function sortEventsByDateDesc(events) {
  return [...events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function isUpcoming(event, today = new Date().toISOString().slice(0, 10)) {
  return event.date >= today;
}

export function renderEventItem(event, today) {
  const titleHTML = event.url
    ? `<a href="${event.url}" target="_blank" rel="noopener">${event.title}</a>`
    : event.title;
  const badge = isUpcoming(event, today) ? '<span class="badge upcoming">Upcoming</span>' : '';
  return `<li class="event-item"><span class="event-date">${event.date}</span><span class="event-title">${titleHTML}</span>${badge}</li>`;
}

export function renderEvents(events, container, today = new Date().toISOString().slice(0, 10)) {
  const sorted = sortEventsByDateDesc(events);
  container.innerHTML = sorted.length
    ? `<ul class="event-list">${sorted.map((e) => renderEventItem(e, today)).join('')}</ul>`
    : '<p class="empty-state">No events yet.</p>';
}

if (typeof document !== 'undefined' && document.getElementById('events-list')) {
  initNav('events');
  const container = document.getElementById('events-list');
  fetchJSON('data/events.json')
    .then((events) => renderEvents(events, container))
    .catch((err) => {
      container.innerHTML = '<p class="error-state">Couldn\'t load event data.</p>';
      console.error(err);
    });
}
```

- [ ] **Step 2: Write `tests/events.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortEventsByDateDesc, isUpcoming, renderEventItem } from '../assets/js/events.js';

const events = [
  { date: '2024-09-04', title: 'Bangor roundtable' },
  { date: '2026-11-10', title: 'Next meeting', url: 'https://example.org' },
  { date: '2023-01-15', title: 'Kickoff' },
];

test('sortEventsByDateDesc orders newest first', () => {
  const sorted = sortEventsByDateDesc(events);
  assert.deepEqual(sorted.map((e) => e.date), ['2026-11-10', '2024-09-04', '2023-01-15']);
});

test('isUpcoming compares against a fixed "today" for determinism', () => {
  assert.equal(isUpcoming({ date: '2026-11-10' }, '2026-09-22'), true);
  assert.equal(isUpcoming({ date: '2024-09-04' }, '2026-09-22'), false);
});

test('renderEventItem links the title when url is present', () => {
  const html = renderEventItem(events[1], '2026-09-22');
  assert.match(html, /<a href="https:\/\/example.org"/);
});

test('renderEventItem shows an upcoming badge for future dates', () => {
  const html = renderEventItem(events[1], '2026-09-22');
  assert.match(html, /badge upcoming/);
});
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/events.test.js`
Expected: 4 tests pass, 0 failures.

- [ ] **Step 4: Write `events.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Events — RCSL WG Histories</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div id="nav"></div>
  <main>
    <h1>Events</h1>
    <div id="events-list"></div>
  </main>
  <script type="module" src="assets/js/events.js"></script>
</body>
</html>
```

- [ ] **Step 5: Append event-list CSS to `assets/css/style.css`**

```css
.event-list { list-style: none; margin: 0; padding: 0; }
.event-item {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
}
.event-date { color: var(--color-muted); font-variant-numeric: tabular-nums; min-width: 6.5rem; }
.badge.upcoming {
  background: var(--color-accent);
  color: #fff;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}
```

- [ ] **Step 6: Manual verification**

Open `http://localhost:8000/events.html`.
Expected: 5 events listed newest-first (2026-11-12 "Next Working Group meeting, Berlin" on top, with an "Upcoming" badge), 2022-01-20 last; events with a `url` are links opening in a new tab.

- [ ] **Step 7: Commit**

```bash
git add assets/js/events.js tests/events.test.js events.html assets/css/style.css
git commit -m "Add Events page"
```

---

### Task 6: Projects graph — pure data helpers

**Files:**
- Create: `assets/js/projects-graph.js` (pure functions only — DOM/D3 rendering added in Task 7)
- Create: `tests/projects-graph.test.js`

**Interfaces:**
- Consumes: nothing (pure functions operating on plain data).
- Produces: `buildGraphData(projects, members): {nodes, links}`, `filterMatches(query, node): boolean`, `buildProjectListItems(projects, members): array`. Task 7 imports and extends this same file.

- [ ] **Step 1: Write `assets/js/projects-graph.js`**

```js
export function buildGraphData(projects, members) {
  const memberByEmail = new Map(members.map((m) => [m.email, m]));
  const nodes = [];
  const links = [];
  const seenScholars = new Set();

  projects.forEach((project) => {
    nodes.push({ id: `project:${project.id}`, type: 'project', data: project });
    (project.participants || []).forEach((email) => {
      const member = memberByEmail.get(email);
      if (!member) {
        console.warn(`Project "${project.id}" references unknown participant "${email}"`);
        return;
      }
      const scholarId = `scholar:${email}`;
      if (!seenScholars.has(scholarId)) {
        nodes.push({ id: scholarId, type: 'scholar', data: member });
        seenScholars.add(scholarId);
      }
      links.push({ source: `project:${project.id}`, target: scholarId });
    });
  });

  return { nodes, links };
}

export function filterMatches(query, node) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (node.type === 'project') {
    return node.data.title.toLowerCase().includes(q);
  }
  return `${node.data.firstname} ${node.data.lastname}`.toLowerCase().includes(q);
}

export function buildProjectListItems(projects, members) {
  const memberByEmail = new Map(members.map((m) => [m.email, m]));
  return projects.map((project) => ({
    ...project,
    participantNames: (project.participants || [])
      .map((email) => memberByEmail.get(email))
      .filter(Boolean)
      .map((m) => ({ name: `${m.firstname} ${m.lastname}`, email: m.email })),
  }));
}
```

- [ ] **Step 2: Write `tests/projects-graph.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphData, filterMatches, buildProjectListItems } from '../assets/js/projects-graph.js';

const members = [
  { firstname: 'Ada', lastname: 'Adler', email: 'ada@example.org' },
  { firstname: 'Bo', lastname: 'Bergman', email: 'bo@example.org' },
];
const projects = [
  { id: 'p1', title: 'Project One', participants: ['ada@example.org', 'bo@example.org'] },
  { id: 'p2', title: 'Project Two', participants: ['ada@example.org', 'ghost@example.org'] },
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
  const node = { type: 'project', data: { title: 'A History of the RCSL' } };
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
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/projects-graph.test.js`
Expected: 8 tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add assets/js/projects-graph.js tests/projects-graph.test.js
git commit -m "Add Projects graph data helpers"
```

---

### Task 7: Projects page — D3 rendering, modal, filter, list/graph toggle

**Files:**
- Modify: `assets/js/projects-graph.js` (append rendering/interaction code below the Task 6 pure functions)
- Create: `projects.html`
- Modify: `assets/css/style.css` (append graph/modal/list styles)

**Interfaces:**
- Consumes: `buildGraphData`, `filterMatches`, `buildProjectListItems` (Task 6, same file); `shared.js`'s `fetchJSON`, `getInitials`, `hashColor`, `initNav`. Also the global `d3` object from the CDN `<script>` tag loaded before this module in `projects.html`.
- Produces: fully working Projects page. Nothing later depends on this file's internals.

- [ ] **Step 1: Append imports and rendering/interaction code to `assets/js/projects-graph.js`**

Add this import at the very top of the file (above the existing `buildGraphData` function from Task 6):

```js
import { fetchJSON, getInitials, hashColor, initNav } from './shared.js';
```

Append this code at the end of the file, after `buildProjectListItems`:

```js
function renderListView(projects, members, container) {
  const items = buildProjectListItems(projects, members);
  container.innerHTML = items.length
    ? items
        .map(
          (p) => `<li>
            <h3>${p.title}</h3>
            ${p.subtitle ? `<p class="subtitle">${p.subtitle}</p>` : ''}
            ${p.description ? `<p>${p.description}</p>` : ''}
            <p class="participants">${p.participantNames
              .map((s) => `<a href="members.html#${encodeURIComponent(s.email)}">${s.name}</a>`)
              .join(', ')}</p>
            ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Visit project &#8599;</a>` : ''}
          </li>`
        )
        .join('')
    : '<li class="empty-state">No projects yet.</li>';
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

  modal.hidden = false;
}

function closeModal() {
  document.getElementById('project-modal').hidden = true;
}

function highlight(centerNode, links, nodeSel, linkSel) {
  const connected = new Set([centerNode.id]);
  links.forEach((l) => {
    if (l.source.id === centerNode.id) connected.add(l.target.id);
    if (l.target.id === centerNode.id) connected.add(l.source.id);
  });
  nodeSel.classed('node-dimmed', (d) => !connected.has(d.id));
  linkSel.classed('node-dimmed', (l) => !(connected.has(l.source.id) && connected.has(l.target.id)));
}

function applyFilter(query, nodes, nodeSel, linkSel) {
  if (!query.trim()) {
    nodeSel.classed('node-dimmed', false);
    linkSel.classed('node-dimmed', false);
    return;
  }
  const matching = new Set(nodes.filter((n) => filterMatches(query, n)).map((n) => n.id));
  nodeSel.classed('node-dimmed', (d) => !matching.has(d.id));
  linkSel.classed('node-dimmed', (l) => !(matching.has(l.source.id) && matching.has(l.target.id)));
}

function renderGraphView(nodes, links, svg) {
  const width = svg.clientWidth || 900;
  const height = 600;
  const d3svg = d3.select(svg).attr('viewBox', [0, 0, width, height]);
  d3svg.selectAll('*').remove();

  const zoomLayer = d3svg.append('g');
  d3svg.call(
    d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => zoomLayer.attr('transform', event.transform))
  );

  const simulation = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-250))
    .force('link', d3.forceLink(links).id((d) => d.id).distance(110))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(40));

  const link = zoomLayer.append('g').attr('stroke', '#ccc').selectAll('line').data(links).join('line');

  const node = zoomLayer
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', (d) => (d.type === 'project' ? 'project-box' : 'scholar-circle'))
    .call(
      d3
        .drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'project') {
      g.append('rect').attr('width', 140).attr('height', 48).attr('x', -70).attr('y', -24).attr('rx', 8);
      g.append('text').attr('text-anchor', 'middle').attr('y', -4).text(d.data.title);
      g.append('text').attr('text-anchor', 'middle').attr('y', 12).attr('font-size', 10).text(d.data.subtitle || '');
      g.style('cursor', 'pointer').on('click', () => openModal(d.data));
    } else {
      const initials = getInitials(d.data.firstname, d.data.lastname);
      const color = hashColor(d.data.email);
      g.append('circle').attr('r', 26).attr('fill', color);
      const initialsText = () =>
        g.append('text').attr('text-anchor', 'middle').attr('dy', 4).attr('fill', '#fff').text(initials);
      if (d.data.portrait_url) {
        g.append('image')
          .attr('href', d.data.portrait_url)
          .attr('x', -26)
          .attr('y', -26)
          .attr('width', 52)
          .attr('height', 52)
          .on('error', function () {
            d3.select(this).remove();
            initialsText();
          });
      } else {
        initialsText();
      }
      g.style('cursor', 'pointer').on('click', () => highlight(d, links, node, link));
    }
  });

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  return { node, link };
}

function setView(mode) {
  document.getElementById('graph-view').hidden = mode !== 'graph';
  document.getElementById('list-view').hidden = mode !== 'list';
  document.getElementById('view-toggle').textContent =
    mode === 'graph' ? 'Switch to list view' : 'Switch to graph view';
}

if (typeof document !== 'undefined' && document.getElementById('graph-svg')) {
  initNav('projects');

  Promise.all([fetchJSON('data/projects.json'), fetchJSON('data/members.json')])
    .then(([projects, members]) => {
      renderListView(projects, members, document.getElementById('project-list'));

      const { nodes, links } = buildGraphData(projects, members);
      const { node, link } = renderGraphView(nodes, links, document.getElementById('graph-svg'));

      document.getElementById('project-filter').addEventListener('input', (e) => {
        applyFilter(e.target.value, nodes, node, link);
      });

      document.getElementById('modal-close').addEventListener('click', closeModal);
      document.getElementById('project-modal').addEventListener('click', (e) => {
        if (e.target.id === 'project-modal') closeModal();
      });

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

- [ ] **Step 2: Re-run Task 6's tests to confirm the appended code didn't break the pure functions**

Run: `node --test tests/projects-graph.test.js`
Expected: still 8 tests pass, 0 failures (the appended code only adds new functions and a guarded bootstrap; it must not change `buildGraphData`, `filterMatches`, or `buildProjectListItems`).

- [ ] **Step 3: Write `projects.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projects — RCSL WG Histories</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div id="nav"></div>
  <main>
    <h1>Projects</h1>
    <div class="graph-controls">
      <input type="search" id="project-filter" placeholder="Filter by scholar or project title" aria-label="Filter projects and scholars">
      <button id="view-toggle" type="button">Switch to list view</button>
    </div>
    <div id="graph-view">
      <svg id="graph-svg"></svg>
    </div>
    <div id="list-view" hidden>
      <ul id="project-list"></ul>
    </div>
    <div id="project-modal" class="modal" hidden>
      <div class="modal-content">
        <button id="modal-close" type="button" aria-label="Close">&times;</button>
        <img id="modal-image" alt="">
        <h2 id="modal-title"></h2>
        <p id="modal-subtitle"></p>
        <p id="modal-description"></p>
        <a id="modal-link" target="_blank" rel="noopener">Visit project &#8599;</a>
      </div>
    </div>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script type="module" src="assets/js/projects-graph.js"></script>
</body>
</html>
```

- [ ] **Step 4: Append graph/modal/list CSS to `assets/css/style.css`**

```css
.graph-controls { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
#project-filter { flex: 1; min-width: 200px; padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; }
#view-toggle { padding: 0.5rem 1rem; border: 1px solid var(--color-accent); color: var(--color-accent); background: #fff; border-radius: 6px; cursor: pointer; }

#graph-view { border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
#graph-svg { width: 100%; height: 600px; display: block; }

.node-dimmed { opacity: 0.15; }

.project-box rect { fill: var(--color-accent); }
.project-box text { fill: #fff; font-size: 12px; pointer-events: none; }
.scholar-circle circle { stroke: #fff; stroke-width: 2px; }
.scholar-circle image { clip-path: circle(50%); }

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal[hidden] { display: none; }
.modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 1.5rem;
  max-width: 480px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
}
.modal-content img { width: 100%; border-radius: 6px; margin-bottom: 1rem; }
#modal-close {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
}

#project-list { list-style: none; margin: 0; padding: 0; }
#project-list li { padding: 1rem 0; border-bottom: 1px solid #eee; }
#project-list .participants a { margin-right: 0.5rem; }
```

- [ ] **Step 5: Manual verification**

Open `http://localhost:8000/projects.html` (window wider than 700px).
Expected:
- Graph view shown by default: 3 blue project boxes connected to circular scholar nodes (portraits or initials).
- Dragging a node moves it; scrolling/pinching zooms; dragging empty canvas pans.
- Typing "history" in the filter dims all nodes except "A History of the RCSL" and its 3 participants.
- Clicking a project box opens the modal with image (when present), title, subtitle, description, and a working "Visit project ↗" link that opens in a new tab (or no link for `oral-history-archive`, which has none).
- Clicking a scholar circle dims everything except that scholar and their connected projects.
- Clicking "Switch to list view" swaps to the plain list with participant names and project links; clicking again swaps back.
- Resizing the browser below ~700px and reloading the page shows list view by default.

- [ ] **Step 6: Commit**

```bash
git add assets/js/projects-graph.js projects.html assets/css/style.css
git commit -m "Add Projects page graph rendering and interactions"
```

---

### Task 8: CI, README, final smoke check

**Files:**
- Create: `.gitlab-ci.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: all files from Tasks 1–7.
- Produces: nothing further depends on this task; it is the final integration point.

- [ ] **Step 1: Write `.gitlab-ci.yml`**

```yaml
stages:
  - validate
  - pages

validate:
  stage: validate
  image: node:20-alpine
  script:
    - npm run validate
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'

pages:
  stage: pages
  image: alpine:latest
  script:
    - mkdir -p public
    - cp -r index.html members.html projects.html events.html assets data public/
  artifacts:
    paths:
      - public
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

- [ ] **Step 2: Write `README.md`**

```markdown
# RCSL WG Histories of the Sociology of Law

Static, no-backend website for the RCSL Working Group "Histories of the
Sociology of Law." See `docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`
for the full design.

**Current state: proof of concept.** `data/members.json`, `data/projects.json`,
and `data/events.json` contain fake/placeholder data, not the working
group's real roster, projects, or meeting history. Replace them with real
data (same shape, see `data/schema/`) before launch. The landing page copy
in `index.html` is also placeholder text pending the real content.

## Local preview

No build step. From the repo root:

    python -m http.server 8000

Then open `http://localhost:8000/index.html`.

## Running checks

    npm run validate   # JSON Schema validation of the three data files
    npm test            # unit tests for pure logic (node --test)

Both require Node.js locally (only for tooling — the deployed site itself
needs no Node, no backend, no secrets).

## Editing data

Add or edit a member, project, or event by hand-editing the matching JSON
file in `data/` and opening a merge request. Each file must validate
against its schema in `data/schema/` (`npm run validate` checks this
locally; CI enforces it on every push).

- `members.json`: `email` is the unique id, referenced by
  `projects[].participants`.
- `projects.json`: `participants` is a list of member emails.
- `events.json`: sorted newest-first automatically at render time — no
  need to keep the file itself in date order.

## Manual smoke checklist (after any change)

- [ ] Landing page: all sections render, nav links work.
- [ ] Members page: cards sorted by lastname; portraits or initials-avatar
      fallback render correctly.
- [ ] Projects page, graph view: nodes render, drag/pan/zoom work, filter
      dims non-matches, clicking a project opens the modal, clicking a
      scholar highlights their subgraph.
- [ ] Projects page, list view: toggle works both ways; narrow window
      (<700px) defaults to list view.
- [ ] Events page: sorted newest-first, "Upcoming" badge on future dates.
- [ ] `npm run validate` and `npm test` both pass.

## Local tooling credentials

Copy `.env.example` to `.env` and fill in `GITLAB_TOKEN` for local GitLab
API tooling. Never commit `.env` or paste the token into chat/logs.
```

- [ ] **Step 3: Full manual smoke check**

With `python -m http.server 8000` running, work through every item in the README's "Manual smoke checklist" above against the local server. Fix anything that fails before proceeding.

- [ ] **Step 4: Full automated check**

Run: `npm run validate && npm test`
Expected: all three schema validations pass, and all unit tests (6 + 4 + 4 + 8 = 22) pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add .gitlab-ci.yml README.md
git commit -m "Add CI pipeline and README"
```

---

## Not covered by this plan

- Creating the actual project on gitlab.gwdg.de, pushing this repo to it, and configuring Pages access control to public — these need the user's real GitLab token in their local `.env` and should be done by the user (or with the user directly supervising, since it touches a real remote).
- Replacing the fake `data/*.json` content and the placeholder landing-page copy with real data — explicitly deferred per the user's request to build the proof of concept first.
