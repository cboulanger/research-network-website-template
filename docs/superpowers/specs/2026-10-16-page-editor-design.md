# Page Editing in the Content Editor — Design

**Date:** 2026-10-16
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-09-29-local-data-editor-design.md`
(the editor server/frontend) and
`docs/superpowers/specs/2026-09-30-editor-datatables-design.md` (the record
list widget this reuses).

## Goal

`content/pages/*.md|*.html` are free-form content pages (e.g. `about.md`,
`example.html`) with no edit UI at all today: they aren't a JSON-schema
collection like members/events/projects/news, so they're invisible to the
existing `EDITABLE_TYPES`-driven DataTable/form machinery and to the public
ntfy-inbox submission flow. They can currently only be edited by hand-editing
files on the content share.

This adds a **Pages** section to the local/admin editor (`npm run edit`):
list existing pages, open one in a proper editor, create a new page
(Markdown by default, HTML selectable), and delete a page. This is scoped to
the admin editor only — pages are not added to the public-submission (ntfy
inbox) flow, since nothing in this request calls for that and they aren't
part of `EDITABLE_TYPES` today.

## 1. Directory listing (`scripts/lib/content-store.mjs`)

Content pages are addressed by filename only (`^[A-Za-z0-9_-]+\.(md|html)$`,
already enforced by `assets/js/shared.js`'s `isValidDocFilename`), but
nothing in the codebase can currently enumerate *all* files under
`pages/` when `CONTENT_PATH` is a remote WebDAV URL — `build.mjs`'s remote
path (`resolve-content-remote.mjs`) only ever fetches `about.md` plus pages
explicitly linked from news/events items, by design (it never lists the
directory).

New export `listContentDir(contentPath, relPath)`:

- **Local** (`contentPath` is a filesystem path): `readdir(path.join(contentPath, relPath))`,
  filtered through `isValidDocFilename`.
- **Remote** (`contentPath` is an `http(s)://` WebDAV URL): an HTTP
  `PROPFIND` request to `${contentPath}/${relPath}/` with header
  `Depth: 1`, reusing `authHeaders()`/`fetchWithTimeout` exactly as
  `readContentFile`/`writeContentFile` do. The response is a
  `multistatus` XML document; basenames are extracted from each
  `<D:href>` (namespace prefix varies by server, so match loosely:
  `/<[^>]*:href>([^<]+)<\/[^>]*:href>/gi`), URL-decoded, and filtered
  through `isValidDocFilename` (this also naturally drops the directory's
  own self-referencing entry, which always sorts first in a PROPFIND
  response and never matches the filename pattern). No XML parser
  dependency is added — the multistatus structure for this narrow,
  known-shape read is simple enough for a targeted regex, consistent with
  this codebase's existing preference for zero-dependency parsing (e.g.
  `build.mjs`'s own regex-based heading extraction).

A PROPFIND failure (non-207 status, network error) propagates like any other
`content-store.mjs` failure — no special handling, same pattern as
`readContentFile`.

## 2. Server routes (`scripts/edit-server.mjs`)

A new `/api/pages` namespace, parallel to the existing `/api/data`:

- `GET /api/pages` → `[{ filename, type, title }]`, sorted by title.
  `type` is `getDocType(filename)` (`'markdown'|'html'`). `title` is derived
  exactly like `build.mjs` already does when rendering pages: read the file,
  render to HTML (`marked.parse` for markdown, pass through for html),
  extract the first `<h1>`, strip tags; fall back to `titleFromFilename`
  if there's no `<h1>`.
- `GET /api/pages/:filename` → `{ filename, type, content }` — raw source
  text, unrendered.
- `POST /api/pages` with body `{ title, format }` (`format` is `'markdown'`
  or `'html'`, defaulting to `'markdown'`):
  - `filename = slugify(title) + (format === 'html' ? '.html' : '.md')`,
    reusing the existing `slugify` from `assets/js/shared.js` (same helper
    members/projects already use for IDs).
  - Starter content: `# ${title}\n` for markdown, `<h1>${escapeHTML(title)}</h1>\n`
    for html.
  - 409 if a file with that filename already exists (checked via
    `listContentDir`, same race-acceptance level as the rest of this
    single-admin editor — no locking).
  - 400 if `slugify(title)` is empty (e.g. title is all punctuation).
- `PUT /api/pages/:filename` with body `{ content }` → overwrites the file
  via `writeContentFile`. `filename` is re-validated server-side with
  `isValidDocFilename` regardless of what the client sent — this is the
  only thing standing between a crafted request and a path-traversal write,
  since `content-store.mjs` otherwise joins the path directly.
- `DELETE /api/pages/:filename` → removes the file. (`content-store.mjs`
  gains a small `deleteContentFile` alongside `read`/`writeContentFile`:
  `unlink` locally, HTTP `DELETE` remotely.)

All four routes 404 on an invalid/non-matching filename rather than
attempting the file operation.

## 3. Editor UI (`scripts/editor/`)

- **Nav:** a hard-coded "Pages" entry in `#type-nav`, alongside the
  schema-derived type links — not generated from `state.types`, since pages
  aren't schema-driven. Clicking it shows the Pages panel and hides the
  type table/form panels, the same show/hide pattern `selectType()` and the
  Inbox toggle already use.
- **List view:** reuses the existing DataTable panel plumbing
  (`#table-body`/`#records-table`) rather than building a second table
  widget — fed synthetic rows `[Title, Filename, Type]` with the same
  trailing Actions (Edit/Delete) column convention as every other type,
  instead of `listColumns()`-derived schema columns. Row click opens the
  page editor in place of `record-form.js`.
- **New page:** the "New" button opens a minimal form — Title (text) and
  Format (`Markdown` default-selected, `HTML`) — posting to `POST /api/pages`
  and then opening the created page for editing.
- **Page editor:** [Toast UI Editor](https://ui.toast.com/tui-editor) 3.2.2,
  loaded via `<link>`/`<script>` tags in `scripts/editor/index.html`. **Not
  CDN-hosted** (unlike DataTables): the self-contained "all-in-one" bundle
  this needs (no separate `prosemirror-*` script tags to wire up) is only
  published by Toast UI on their own `uicdn.toast.com`, which isn't mirrored
  on jsdelivr/unpkg/cdnjs — the plain npm package has external ProseMirror
  dependencies that don't resolve as a bare script tag. A real failure to
  reach `uicdn.toast.com` (persistent, not transient) surfaced this during
  testing, so the two prebuilt files (`toastui-editor-all.min.js`,
  `toastui-editor.min.css`, ~700KB total) are vendored into
  `scripts/editor/vendor/` and served by `edit-server.mjs`'s existing
  static-file mechanism instead — no bundler, no build step, just two
  downloaded-once static files with no runtime third-party dependency.
  `pages-view.js`'s `mountEditor()` also checks `typeof EditorCtor ===
  'function'` before use, showing a plain error message instead of an
  uncaught exception if the script somehow still isn't present.
  - Markdown-type pages: `new toastui.Editor({ initialEditType: 'markdown', ... })`
    with `initialValue` set to the loaded source; saved via
    `editor.getMarkdown()`.
  - HTML-type pages: editor created in WYSIWYG mode
    (`initialEditType: 'wysiwyg'`), content loaded with
    `editor.setHTML(source)` after construction (Toast UI's `initialValue`
    is always parsed as markdown, so raw HTML must be injected this way);
    saved via `editor.getHTML()`.
  - Save button → `PUT /api/pages/:filename`. Delete button → the same
    confirm-dialog pattern already used for member/project deletion →
    `DELETE /api/pages/:filename`, then back to the list.
- **Known limitation (documented, not solved here):** Toast UI's WYSIWYG
  mode models content as a fixed node schema (paragraphs, headings, lists,
  tables, images, code blocks, blockquotes). Arbitrary custom HTML in an
  existing `.html` page — custom classes, embeds, unusual nesting — is not
  guaranteed to round-trip unchanged through `setHTML()`/`getHTML()`; it may
  be normalized or stripped on first save. This is fine for content shaped
  like today's `example.html` (a heading and paragraphs). The HTML-page
  editor view shows a short, dismissable notice to this effect so a save
  isn't a silent surprise for richer existing markup.

## 4. Testing

Following this repo's existing split — DOM/widget wiring in
`scripts/editor/app.js` (DataTables, and now Toast UI Editor) isn't
unit-tested; the logic underneath it is:

- `content-store.test.js`: `listContentDir` for both the local (`readdir`)
  and remote (mocked `PROPFIND` response, including a server that uses a
  different namespace prefix) cases, and the new `deleteContentFile`.
- `edit-server.test.js`: full CRUD over `/api/pages` — list (including
  title derivation from an `<h1>` vs. filename fallback), get, create
  (including the slugify-collision 409 and empty-slug 400), update, delete,
  and rejection of a filename that doesn't match `isValidDocFilename` on
  every route.
- No new test for the Toast UI Editor wiring itself (consistent with
  DataTables having none), but the filename-derivation logic
  (`slugify(title) + extension`) used by the "New page" form is small enough
  to unit test directly if it's extracted as a named function rather than
  inlined.

## Out of scope

- Adding pages to the public ntfy-inbox submission flow.
- Renaming an existing page (changing its filename after creation) or
  converting a page between markdown and HTML format after creation.
- Any locking/conflict handling beyond the existing single-admin-editor
  assumption already made by every other collection in this tool.
- Installing Toast UI Editor as an npm dependency and bundling it (the two
  prebuilt files are vendored as static assets instead — see §3 — which is a
  narrower thing than adding a bundler/build step to this project).
- Arbitrary-HTML-fidelity guarantees in WYSIWYG mode (see §3's known
  limitation).
