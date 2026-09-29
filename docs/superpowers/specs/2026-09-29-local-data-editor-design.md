# Local Data Editor — Design

**Date:** 2026-09-29
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-09-29-member-ids-design.md` (the
`id`-based participant linking and the shared `content-store.mjs`
read/write module this spec's server uses).

## Goal

A local-only admin UI for editing content without hand-editing JSON: a small
Node webserver (`npm run edit`, run from `scripts/`) that serves a
schema-driven CRUD interface for every content type whose schema is
`type: array` with `items` — currently `members`, `projects`, `events`,
`news` (`site` and `publications` are `type: object`, so out of scope; the
set is derived from the schema's shape, not hardcoded, so a future
array-of-items schema is picked up automatically). `projects` additionally
gets a participant picker backed by `members`.

It targets the same `CONTENT_PATH` as the build (`.env` / env var — local
directory or WebDAV URL), so it can edit either the local demo content or a
real content store, matching the README's "content editors work directly
against the content store" model. It is a dev tool, not part of the
deployed site — nothing here ships to `public/`.

## 1. Server

- `scripts/edit-server.mjs`, started via `npm run edit`
  (`node --env-file-if-exists=.env scripts/edit-server.mjs`), Node's
  built-in `http` module only (no new server dependency).
- Binds to `127.0.0.1` (not `0.0.0.0`) on a configurable port
  (`EDIT_PORT`, default `4848`); prints the URL to open. No built-in
  authentication — it's a localhost-only dev tool, same trust boundary as
  running `npm run build` locally. Writes go straight to `CONTENT_PATH`
  (local disk or a real WebDAV store) exactly like a build would read from
  it, so whoever runs it needs the same credentials/access the build needs.
- Serves two things: the static editor frontend (`scripts/editor/`: one
  HTML page, one JS module, minimal CSS — kept separate from `assets/`
  and `public/`, which belong to the deployed site) and a small JSON API
  under `/api/`.
- Resolves `CONTENT_PATH` once at startup via `resolveContent` (existing
  helper) for reads, and uses the new `content-store.mjs`
  (`readContentFile`/`writeContentFile`, from the member-ids spec) for
  every write, so both local and WebDAV targets work identically.

## 2. Content types and identity

For each schema in `schema/*.schema.json` with `"type": "array"` and an
`items` sub-schema, the server exposes it as an editable collection, keyed
by:

- **`members`, `projects`**: the record's `id` field (already unique per
  their schemas after the member-ids spec).
- **`events`, `news`**: neither schema has an id field (just `date` +
  `title`, not guaranteed unique) and this spec doesn't add one — that
  would be a schema change belonging to a different spec. Records are
  instead addressed by their **array index** in the current file
  (`GET /api/data/events` returns the array; `PUT`/`DELETE
  /api/data/events/:index` acts on that position). Because saves are
  immediate and the frontend always re-fetches the full list after any
  write (section 5), a stale index can't silently target the wrong record
  within a session.

`site` and `publications` (`type: object`, no `items`) are not listed or
served by the editor.

## 3. API

All endpoints read/write through `content-store.mjs`; every write
re-validates the **entire resulting array** against the type's schema
(section 6) before it's persisted — a failed validation returns `400` with
the Ajv error list and nothing is written.

- `GET /api/types` — list of editable type names, derived from `schema/*`.
- `GET /api/schema/:type` — the raw JSON schema for that type (drives form
  generation client-side).
- `GET /api/data/:type` — the full current array (re-read from
  `CONTENT_PATH` each time — no server-side caching, so external edits to
  the store are picked up on the next request).
- `POST /api/data/:type` — create: append a new record. For `members` and
  `projects`, if the client-submitted `id` is missing or collides with an
  existing record's `id`, the server computes/resolves it the same way the
  migration script does (`computeMemberId` for members; for projects, the
  submitted `id` is required as-is, matching today's manual-id convention).
- `PUT /api/data/:type/:key` — update the record at `id` (members/projects)
  or array index (events/news).
- `DELETE /api/data/:type/:key` — delete. For `members`, see section 4
  (cascade).

## 4. Deleting a member: cascade

`DELETE /api/data/members/:id` first checks `projects.json` for any project
listing that id in `participants`. If any are found, the response requires
confirmation: the client shows the affected project titles and asks the
user to confirm; on confirmed delete, the server computes both the updated
`members` array (record removed) and the updated `projects` array (id
stripped from `participants` everywhere it appears), validates both against
their schemas, and only writes either file once both pass — avoiding a
write with a validation error partway through. The underlying store still
has no cross-file transactions (a WebDAV PUT can still fail after the first
file succeeds), so a failure writing the second file is reported to the
user as a partial-write error rather than silently rolled back. Deleting a
member with no project references is immediate, no confirmation needed
beyond the usual "delete this record?" prompt every delete gets.

## 5. Frontend

Vanilla JS single-page app (`scripts/editor/app.js`), consistent with
`assets/js/`'s existing no-framework style:

- A sidebar/nav lists the editable types (`GET /api/types`); selecting one
  loads its schema and records and renders a table (one row per record,
  columns for a few key fields — e.g. name/affiliation for members,
  title/id for projects, date/title for events/news) with **Edit** and
  **Delete** buttons per row and a **New** button.
- **Generic form generation**: for a given type's schema, each property in
  `properties` becomes a labeled input, generated purely from the schema
  (no per-type hardcoded form markup):
  - `type: "string"` → a text input (a `textarea` specifically for a
    `description` property, since that's the one long-form field across
    the schemas); the schema's `pattern`, if present, is set as the
    input's HTML `pattern` attribute for immediate browser-level feedback,
    in addition to the authoritative server-side Ajv check on save.
    Properties in the schema's `required` list are marked required.
  - `type: "array", items: { type: "string" }` → a repeatable list of text
    inputs with add/remove-row buttons — **except** `projects.participants`
    specifically, which gets the dedicated picker below instead of raw
    text rows.
  - No other field shapes exist in the current schemas (no booleans,
    nested objects, or enums), so no other widget types are built; this is
    the generic case the "simple" editor covers, not a full JSON-Schema
    form library.
- **Participant picker** (`projects` only): a search box filtering the
  full `members` list (fetched via `GET /api/data/members`) by name; each
  match not already a participant shows an "Add" action, and each current
  participant (resolved id → name via the same members list) shows in a
  chip/list with a "Remove" action. The underlying form field stays
  `participants: string[]` of member ids — the picker is just a friendlier
  editor for that one array.
- **Save behavior**: immediate per-record `POST`/`PUT`/`DELETE`, no staged
  "publish" step (matches the rest of the site's direct-content-store
  philosophy). After any successful write, the frontend re-fetches that
  type's record list so the table and any open picker reflect the
  persisted state (and, for events/news, so index-based keys stay valid).
  A failed save (validation error or network error) shows the error inline
  on the form and leaves it open with the user's input intact, so nothing
  is lost.

## 6. Validation

- New devDependency: `ajv` (already pulled in transitively by `ajv-cli`,
  used directly here instead of shelling out, since the server validates
  on every write rather than once per `npm run validate` invocation).
- One `Ajv` instance per schema, compiled at startup from `schema/*`. On
  every write, the server validates the full updated array (not just the
  changed record) — this guarantees a file the editor writes always also
  passes `npm run validate`, and catches cross-record issues the schema
  itself expresses (e.g. `additionalProperties: false` on the object,
  `pattern` on `id`).
- Ajv errors are returned as-is (path + message) in the `400` response
  body; the frontend renders them next to the relevant field when the
  error path matches a known property, otherwise as a general form-level
  error.

## 7. Testing

- Pure-logic unit tests (`tests/edit-server.test.js` or similar) for
  anything extractable as pure functions: request routing/key derivation
  (id vs. index addressing per type), the member-delete cascade's
  participant-stripping logic, and schema-to-editable-types derivation
  (`type: array` + `items` filter over `schema/*`).
- The HTTP layer itself (routes, Ajv wiring, content-store integration) is
  covered by a small number of integration tests that start the server
  against a temp local `CONTENT_PATH` fixture and exercise each endpoint
  (create/update/delete for each type, including the events/news index
  case and the members cascade-delete case, and a rejected write on
  invalid input).
- Manual: run against a real WebDAV `CONTENT_PATH` once to confirm
  read/write works end-to-end outside the local-fixture case; general
  form usability (add/remove array rows, participant picker search).

## Out of scope

- Authentication/access control beyond binding to localhost.
- Image upload (portrait_url/image_url stay plain text fields).
- Staged/batched changes with a review-before-publish step.
- Optimistic concurrency / locking against simultaneous external edits to
  the same content store.
- Adding id fields to `events`/`news` schemas.
- Editing `site.json` / `publications.json`.
