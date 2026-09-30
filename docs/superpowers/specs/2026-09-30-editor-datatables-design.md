# Editor Record Table: Switch to DataTables — Design

**Date:** 2026-09-30
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-09-29-local-data-editor-design.md`
(the editor frontend and its custom `renderTable()`).

## Goal

The editor's record list (`scripts/editor/app.js`'s `renderTable()`) is a
plain hand-built `<table>` with no search, filter, or interactive sort — the
only "sort" is a fixed schema hint applied once at render time. Replace it
with the [DataTables](https://datatables.net) widget loaded from CDN, giving
every record list (members, projects, events, news) a built-in search box
and clickable column-header sorting for free, without per-type code.

DataTables 3 (current stable: 3.1.2, released July 2026) is the first
fully dependency-free release — no jQuery required — so it drops in without
adding jQuery as a project dependency.

## 1. Loading the library

Added to `scripts/editor/index.html`:

- `<link rel="stylesheet" href="https://cdn.datatables.net/v/dt/dt-3.1.2/datatables.min.css">`
  in `<head>`.
- `<script src="https://cdn.datatables.net/v/dt/dt-3.1.2/datatables.min.js"></script>`
  in `<body>`, placed immediately **before** the existing
  `<script type="module" src="app.js"></script>`. A classic script tag runs
  synchronously as the parser reaches it, while a `type="module"` script is
  always deferred until after parsing — so this ordering guarantees the
  global `DataTable` constructor exists before `app.js` runs, without needing
  a dynamic `import()`.

No build step, bundler, or new npm dependency is involved; this is a runtime
CDN load, same trust/availability model as any other CDN-hosted asset (the
editor already requires network access for its WebDAV/GitHub calls, so this
adds no new offline constraint).

## 2. `renderTable()` changes (`scripts/editor/app.js`)

Row/header HTML generation is unchanged: `listColumns()` still picks the
schema's `x-editor.columns` hint, and each `<tr>` is still built with the
same escaped cells and the same `data-action`/`data-key` Edit/Delete buttons
in a trailing "Actions" column. What changes is what happens after that HTML
is in the DOM, and what feeds the initial sort:

- `sortedEntries()` is removed. Rows render in the record array's natural
  order (`state.records.map((record, index) => [record, index])`);
  DataTables applies the initial sort itself (see below), and the user can
  re-sort by clicking any column header from then on.
- After setting `thead`/`tbody` innerHTML, call:

  ```js
  new DataTable('#records-table', {
    destroy: true,
    paging: false,
    order: initialOrder(),
    columnDefs: [{ targets: -1, orderable: false, searchable: false }],
  });
  ```

  - `destroy: true` tears down and replaces any DataTable already attached
    to `#records-table`, which is required since switching content type
    changes the column count/labels (e.g. projects has one data column,
    events has two) — without it, re-initializing on top of a differently
    shaped table throws.
  - `paging: false` shows every record on one page (per the approved
    design); search and sorting remain fully active.
  - `columnDefs` excludes the trailing Actions column from both sorting and
    the search filter, so "Edit"/"Delete" button text can never match a
    search or be clicked as a sort header.
  - `initialOrder()` is a new small helper that translates the schema's
    existing `x-editor.sort` hint (`{ by, order }`, `by` a field name or
    array of field names) into a DataTables `order` array of
    `[columnIndex, 'asc'|'desc']` pairs, by looking up each field's position
    in `listColumns()`. This preserves today's default ordering (events/news
    newest-first by `date`, members by `lastname` then `firstname`, projects
    by `title`) as the *initial* sort, while handing ongoing sort control to
    the user via DataTables' column headers. Every current schema's
    `sort.by` fields are already a subset of its `columns`, so this mapping
    always succeeds; a schema without a `sort` hint simply gets no initial
    `order` (DataTables' own default: natural row order).
  - `renderTable()` is called on every `selectType()` and after every
    create/update/delete, so this init runs fresh each time — no separate
    "update existing instance" path is needed.

## 3. Styling (`scripts/editor/style.css`)

DataTables' default stylesheet is used as-is for structure/behavior (search
box, sort-arrow header decoration, "Showing N of M entries" info text), with
a small override block so it blends with the editor's plain look rather than
looking like a themed drop-in:

- Font family/size on `.dataTables_wrapper`, `.dataTables_filter input`, and
  `.dataTables_info` matched to the existing `body`/`table` rules
  (`system-ui`, current text color).
- Spacing/margins trimmed to fit the existing `.table-panel`/`.table-header`
  layout (the search box currently has no home in the header row — it'll
  render above the table via DataTables' default layout, inside
  `#table-body`).
- The existing `th, td { padding; border-bottom }` and `.cell-date`,
  `.row-actions` rules are left as-is; they still apply since the table's
  actual cell markup doesn't change.

No Bootstrap/Bulma/jQuery UI integration — just the base `dt` styling
DataTables ships by default, lightly overridden.

## Out of scope

- Per-column filter inputs (only the single global search box DataTables
  provides by default).
- Pagination (explicitly disabled per the approved design).
- Persisting sort/search state across a type switch or page reload.
- Any server-side (`edit-server.mjs`) or schema change — this is entirely
  within `scripts/editor/`.
- Self-hosting DataTables (e.g. via npm + bundling) instead of the CDN.
