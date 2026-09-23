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
into `index.html` directly at build time. Editing it updates both places,
which is also why a document under `content/pages/` shouldn't contain a
page-relative link like `events.html` to another top-level page: the same
file is rendered at two different depths (site root, and one level down at
`public/pages/<name>.html`), so a page-relative link only resolves
correctly from one of them. Either avoid the link (the nav bar already
links to every top-level page) or use an absolute `https://` URL.

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
