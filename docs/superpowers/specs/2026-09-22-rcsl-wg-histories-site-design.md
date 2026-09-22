# RCSL Working Group "Histories of the Sociology of Law" — Website Design

**Date:** 2026-09-22
**Status:** Approved, pending implementation

## Overview

A static, no-backend website for the RCSL Working Group "Histories of the
Sociology of Law," hosted on GitLab Pages under the private GitLab group
`rcsl-wg-histories` (gitlab.gwdg.de). The site has six pages — a landing
page, a Members page, a Projects page, an Events page, a News page, and a
generic Pages content viewer — and is rendered client-side from four
hand-maintained JSON data files plus a directory of freeform content
documents. There is no server, no database, and no build step.

## Goals

- Give the working group a public-facing home, replacing the provisional
  HedgeDoc pad currently serving that purpose.
- Show the group's members and their affiliations.
- Show the group's projects as an explorable network connecting projects to
  the scholars working on them.
- Show the group's meeting history and keep the next upcoming meeting easy
  to find.
- Let the group post short announcements (news), each optionally pointing at
  a longer freeform write-up, without needing a code change per post.
- Stay maintainable by non-developers: adding a member, project, event, or
  news item is editing a JSON file, no code changes required; adding a
  longer write-up is adding one Markdown or HTML file.

## Non-goals

- No user accounts, comments, or any dynamic/interactive feature that needs
  a backend.
- No admin UI for editing data — edits happen via GitLab merge requests.
- No search/filter on the Members page (group is small; revisit only if the
  roster grows large).
- No custom domain for the initial launch (default GitLab Pages URL).

## Architecture

Plain HTML/CSS/vanilla JS. No framework, no bundler, no build step. Two
external dependencies, both loaded via CDN `<script>` tag and each scoped to
a single page: [D3](https://d3js.org/) (`d3-force`, `d3-selection`,
`d3-drag`, `d3-zoom`) for the Projects page's graph view, and
[marked](https://marked.js.org/) for rendering Markdown on the Pages content
viewer.

Each page fetches the JSON data client-side (`fetch('data/*.json')`) on load
and renders the DOM directly from it. There is no templating or
server-side rendering step of any kind.

### Repo layout

```
/
├── index.html                 # landing page
├── members.html
├── projects.html
├── events.html
├── news.html
├── pages.html                 # generic content viewer, see "Pages" below
├── data/
│   ├── members.json
│   ├── projects.json
│   ├── events.json
│   ├── news.json
│   └── schema/
│       ├── members.schema.json
│       ├── projects.schema.json
│       ├── events.schema.json
│       └── news.schema.json
├── pages/                     # freeform content documents (.md or .html),
│                               # rendered by pages.html — see "Pages" below
│   └── about.md                 # example/placeholder content document
├── assets/
│   ├── css/style.css
│   ├── js/
│   │   ├── members.js         # renders members.html
│   │   ├── projects-graph.js  # d3-force graph, list-view toggle, filter, modal
│   │   ├── events.js          # renders events.html
│   │   ├── news.js            # renders news.html and the landing page's news teaser
│   │   ├── pages.js            # renders pages.html
│   │   └── shared.js          # nav, initials-avatar fallback, etc.
│   └── img/                   # local static assets only (logo, favicon) —
│                               # member/project images are hotlinked, not stored here
├── .gitlab-ci.yml
├── .gitignore
├── .env.example
└── README.md                  # how to add a member/project, local preview instructions
```

## Data model

### `data/members.json`

```json
[
  {
    "lastname": "Boulanger",
    "firstname": "Christian",
    "affiliation": "Max Planck Institute for the History and Theory of Law",
    "url": "https://www.lhlt.mpg.de/...",
    "email": "boulanger@lhlt.mpg.de",
    "portrait_url": "https://www.lhlt.mpg.de/.../boulanger.jpg"
  }
]
```

- `email` is the unique id, referenced by `projects[].participants`.
- `lastname`, `firstname`, `affiliation`, `email` are required.
- `url` and `portrait_url` are optional.
- `portrait_url` is expected to point at an image hosted on the scholar's
  current institutional page (hotlinked, not mirrored).

### `data/projects.json`

```json
[
  {
    "id": "history-of-rcsl",
    "title": "A History of the RCSL",
    "subtitle": "Tracing the network's origins from 1962 to today",
    "description": "Longer free-text description, shown only in the modal.",
    "url": "https://...",
    "image_url": "https://...",
    "participants": ["boulanger@lhlt.mpg.de"]
  }
]
```

- `id`, `title`, `participants` are required. `id` is the unique id, used as
  the DOM id / graph node key.
- `subtitle`, `description`, `url`, `image_url` are optional; the UI degrades
  gracefully when they're absent (no image block, no "Visit project" link,
  etc.).
- `participants` is an array of member emails, resolved client-side against
  `members.json`.

### `data/events.json`

```json
[
  {
    "date": "2026-09-04",
    "title": "WG roundtable, Bangor, Wales",
    "url": "https://..."
  }
]
```

- `date`, `title` are required. `date` is an ISO `YYYY-MM-DD` string.
- `url` is optional; when present the event title links to it.
- The array is rendered **sorted by date descending** (newest first), so the
  most recent or next-upcoming meeting is always at the top — no separate
  "next meeting" field is needed. Whether an entry is past or upcoming is
  determined at render time by comparing `date` to today.

### `data/news.json`

```json
[
  {
    "date": "2026-09-04",
    "title": "Working Group approved at RCSL Board meeting",
    "url": "https://..."
  },
  {
    "date": "2026-08-01",
    "title": "New page: how the Working Group started",
    "url": "pages.html?doc=about.md"
  }
]
```

- `date`, `title`, `url` are all required. Same shape and sort order as
  `events.json` (sorted by date descending, newest first).
- `url` may point to external content (an absolute `http(s)://` URL, opened
  in a new tab like other external links) or to internal content via the
  Pages viewer (a relative link such as `pages.html?doc=about.md`, opened in
  the same tab). The renderer decides which by checking whether `url` starts
  with `http`; no separate type field is needed.

### CI data validation

`.gitlab-ci.yml`'s `validate` stage runs a JSON Schema check (e.g.
`npx ajv-cli validate`, no persisted Node dependency in the repo) against
all four data files on every push. A schema failure fails the pipeline and
blocks the Pages deploy. This is the safety net for the manual-edit-via-merge-request
data workflow — there is no other data entry path. (Documents under `pages/`
are not JSON and are not schema-validated; see "Pages" below for how their
trust model works instead.)

## Pages

### Landing page (`index.html`)

Static content adapted directly from the group's current HedgeDoc pad — no
new content invented. Sections, in order:

1. Header/nav (site title left; Home / Members / Projects / Events / News
   right; active page underlined in the accent color). `pages.html` is
   reached only via links from News (or other content), not from the main
   nav, since it's a generic viewer rather than a fixed section.
2. Hero: "RCSL Working Group 'Histories of the Sociology of Law'" + status
   line (approved at the RCSL Board meeting, Bangor, Wales, 4 September
   2024).
3. "About the Working Group" — links to the board-meeting presentation and
   the roundtable minutes.
4. "Contact" — chair's name, affiliation, email (`mailto:`).
5. "Membership & mailing list" — subscribe-by-blank-email and
   subscribe-via-listinfo-page instructions, the note that unsubscribing
   is treated as leaving the WG, and the note that RCSL membership is
   required for *formal* WG membership.
6. "Meetings" — a short pointer to the Events page for the full history and
   the next planned meeting (e.g. "See the Events page for past meetings and
   the next gathering."), rather than listing dates on the landing page
   itself. The events data lives only in `events.json`, so this stays
   accurate without editing `index.html`.
7. "News" — the 3 most recent entries from `news.json` (date + linked
   title, same link-resolution rule as the News page), plus a "See all news
   →" link to the News page. Rendered client-side from `news.json`, same
   pattern as the Meetings pointer above — no news content is hardcoded
   into `index.html`.
8. Footer — links to Members, Projects, Events, and News pages.

### Members page (`members.html`)

A card grid, sorted by lastname. Each card: portrait (or initials-avatar
fallback) centered on top, full name below (linking to `url` if present),
affiliation, email as a `mailto:` link. Grid layout collapses to fewer
columns / single column on narrow viewports.

### Projects page (`projects.html`)

Defaults to the network graph view, with a toggle to a plain accessible list
view. See "Projects graph" below for the graph's behavior, and "Accessible
list view" for its alternative.

### Events page (`events.html`)

A simple reverse-chronological list rendered from `events.json`, newest
first — so the next planned meeting (or, once it's passed, the most recent
one) is always the top entry. Each entry: date, title (linking to `url` if
present). No graphics, no pagination; a plain, fast-scanning list is
sufficient for a working group's meeting cadence. This is the single source
of truth for meeting history — the landing page only links here rather than
duplicating the list.

## Projects graph

Visual language (fixed by original requirements): each **project** is a
rounded rectangle labeled with its title (bold) and subtitle (smaller);
each **scholar** is a circle containing their portrait image (clipped) or,
if no portrait is available, an initials avatar.

**Layout: force-directed.** `d3-force` (`forceManyBody`, `forceLink` for
project↔participant edges, `forceCenter`, `forceCollide` to prevent overlap)
computes node positions. Nodes are draggable (`d3-drag`). This was chosen
over three alternatives considered (bipartite two-column, radial clusters
per project, adjacency matrix) for its organic, exploratory feel; the
trade-off (layout can get visually tangled with many nodes) is mitigated by
pan/zoom and filtering, below.

**Pan & zoom:** `d3-zoom` on the SVG viewport (scroll/pinch to zoom, drag
empty canvas to pan) — the graph canvas can be larger than the viewport.

**Filter:** a text input above the graph filters by scholar name or project
title. Matching nodes/edges stay fully visible; non-matches dim to low
opacity.

**Click a project box:** opens a detail modal with the project's image (if
`image_url` present), title, subtitle, description, and a "Visit project ↗"
link (`target="_blank" rel="noopener"`) if `url` present.

**Click a scholar circle:** highlights that scholar's subgraph (dims
everything else — the same highlight mechanism used by the filter). A
tooltip/popover on the circle also offers a "View profile →" link to that
person's card on the Members page.

**List view toggle:** a button switches between the graph and the
accessible list view below. Always opens to graph view by default; the
choice is not persisted across visits.

### Accessible list view

A plain HTML alternative to the graph, for accessibility and narrow
screens: each project as a heading + subtitle + description + participant
names (as text, linking to their Members-page card) + "Visit project" link
if present. No modal, no canvas — fully keyboard- and screen-reader
navigable.

On viewports narrower than ~700px, the Projects page defaults to this list
view; the graph remains reachable via the toggle but isn't the first
experience on a phone.

### News page (`news.html`)

Same rendering pattern as the Events page: a reverse-chronological list from
`news.json`, newest first. Each entry: date, title linking to `url`. Link
resolution: if `url` starts with `http`, it's an external link (opens in a
new tab, `target="_blank" rel="noopener"`); otherwise it's a relative link
into the Pages viewer (e.g. `pages.html?doc=about.md`), opened in the same
tab. This is the single source of truth for news history — the landing page
only teases the latest 3 entries.

### Pages content viewer (`pages.html`)

A generic renderer for freeform content documents stored in `pages/`, for
cases where a full JSON-driven page is overkill (e.g. a one-off "About the
founding" writeup linked from a news item). Same shared nav as every other
page. Reads a `doc` query parameter (`pages.html?doc=<filename>`) and
fetches `pages/<filename>`:

- If the filename ends in `.html`, the fetched content is injected directly
  into the content area (`innerHTML`) — the document is a complete HTML
  fragment, not escaped.
- If the filename ends in `.md`, the fetched text is parsed with
  [marked](https://marked.js.org/) (loaded via CDN `<script>` tag) and the
  resulting HTML is injected the same way.
- Any other extension, or a missing/unreadable file, shows an error state
  ("Couldn't load this page.") rather than a blank screen.

**Trust model:** documents in `pages/` are maintainer-authored static files
edited via the same GitLab merge-request workflow as `data/*.json` — not
user input, not dynamic. Injecting their (HTML or Markdown-rendered-to-HTML)
content unescaped is therefore consistent with the trust boundary already
established for `index.html`'s own hardcoded markup, and is a deliberate
exception to the escaping rule in "Error handling & edge cases" below, which
applies to *data-file field values* (names, titles, descriptions), not to
whole documents meant to contain rich HTML.

**`doc` parameter safety:** the `doc` value is validated against a filename
allowlist pattern (letters, digits, hyphens, underscores, a single dot
before the extension, no `/`) before being used in the fetch path — not
because a static site's client-side `fetch` can escape the site's own
origin, but to fail predictably on a malformed or mistyped link rather than
attempting to fetch an unintended path within the site (e.g. a JSON data
file).

## Visual design system

- **Typography:** system sans-serif stack
  (`-apple-system, "Helvetica Neue", Arial, sans-serif`) — no webfont
  loading.
- **Colors:** white/near-white background (`#ffffff` / `#fafafa` for
  section alternation), near-black text (`#1a1a1a`), muted gray secondary
  text (`#666`–`#888`), deep blue accent `#2c5282` for links, active nav,
  project-box fill, and graph highlight state.
- **Initials avatars:** fill color deterministically hashed from the
  member's email against a small fixed palette, so a given person always
  gets the same color, and avatar colors stay visually distinct from the
  blue project boxes.
- **Layout:** shared top nav across all pages; max-width content container
  (~1100–1200px), centered; generous padding.
- **Responsive:** grid and graph layouts collapse to single-column /
  fit-to-width below ~700px, per-page specifics noted above.

## Error handling & edge cases

- **Missing or broken portrait image:** `<img onerror="...">` swaps to the
  initials avatar — same code path whether `portrait_url` was absent or the
  URL failed to load (404, hotlink protection, etc.).
- **`participants` email with no matching member record:** logged to the
  console as a data-consistency warning; that node is simply not rendered.
  Does not crash the graph.
- **Empty `members.json` / `projects.json` / `events.json` / `news.json`:**
  page renders its normal chrome (nav, headings) with an empty-state message
  instead of a blank or broken layout.
- **Malformed JSON / fetch failure:** caught; shows a simple "couldn't load
  data" message on that page rather than a blank screen.
- **`pages.html` with a missing/unreadable `doc`, or no `doc` param at
  all:** shows an error/empty state rather than a blank screen (see "Pages
  content viewer" above).
- **Data-file field values (names, titles, descriptions, etc.) are
  HTML-escaped** before being interpolated into rendered markup, since they
  are free text that may contain `&`/`<`/`>` and the site is public. This
  does *not* apply to whole documents under `pages/`, which are intentionally
  rendered as rich HTML — see "Pages content viewer" above for that
  boundary.
- CI schema validation (above) catches structurally invalid data before it
  reaches production; the handling above is defense-in-depth for edge cases
  the schema can't catch (e.g. a dangling participant reference).

## Deployment & CI

`.gitlab-ci.yml`, two stages:

1. **`validate`** — JSON Schema check against all four data files (see "CI
   data validation" above) plus the existing unit test suite. Failing data
   or a failing test blocks deploy.
2. **`pages`** — no build step; copies the site files (`index.html`,
   `members.html`, `projects.html`, `events.html`, `news.html`,
   `pages.html`, `assets/`, `data/`, `pages/`) into the `public/` artifact
   directory GitLab Pages expects, excluding `.gitlab-ci.yml`, `README.md`,
   `tests/`, `package.json`, and other dev-only files. Runs only on the
   default branch.

**Access control:** GitLab Pages access control is set to **public**, so
the deployed site is visible to anyone, even though the `rcsl-wg-histories`
group and its repositories remain private on GitLab.

**URL:** default GitLab Pages URL for launch (exact form depends on
gwdg.de's Pages domain pattern, e.g. `https://rcsl-wg-histories.pages.gwdg.de`).
A custom domain can be added later without changing the site itself.

## Local tooling credentials

The deployed site has no backend and needs no secrets at runtime. A GitLab
personal access token is used only for **local tooling** — creating the
project on gitlab.gwdg.de, pushing, and configuring repo/Pages settings via
the GitLab API from a local machine.

- `.gitignore` excludes `.env`, OS cruft (`.DS_Store`, `Thumbs.db`), and
  `.superpowers/` (brainstorming-session mockup files, not a project
  deliverable).
- `.env.example` (committed) documents the expected variables:
  ```
  GITLAB_TOKEN=
  GITLAB_HOST=gitlab.gwdg.de
  ```
- `.env` itself (gitignored, never committed) is created locally by the
  user, who fills in the real token value directly in their editor — not
  pasted into chat/logs.

## Data update workflow

Adding or editing a member, project, event, or news item means hand-editing
`members.json`, `projects.json`, `events.json`, or `news.json` and opening a
merge request (or pushing directly, per the maintainer's normal git
workflow). Adding a content page means adding a `.md` or `.html` file under
`pages/` and, typically, a `news.json` entry linking to it. CI schema
validation (above) is the only automated check; there is no admin UI and
none is planned.

## Testing approach

Given the small, low-change-frequency static site with no backend, a formal
test suite is not warranted. Verification consists of:

- **CI JSON Schema validation** — automated, blocking, checks structural
  correctness of the data on every push.
- **Manual smoke check** after any change: serve the site locally (e.g.
  `python -m http.server`) or open the deployed Pages URL, and check that
  the landing page, Members page, Projects page (both graph and list view),
  Events page, News page, and Pages viewer (both a `.md` and an `.html`
  document) render correctly. Documented as a short checklist in the
  README.

## Alternatives considered (Projects graph layout)

Four layout concepts were mocked up and compared before choosing
force-directed:

| Option | Description | Trade-off |
|---|---|---|
| **A. Force-directed (chosen)** | Physics simulation; nodes drift into an organic scatter, draggable | Non-deterministic layout, can tangle with many nodes — mitigated by pan/zoom + filter |
| B. Bipartite columns | Projects in a left column, scholars in a right column, curved edges | Very legible and scalable, but reads more like a diagram than a "network" |
| C. Radial clusters | Each project a hub with its scholars orbiting it, clusters tiled in a grid | Reads well per-project; cross-cluster links for shared members can crisscross |
| D. Adjacency matrix | Members × projects grid with a dot marking participation | Scales best (50+ nodes), sortable/filterable, but isn't visually a "network" |
