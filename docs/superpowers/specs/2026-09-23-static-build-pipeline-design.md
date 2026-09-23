# Static Build Pipeline & Generic Content Template — Design

**Date:** 2026-09-23
**Status:** Approved, pending implementation
**Supersedes:** the "no build step" architecture decision, the `data/`/`pages/`
repo layout, and the `pages.html?doc=` content viewer described in
`docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`. That
spec's data model (field names/shapes for members/projects/events/news),
visual design system, and per-page content rules (nav, hero, teasers,
Projects graph behavior, list view, back-link footer) still apply and are
not repeated in full here except where this document changes them.

## Motivation

The site so far is rendered entirely client-side: each page does
`fetch('data/*.json')` on load and builds the DOM from the response. Two
problems with that, discovered while working on it:

1. **Not crawlable.** Content that only exists after a client-side `fetch`
   and re-render is invisible or unreliable for search engines and other
   crawlers that don't execute JavaScript (or execute it unreliably).
2. **Over-exposure.** Fields that are deliberately never *rendered* (e.g.
   member email addresses, removed from display in an earlier change) were
   still being *shipped* to any visitor, in full, as the raw JSON payload
   the browser fetched to render the page. Not rendering a field is not the
   same as not exposing it.
3. **Fragile accessibility.** Screen readers, assistive tech, and users with
   JavaScript disabled or failing (a flaky connection, a corporate policy, a
   browser extension) saw a blank page until — and unless — the client-side
   fetch-and-render succeeded. Content that only exists after JS runs is an
   accessibility hazard, not just a crawler one; both come from the same
   root cause.

Both are solved the same way: stop shipping raw content JSON to the browser
at all. A build step turns the JSON + document content into plain, fully
rendered, crawlable static HTML. The browser only ever receives what's
actually meant to be visible — and it's there immediately, with or without
JavaScript. See "Accessibility" below for what this enables beyond crawling.

This also folds in the previously-planned but not-yet-executed work: moving
`data/schema` out to a top-level `schema/`, and making the shipped default
content fully generic/fictitious so this repo works as a clean, distributable
template.

## Non-goals

- **No live/dynamic content refresh in the browser.** Considered and
  explicitly rejected: a remote content source would either need to be
  fetchable without authentication (acceptable exposure risk only if the
  source contains nothing sensitive — not guaranteed) or would need
  credentials, which can't safely live in browser JS. Content freshness is
  achieved by re-running the build, not by client-side polling.
- **No server, no backend, no database at runtime.** The deployed output is
  still static files on GitLab Pages. Node is a build-time tool only, exactly
  like it's already a validate/test-time-only tool today.
- **No admin UI.** Editing content is still editing files (JSON, Markdown,
  HTML) and re-running the build (locally, or via CI on push).
- **No change to the visual design system, data field shapes, or per-page
  content rules** documented in the prior spec, beyond what's described
  below.
- **No full WCAG audit or certification.** The accessibility work below is a
  set of targeted, concrete improvements that this refactor makes cheap or
  necessary anyway (see "Accessibility"), not a comprehensive audit against
  a conformance level.

## Directory layout

```
/
├── content/                   # everything swappable — the build's input.
│   │                           # Default checked-in copy is generic/fictitious
│   │                           # template data. Overridable via CONTENT_PATH.
│   ├── data/
│   │   ├── site.json
│   │   ├── members.json
│   │   ├── projects.json
│   │   ├── events.json
│   │   └── news.json
│   ├── pages/                 # freeform long-form documents (.md/.html)
│   │   └── about.md
│   └── images/
│       ├── favicon.ico
│       └── logo.png
├── schema/                    # JSON Schemas for content/data/*.json —
│   ├── site.schema.json       # code, not content. Never CONTENT_PATH-driven.
│   ├── members.schema.json
│   ├── projects.schema.json
│   ├── events.schema.json
│   └── news.schema.json
├── assets/
│   ├── css/style.css
│   └── js/                    # pure render-to-string functions (reused by
│   │                           # the build) + the small remaining client
│   │                           # runtime (Projects graph, portrait fallback,
│   │                           # filter-box DOM filtering) — see "Client-side
│   │                           # runtime" below
├── scripts/
│   ├── build.mjs              # npm run build
│   ├── validate.mjs           # npm run validate
│   └── lib/
│       └── resolve-content.mjs # shared: locate/materialize content, local
│                                # or remote, used by both of the above
├── public/                    # gitignored. Build OUTPUT — what GitLab Pages
│                               # publishes. Never edited by hand.
├── .local/                    # gitignored. Real (non-generic) content lives
│   └── content/               # here, in the exact shape of content/, for
│                               # local building via CONTENT_PATH=.local/content
├── .gitlab-ci.yml
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── tests/
```

`data/` no longer exists as a top-level directory. Everything that was under
it is either in `content/` (swappable) or `schema/` (code).

## Content model changes

`content/data/site.json` gains two new optional fields:

```json
{
  "bannerLabel": "CLFN",
  "title": "Comparative Legal Futures Network",
  "subtitle": "An international research collaboration studying how legal systems anticipate and respond to social change.",
  "favicon": "favicon.ico",
  "logo": "logo.png"
}
```

- `favicon`, if present, names a file in `content/images/`, copied to
  `public/images/` and referenced by a `<link rel="icon">` in every page's
  `<head>`. If absent, no favicon link is emitted (browser default).
- `logo`, if present, names a file in `content/images/`, copied the same way,
  and rendered on the landing page's hero, floating to the left of the `title`
  (`<h1>`) + `subtitle` (`<p>`) block — a flex row that wraps to stack the
  logo above the text on narrow viewports (same ~700px breakpoint used
  elsewhere on the site). If absent, the hero renders exactly as it does
  today, text-only. The logo does **not** appear in the nav bar — the nav's
  `bannerLabel` stays text-only, unchanged.

`schema/site.schema.json` is updated to make `favicon`/`logo` optional string
properties.

No other content field shapes change — members/projects/events/news keep the
exact structure from the prior spec.

## Build pipeline

### Content resolution (`scripts/lib/resolve-content.mjs`)

Shared by both `build` and `validate`. Given `process.env.CONTENT_PATH`
(default: `./content`):

- **Local path:** used directly — `content/data/*.json` (or
  `<CONTENT_PATH>/data/*.json`, etc.) is read from disk.
- **Remote URL (`http://`/`https://`, e.g. a WebDAV share):** each expected
  file under `data/`, `pages/`, and `images/` is fetched (Basic Auth applied
  if `CONTENT_USERNAME`/`CONTENT_PASSWORD` are set) and materialized into a
  local temp directory, which is what the rest of the pipeline reads from.
  This is a build-time-only operation — the resolved-from URL never appears
  in anything shipped to the browser.

This is the **only** thing `CONTENT_PATH` affects. It has no runtime meaning
in the browser at all.

### `npm run build` (`scripts/build.mjs`)

1. Resolve content (above).
2. For each of the five main pages (home, members, projects, events, news)
   and each document in `content/pages/`, render full static HTML into
   `public/`, reusing the existing pure render-to-string functions in
   `assets/js/*.js` (see "Client-side runtime" below for what changes about
   them). Nav (including `bannerLabel`) and the favicon link are baked in per
   page at build time — no client-side nav rendering remains.
3. **Pages routing:** `content/pages/about.md` → `public/pages/about.html`,
   `content/pages/example.html` → `public/pages/example.html`, etc. — a real,
   crawlable, bookmarkable URL per document. The `pages.html?doc=` viewer is
   removed entirely. Any `news.json`/`events.json` `url` field that pointed
   at `pages.html?doc=X` is rewritten at build time to the new `/pages/X.html`
   URL. The landing page's About box is built the same way, from
   `content/pages/about.md`, directly into `public/index.html`'s hero-adjacent
   section — same source file, same as today.
4. Markdown rendering (`marked`) moves from a CDN `<script>` tag executed in
   the browser to a `marked` devDependency used only inside `build.mjs`. No
   Markdown parser ships to the browser anymore.
5. Copy `assets/css`, `content/images`, and the small remaining client JS
   bundle (below) into `public/`.
6. Emit one small **derived, sanitized** JSON for the Projects graph's
   client-side D3 rendering — the one feature that's genuinely interactive
   and can't be meaningfully pre-rendered. It contains only what the graph
   needs to draw (member first/last name, affiliation, portrait URL; project
   id/title/subtitle/url/participants) — never email addresses or any other
   field not already safe to display. This file, not the source
   `members.json`/`projects.json`, is the only content JSON that ever reaches
   the browser, and it's regenerated by the build, not copied verbatim.

### `npm run validate` (`scripts/validate.mjs`)

Resolves content the same way, then runs the existing `ajv-cli` schema checks
against the resolved copy (so real data, if `CONTENT_PATH` points at it,
gets validated too — not just the committed generic default).

### Local dev workflow

`npm run build` then serve `public/` with any static file server (e.g.
`python -m http.server` from inside `public/`). `npm run build:watch`
(`node --watch scripts/build.mjs`) rebuilds on every source or content
change for a fast edit loop; it's still a separate step from serving, kept
as two simple pieces rather than one combined dev-server dependency. What's
previewed locally is byte-for-byte what ships — there is no separate
dev-only rendering path.

To work against real (non-generic) data locally: set `CONTENT_PATH=.local/content`
in `.env`.

## Client-side runtime (what's left)

Most of today's `assets/js/*.js` "on page load, fetch JSON, render into a
container" top-level blocks go away — that work happens at build time now.
What remains, shipped to the browser:

- **Portrait fallback** (`wirePortraitFallback`) — reacts to a broken
  `<img>` load at runtime, swaps in the initials avatar. Stays as-is; needs
  to run client-side by nature.
- **Projects graph** — D3 force layout, pan/zoom, filter, modal, scholar
  highlight — genuinely interactive, stays client-side, now fetching the
  small sanitized derived JSON (above) instead of the raw source files. The
  static list view (pre-rendered, crawlable) is the page's primary content;
  the graph is a progressive enhancement on top, exactly like today's
  graph/list toggle.
- **Members/Projects filter boxes** — reimplemented as plain DOM filtering:
  on input, walk the already-rendered cards/list items (each carries its
  searchable text in a `data-search` attribute set at build time) and
  toggle visibility. No JSON fetch involved. Same predicate logic
  (`memberMatches`/`filterMatches`) is still unit-tested, just tested
  against the DOM-filtering function's inputs instead of a fetch-and-re-render
  flow.
- **Grid/list view toggles** (Members, Projects) — unchanged: both views are
  pre-rendered into the static HTML; the toggle just shows/hides.

Everything else (nav rendering, `renderPageDoc`, `initNav`, the
`data/*.json` `fetch()` calls, `loadSiteConfig`) is deleted from the browser
bundle — that logic now runs once, at build time, in Node.

## Accessibility

Serving fully-rendered HTML rather than a JS-populated shell is, on its own,
the single biggest accessibility improvement available to this site — every
page's actual content is present for screen readers, works with JavaScript
disabled or blocked, and isn't gated on a network round-trip succeeding
after first paint. This refactor makes that the baseline for free. On top of
that baseline, a few concrete, low-cost improvements ride along naturally
because the build now owns page structure:

- **Skip link.** Every generated page gets a "Skip to main content" link as
  the first focusable element (visually hidden until focused), landing on
  `<main>`. Cheap to bake in once, at the shared page-template level in
  `build.mjs`, and repeated nav links no longer stand between a keyboard or
  screen-reader user and the actual content on every single page.
- **Projects graph as genuine progressive enhancement.** The list view isn't
  a secondary fallback anymore — it's literally the page's real, pre-rendered
  content; the graph is layered on top by JS. With JavaScript disabled, or on
  first paint before the graph script runs, the page is the fully accessible
  list — semantic headings, real links, keyboard-navigable — never a blank
  canvas. The default *visual* experience is unchanged (graph first on wide
  viewports with JS available, per the prior spec's list-view breakpoint
  behavior); what changes is that "no graph" now degrades to real content
  instead of degrading to nothing.
- **`prefers-reduced-motion`.** The D3 force simulation's settle-in motion
  (nodes drifting from random start positions into place) is skipped —
  nodes render directly at their final simulated positions — when the OS/browser
  reports `prefers-reduced-motion: reduce`. Pan/zoom/drag stay fully
  available either way; only the automatic settling animation is affected.
- **Project detail modal.** Gets `role="dialog"` and `aria-modal="true"`,
  `aria-labelledby` pointing at the modal's title element, `Escape` closes
  it, focus moves to the modal on open and is trapped inside it while open,
  and returns to the project box that triggered it on close. None of this
  exists today; it's added as part of touching this code for the graph's
  sanitized-JSON change anyway.
- **Logo alt text.** The new hero logo (see "Content model changes") gets
  `alt` text equal to the site `title` — it's conveying identity, not
  decorative. Member portraits and initials-avatar fallbacks keep `alt=""`,
  unchanged: the name is already present as adjacent text, so the image is
  correctly treated as decorative.
- **Visible focus states.** No interactive element added by this work (skip
  link, filter inputs, view-toggle buttons, modal close button) suppresses
  the default focus outline; verified against the site's existing color
  palette rather than assumed.

Not included here, but worth naming as a natural follow-up once the build
produces plain static HTML: automated accessibility linting in CI (e.g.
`pa11y-ci` against the `public/` output) becomes much cheaper to add than it
would be against a client-rendered app, since there's no headless-browser
JS execution required to see the real markup. Left out of this pass since it
wasn't asked for and means picking a new tool/dependency — a reasonable
follow-up request, not assumed here.

## CI (`.gitlab-ci.yml`)

- **`validate` stage:** unchanged in spirit — `npm run validate && npm test`
  — now validates whatever `CONTENT_PATH` resolves to (the committed generic
  `content/` by default; a real `CONTENT_PATH` CI/CD variable for a real
  deployment's pipeline).
- **`pages` stage:** switches from `alpine:latest` + `cp -r` to `node:22-alpine`
  + `npm run build`, with `CONTENT_PATH` (and `CONTENT_USERNAME`/
  `CONTENT_PASSWORD` if needed) coming from GitLab CI/CD variables. Publishes
  `public/` as the Pages artifact, same as today.

## Content genericization

The checked-in `content/`, `README.md`, and test fixtures are scrubbed of
every RCSL / Christian Boulanger / `lhlt.mpg.de` reference. The default
template content becomes a fully fictitious example: the **Comparative Legal
Futures Network (CLFN)**, described as approved as a working group of a
fictitious **International Association for Comparative Legal Studies
(IACLS)** — an invented umbrella body, not modeled on any real organization
or event. Member names, affiliations, project descriptions, events, and news
items are all invented accordingly, in the same shape as today's placeholder
data (most member names already are placeholders — only the group identity,
real-sounding meeting locations, and the two test-fixture mentions of
"Boulanger" need to change).

The **current** content (as it exists right before this change, including
anything real in `content/pages/about.md`) is preserved untouched in
gitignored `.local/content/`, for later editing into the group's actual real
data, and as the natural `CONTENT_PATH` target for local builds against real
data in the meantime.

## Testing approach

- Existing `node --test` unit tests for pure functions continue, adapted to
  the new string-returning signatures (testing the returned HTML string
  directly, same assertions as today — most tests already assert on
  returned/injected HTML strings, not DOM structure).
- New: a small integration test for the build script (`tests/build.test.js`)
  — runs `build.mjs` against a fixture content directory into a temp output
  dir, asserts key files exist (`public/index.html`, `public/pages/about.html`,
  the sanitized graph JSON) and that raw source fields that must never be
  exposed (e.g. `email`) don't appear anywhere under the output directory.
- Manual smoke checklist (README) updated to reflect the new URLs (no more
  `pages.html?doc=`) and to note that raw JSON is no longer visible in the
  browser's network tab by design.
- Manual smoke checklist also gains two accessibility passes: a keyboard-only
  pass (skip link works; nav, filter boxes, view toggles, and the project
  modal — including Escape-to-close and focus return — are all reachable and
  operable without a mouse) and a JS-disabled pass (every page's real content
  is present and readable with JavaScript turned off; only the Projects
  graph and the filter boxes are expected to be inert).

## Migration scope

This touches: every file in `assets/js/` (split into build-time render
functions + the small remaining client runtime), `.gitlab-ci.yml`,
`package.json` (new `build`/`build:watch`/`validate` scripts, `marked` moved
from CDN to devDependency), `.env.example` (`CONTENT_PATH`,
`CONTENT_USERNAME`, `CONTENT_PASSWORD`), `.gitignore` (`/public/`, `/.local/`),
all five HTML shells (become build templates rather than shipped files —
`pages.html` is deleted), `README.md`, `tests/*.test.js`, and every file
under `content/`. It's a large, coherent refactor, not a small patch.
