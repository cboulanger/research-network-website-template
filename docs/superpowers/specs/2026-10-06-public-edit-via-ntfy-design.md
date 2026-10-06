# Public edit/add via ntfy — design

## Goal

Let site visitors propose edits and additions to public data without a
backend. A static page posts a JSON message to an ntfy topic; the admin editor
(`npm run edit`) pulls those messages, shows them for review, and saves
accepted ones to the content data.

The feature is optional: if `NTFY_TOPIC` is not set in `.env`, nothing is built
and no edit code ships.

## Decisions

- **Server:** configurable via `NTFY_SERVER` (default `https://ntfy.sh`), so
  admins can self-host for longer retention (ntfy.sh caches ~12h) and bigger
  messages (ntfy.sh limit 4 KB).
- **Private fields:** omitted entirely from the public form, the public data
  and the ntfy messages. Reviewer fills them in for new records.
- **Scope:** all four array collections (members, projects, events, news).
  Publications (Zotero) and `site` (singleton) are not editable publicly.
- **Form code:** extracted into a shared module used by both the admin editor
  and the public edit page.

## 1. Schema: `x-editor.private`

- `"x-editor": { "private": true }` on a property marks it never public.
  `schema/members.schema.json`: `email` gets it.
- A helper `stripPrivate(schema)` / `stripPrivateRecord(schema, record)`
  (in `scripts/lib/`, importable by the browser module too) removes private
  properties from a schema (including from `required`) and from records.
- The build no longer uses `email` for the avatar colour
  (`hashColor(member.email)` in `assets/js/members.js`); it uses `id`.
- Submissions are validated against the stripped schema. On review, the
  reviewer completes private required fields before saving (full schema).

## 2. Build

Enabled only when `NTFY_TOPIC` is set. Then the build additionally emits:

- `edit.html` — the form page (generic over collection via query string).
- `assets/js/record-form.js` (shared form module), `assets/js/edit-page.js`,
  `assets/js/edit-mode.js`.
- `assets/data/<collection>.json` — public data, private fields stripped, for
  the four editable collections.
- `assets/schema/<collection>.schema.json` — stripped schemas.
- `assets/js/edit-config.js` — `{ server, topic }`.

List pages (members, projects, events, news) load `edit-mode.js` when enabled.
Without `NTFY_TOPIC`, none of these files exist and pages do not reference them.

`.env.example`, README and AGENTS.md document `NTFY_TOPIC` and `NTFY_SERVER`.

## 3. Public site

- `edit-mode.js` activates when the URL has `?edit` and remembers it in
  `sessionStorage` so navigation between pages keeps edit mode.
- In edit mode each list row/card gets an "Edit" button and the list gets an
  "Add" button, linking to `edit.html?type=<collection>&id=<id>` or
  `edit.html?type=<collection>&new`.
- `edit-page.js` loads the stripped schema (+ data for edits), renders the form
  with `record-form.js`, validates, and POSTs to `{server}/{topic}`:

  ```json
  {"v":1,"type":"members","op":"update","id":"adler-ada","data":{},"ts":"2026-10-06T12:00:00Z"}
  ```

  `op` is `add` or `update`. For `update`, `data` is the full public record.
- Payloads exceeding the size limit (4096 bytes unless a self-hosted server is
  used; the limit is a constant, checked before sending) are rejected in the
  form with a clear message. Network/HTTP errors are shown; success shows a
  confirmation.

## 4. Admin editor: inbox

- Server endpoint `GET /api/inbox` fetches
  `{server}/{topic}/json?poll=1&since=<last-id>`, parses messages, and drops
  anything that is not a valid v1 envelope or fails schema validation (stripped
  schema), reporting counts of dropped messages.
- Handled/seen state is stored in a gitignored local file (`.local/inbox.json`:
  last-seen id, handled message ids).
- UI: an "Inbox" panel with a badge count. Each entry shows a field-by-field
  diff against the current record (updates) or a preview (adds). If the stored
  record differs from what the message was based on, the diff makes that
  visible (it always diffs against the current record).
- **Accept** opens the normal edit form prefilled with the merged record
  (stored private values preserved for updates; empty for adds). Saving uses
  the existing `POST`/`PUT /api/data/<collection>` path, so id assignment and
  the member cascade are reused, then marks the message handled.
- **Reject** marks it handled without changing data.
- If `NTFY_TOPIC` is unset the Inbox is not shown.

## 5. Refactor: shared form module

Move field construction (`buildField`, widgets, participant picker, reading
values back from the form) from `scripts/editor/app.js` into
`assets/js/record-form.js`: plain ES module, no server/DataTables dependency,
taking a schema and record and returning DOM / collected data. The editor
imports it (served by the edit server); the public build copies it.

## 6. Trust and abuse

Anyone can post to and read the topic, and the topic name is visible in the
site source. Mitigation is human review plus schema validation; nothing is
written automatically. README recommends a long random topic name and, if
needed, a self-hosted ntfy with access control.

## 7. Testing

Unit tests: private stripping (schema + record), envelope/message validation,
inbox diff, build with and without `NTFY_TOPIC` (files emitted/not emitted,
`email` absent from public data), `edit-mode` link generation, size-limit
check. ntfy access via mocked `fetch`.

## Out of scope

Encryption of private fields, spam rate limiting beyond what ntfy provides,
chunking large submissions, public editing of publications/site.
