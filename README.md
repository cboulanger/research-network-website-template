# RCSL WG Histories of the Sociology of Law

Static, no-backend website for the RCSL Working Group "Histories of the
Sociology of Law." See `docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`
for the full design.

**Current state: proof of concept.** `data/members.json`, `data/projects.json`,
`data/events.json`, and `data/news.json` contain fake/placeholder data, not the
working group's real roster, projects, news, or meeting history. Replace them
with real data (same shape, see `data/schema/`) before launch. `pages/about.md`
holds real About/Contact/Membership content, but its three placeholder links
(`href="#"`) and `pages/example.html` still need real content before launch.

## Local preview

No build step. From the repo root:

    python -m http.server 8000

Then open `http://localhost:8000/index.html`.

## Running checks

    npm run validate   # JSON Schema validation of the four data files
    npm test            # unit tests for pure logic (node --test)

Both require Node.js locally (only for tooling — the deployed site itself
needs no Node, no backend, no secrets).

## Editing data

Add or edit a member, project, or event by hand-editing the matching JSON
file in `data/` and opening a merge request. Each file must validate
against its schema in `data/schema/` (`npm run validate` checks this
locally; CI enforces it on every push).

- `site.json`: site-wide text (nav banner label, landing page title and
  subtitle) — edit this to reuse the site for a different group without
  touching any HTML.
- `members.json`: `email` is the unique id, referenced by
  `projects[].participants`.
- `projects.json`: `participants` is a list of member emails.
- `events.json`: sorted newest-first automatically at render time — no
  need to keep the file itself in date order.
- `news.json`: same shape as `events.json`. `url` can be an absolute
  `http(s)://` link (opens in a new tab) or a relative link into the Pages
  viewer, e.g. `pages.html?doc=about.md` (opens in the same tab).

Adding a longer write-up (e.g. to link from a news item) means adding a
`.md` or `.html` file under `pages/` — no code changes required. Link to it
with `pages.html?doc=<filename>`.

The landing page's left-hand "About" box is `pages/about.md` too — it's
rendered the same way as `pages.html?doc=about.md`, just embedded directly
into `index.html` instead of read from a query param. Editing
`pages/about.md` updates both places at once.

## Manual smoke checklist (after any change)

- [ ] Landing page: two-column layout below the hero (About box on the
      left, stacked News/Events boxes on the right); About box renders
      `pages/about.md`; narrow window (<700px) collapses to one column.
- [ ] Members page, grid view: cards sorted by lastname; portraits or
      initials-avatar fallback render correctly; no email address shown.
- [ ] Members page, list view: toggle works both ways; narrow window
      (<700px) defaults to list view; filter box narrows both views by
      name or affiliation.
- [ ] Projects page, graph view: nodes render, drag/pan/zoom work, filter
      dims non-matches, clicking a project opens the modal, clicking a
      scholar highlights their subgraph.
- [ ] Projects page, list view: toggle works both ways; narrow window
      (<700px) defaults to list view.
- [ ] Events page: sorted newest-first, "Upcoming" badge on future dates;
      landing page's Events box shows only the 3 most recent entries plus a
      "See all events" link.
- [ ] News page: sorted newest-first; landing page's News box shows only
      the 3 most recent entries plus a "See all news" link.
- [ ] Pages viewer: a `.md` doc renders as formatted HTML (not raw
      Markdown source); an `.html` doc renders directly; a missing/invalid
      `doc` param shows an error state instead of a blank page; reaching it
      from News or Events shows a "← All News"/"← All Events" back-link.
- [ ] `npm run validate` and `npm test` both pass.

## Local tooling credentials

Copy `.env.example` to `.env` and fill in `GITLAB_TOKEN` for local GitLab
API tooling. Never commit `.env` or paste the token into chat/logs.
