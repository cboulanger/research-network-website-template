# Page Link Lookup in the Content Editor — Design

**Date:** 2026-10-16
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-10-16-page-editor-design.md` (the
`/api/pages` endpoint and the `content/pages/*.md|*.html` convention this
reuses) and `docs/superpowers/specs/2026-09-29-local-data-editor-design.md`
(`assets/js/record-form.js`, shared by the admin editor and the public
self-service edit form).

## Goal

Three schema fields let an editor link to either an external URL or an
internal content page: `events.url` and `news.url` (titled "Link (URL or
page name)") and, after this change, `projects.url` (titled "Project web
page (URL)", currently URL-only). Today there is no help picking the right
internal page — an editor has to know the exact filename and, for
events/news, remember the `pages.html?doc=` link format by hand.

This adds a lookup: while typing into one of these three fields, if the
current value doesn't start with `http`, a dropdown of matching pages
(matched by title or filename against what's typed) appears below the
field; clicking one fills in that page's filename. Selecting changes what's
typed, nothing else — the field stays a normal, freely-editable text input.

## 1. Data model: bare filename, not `pages.html?doc=...`

`events.url`/`news.url`/`projects.url` now store **either a full external
URL, or a bare page filename** (e.g. `about.md`) — never the
`pages.html?doc=...` link form. That link form is a presentation/build-time
concern, not part of the stored content.

**Schema change** (`schema/events.schema.json`, `schema/news.schema.json`,
`schema/projects.schema.json`): all three `url` fields get the same pattern,
replacing their current (two different) local-token patterns:

```json
"pattern": "^(https?://[^\\s\"'<>]+|[A-Za-z0-9_-]+\\.(md|html))$"
```

The filename alternative (`[A-Za-z0-9_-]+\.(md|html)`) is the same shape
`assets/js/shared.js`'s `isValidDocFilename`/`DOC_FILENAME_PATTERN` already
enforces server-side for real page filenames — this is a hand-written
duplicate (schemas can't import JS constants) but intentionally identical,
so a value that validates here always corresponds to an addressable page.

This is strictly tighter than today's events/news pattern (which accepted
any slash-free token, not just a real filename shape) and strictly looser
than today's projects pattern (URL-only) — the "relaxing the schema" the
request anticipated for `projects.url`.

**Demo data:** `content/data/events.json`'s one existing
`"url": "pages.html?doc=example.html"` record is updated to
`"url": "example.html"` to match the new convention. No other migration:
there is no other committed data in the old format, and the one real
deployed site's single affected record is the site owner's to update by
hand (confirmed out of scope for this change).

## 2. Rendering: resolving a stored value back into a working link

New helper in `assets/js/shared.js`, next to the existing
`resolvePortraitUrl` (shared.js:27-31), which already does the equivalent
thing for image filenames:

```js
export function resolvePageLink(url) {
  return isExternalLink(url) ? url : `pages.html?doc=${url}`;
}
```

Call sites updated to route through it instead of using the stored value
directly as an `href`:

- `assets/js/events.js` (currently `href="${escapeHTML(item.url)}"`,
  events.js:13-15) → `href="${escapeHTML(resolvePageLink(item.url))}"`.
- `assets/js/news.js` (currently `href="${escapeHTML(item.url)}"`,
  news.js:10-12) → same change.
- `assets/js/projects-graph.js`, both places `project.url`/`p.url` become an
  `href` (the teaser card at projects-graph.js:91 and the detail-view
  assignment at projects-graph.js:165-166) → both routed through
  `resolvePageLink`.

`assets/js/members.js`'s `member.url` is **not** touched — `members.url`
isn't getting the lookup widget and its semantics (always a full external
personal-page URL) aren't changing.

## 3. Editor widget

**Schema hint:** all three fields gain `"x-editor": { "widget": "page-link" }`
(`record-form.js`'s existing hint mechanism — `editorHints()`, the same
place `"widget": "textarea"` and `"widget": "date"` are already read,
record-form.js:161-163).

**`assets/js/record-form.js` changes:**

- `renderRecordFields(form, { itemSchema, record, typeName, members = [],
  pages = [], skipReadOnly })` gains a `pages` parameter, defaulting to
  `[]`, threaded down to `buildField` alongside `members` — same shape as
  the existing parameter, not a new data-flow mechanism.
- `buildField` gains a branch: when `hints.widget === 'page-link'`, render a
  text `<input>` exactly as the default case already does (same id,
  `pattern` attribute from the schema, required/readOnly handling
  unchanged) **plus** a small autocomplete dropdown wired up after the
  input is in the DOM. If `pages` is empty (the public edit page's case —
  it never supplies one), this is indistinguishable from a plain input:
  there's nothing to match against, so no dropdown ever renders. No
  separate code path is needed for "no pages available."
- Dropdown behavior, mirroring the event-handling style already established
  by `buildParticipantPicker` (record-form.js:48-120) — an `input` listener
  driving a client-side filter over an in-memory array — but with a
  lighter, single-value UI instead of that function's persistent
  list-plus-search-box (which is built for picking *several* items):
  - On every `input` event: if the current value starts with `http`
    (case-insensitive) or is empty, hide/clear the dropdown.
  - Otherwise, filter `pages` by case-insensitive substring match of the
    typed value against either the page's `title` or its filename stem
    (the filename without its `.md`/`.html` extension — this is what "slug"
    meant in the original request; pages don't have a separate slug field,
    the filename stem *is* the slug).
  - Render each match as a clickable row showing the page title (with the
    filename as secondary/smaller text, so an editor can tell two
    similarly-titled pages apart). No matches → dropdown stays hidden (same
    as empty input).
  - Clicking a row sets the input's value to that page's `filename` and
    hides the dropdown. No change to focus/other field behavior.
  - No keyboard navigation (arrow keys, Enter-to-select) — click-only,
    matching the participant picker's existing scope; add later only if
    asked for.

**`scripts/editor/app.js` changes:**

- `selectType()` already fetches `members` fresh on every call when
  `name === 'projects'` (app.js:118-119). Extend this: fetch `pages` fresh
  via `/api/pages` whenever `name` is `'events'`, `'news'`, or `'projects'`
  (the three types with a page-link field), stored as `state.pages` and
  passed to `renderForm`/`renderRecordFields` the same way `state.members`
  already is. Fetching fresh on every type-switch (rather than once at
  startup) means a page created via the Pages panel shows up in the
  dropdown immediately, with no reload — no cross-module cache or
  synchronization needed, just the same "re-fetch when you open the form"
  convention already used for `members`.

## Out of scope

- The public self-service edit form (`assets/js/edit-page.js`) does not get
  its own pages index or build-time pages-data export — the widget's
  graceful empty-`pages` fallback (plain input, no dropdown) is the whole
  story there.
- `members.url`, `portrait_url`, `image_url` — not requested, semantically
  different (image files, not pages, for the latter two; no lookup
  requested for the former).
- Keyboard navigation of the dropdown (arrow keys / Enter-to-select).
- Migrating any data beyond the one committed demo record.
- Validating, at save time, that a bare-filename value actually corresponds
  to a page that exists (the dropdown is a convenience; a typed value that
  doesn't match any page is still accepted if it matches the schema
  pattern, same as today).
