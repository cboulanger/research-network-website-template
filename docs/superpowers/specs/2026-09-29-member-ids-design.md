# Member IDs Replace Email-Based Linking — Design

**Date:** 2026-09-29
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-09-23-static-build-pipeline-design.md`,
`docs/superpowers/specs/2026-09-23-member-projects-link-design.md` (introduced
the derived `memberSlug()` this spec replaces with a stored `id`).

## Goal

Members and `projects[].participants` currently link to each other via
`email`, an unstable identifier (people change institutional emails; the
README already notes email is never rendered, only used at build time to
resolve participants). Replace it with a stable, stored `id` field on each
member, formatted `{lastname-slug}-{firstname-slug}`, and have
`participants` reference that `id` instead of `email`.

This also lays the read/write foundation (a shared content-store module) that
the local data editor (a separate, later spec) will build on.

## 1. Schema changes

**`schema/members.schema.json`**: add `id` to `required` and `properties`:

```json
"id": {
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "description": "{lastname-slug}-{firstname-slug}, e.g. doe-jane; a numeric suffix (doe-jane-2) resolves collisions"
}
```

`email` stays required and unchanged (still not rendered anywhere) — it is no
longer a link key, purely a contact field.

**`schema/projects.schema.json`**: `participants[].items` changes from the
email-pattern regex to the same pattern as `members.id`, and its meaning
changes from "member email" to "member id":

```json
"participants": {
  "type": "array",
  "items": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" }
}
```

## 2. `assets/js/shared.js`

Rename `memberSlug(member)` → `computeMemberId(firstname, lastname)`,
reordering to lastname-first:

```js
export function computeMemberId(firstname, lastname) {
  const slugify = (value) => /* unchanged slugify body */;
  return `${slugify(lastname)}-${slugify(firstname)}`;
}
```

This becomes a *generator*, called only where an id needs to be computed
fresh from a name (the migration script in section 4, and later the data
editor when creating a member or changing their name) — never at render
time, since `id` is now stored data read directly off the member record.

## 3. Rendering code

- **`assets/js/members.js`**: `participantSlugs(projects, members)` builds
  `memberById = new Map(members.map((m) => [m.id, m]))` and collects
  `project.participants` ids directly (each id in the array that maps to a
  known member is already the value to add — no per-member computation
  needed). `renderMemberCard` / `renderMemberListItem` use `member.id`
  instead of calling the old `memberSlug()`. Function signatures and output
  shape (DOM `id`, `data-slug`, `href="...#<slug>"`) are unchanged — only the
  value's source (stored field, lastname-first) and computation path change.
- **`assets/js/projects-graph.js`**: `buildGraphData` keys
  `memberById = new Map(members.map((m) => [m.id, m]))`, looks up
  participants by id, and node ids become `scholar:${member.id}` directly.
  `sanitizeGraphData` still strips `email` from the data shipped to the
  browser (that privacy behavior is unchanged) but no longer computes a
  slug — it reads `n.data.id`, which is already safe to expose.
  `buildProjectListItems` similarly maps participant ids to members via
  `memberById` instead of `memberByEmail`.

## 4. Shared content-store module (new: `scripts/lib/content-store.mjs`)

Extracted and generalized from the read-only fetch logic in
`resolve-content-remote.mjs`, so both the migration script (section 5) and
the future data editor can read *and write* a `CONTENT_PATH` tree (local
directory or WebDAV URL) through one module:

```js
export async function readContentFile(contentPath, relPath) // -> string
export async function writeContentFile(contentPath, relPath, content) // -> void
```

- Local `contentPath`: `fs.readFile` / `fs.writeFile` (creating parent dirs
  as needed on write).
- Remote (`http(s)://`) `contentPath`: GET / PUT against
  `${contentPath}/${relPath}`, reusing the existing Basic Auth pattern
  (`CONTENT_USERNAME` / `CONTENT_PASSWORD`) and `fetchWithTimeout`.
- `resolve-content-remote.mjs`'s existing GET logic is refactored to call
  `readContentFile` rather than duplicating the fetch/auth code.

This module intentionally stays minimal (single-file get/put) — no
directory listing, no MKCOL. The data editor spec will state any further
requirements it needs (e.g. listing images) as they come up.

## 5. Migration script (new: `scripts/migrate-member-ids.mjs`)

One-off CLI tool for adding `id` to existing member data and rewriting
`participants` from email to id, usable against either a local content
directory or a live WebDAV store.

- Usage: `node scripts/migrate-member-ids.mjs [contentPath] [--apply]`.
  `contentPath` defaults to `process.env.CONTENT_PATH || './content'`, same
  as the build. Without `--apply`, it's a **dry run**: prints a summary
  (which members get a new id, what changed in `participants`, any
  warnings) and writes nothing.
- For each member missing `id` (or with an `id` not matching the pattern),
  computes one via `computeMemberId(firstname, lastname)`, resolving
  collisions against ids already assigned in this run by appending `-2`,
  `-3`, etc. Members that already have a valid `id` are left untouched, so
  the script is safe to re-run.
- Rewrites every `projects[].participants` entry: an email matching a
  member's `email` is replaced with that member's `id`. An email matching no
  member is left as-is and reported as a warning (dangling reference —
  today this is silently dropped at render time; the migration surfaces it
  instead of silently "fixing" it).
- With `--apply`, writes the updated `members.json` and `projects.json` back
  via `writeContentFile` (section 4).
- As part of implementing this spec, the script is run once (with `--apply`)
  against the committed `content/` demo data, so the repository's own demo
  content ends up in the new id-based shape.

## 6. Validation & docs

- `npm run validate` picks up the new `id`/`participants` patterns
  automatically (schema-driven, no changes to `scripts/validate.mjs`
  needed).
- README's `members.json` / `projects.json` bullet points are updated to
  describe `id` (format, collision rule) as the link key, and `email` as a
  contact-only field.

## 7. Testing

- `tests/members.test.js`: fixtures gain an `id` field (lastname-first,
  e.g. `{ firstname: 'Jordan', lastname: 'Lee', id: 'lee-jordan', ... }`);
  assertions that referenced the old firstname-first computed slug are
  updated to lastname-first stored `id`; `participantSlugs` test fixtures
  use id-based `participants` arrays.
- `tests/projects-graph.test.js`: same fixture updates (id-based
  `participants`); tests asserting `memberSlug`/slug-from-name computation
  are replaced with tests reading `member.id` directly.
- New `tests/shared.test.js` coverage (or added to an existing suite) for
  `computeMemberId`: basic case, diacritics/punctuation slugification
  (reused from the old `memberSlug` tests if any existed), lastname-first
  ordering.
- New test coverage for the migration script's pure logic (collision-suffix
  resolution, dangling-email warning) — the file I/O and dry-run/`--apply`
  paths are verified manually.

## Out of scope

- WebDAV directory listing, image upload/management (belongs to the data
  editor spec).
- Automatic re-migration on every build (this is a one-off, user-triggered
  script, not part of `npm run build`).
- Changing the anchor/hash URL *scheme* (`#member=<id>`,
  `members.html#<id>`) — only the value's shape changes (lastname-first
  instead of firstname-first), not how it's used.
