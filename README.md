# RCSL WG Histories of the Sociology of Law

Static, no-backend website for the RCSL Working Group "Histories of the
Sociology of Law." See `docs/superpowers/specs/2026-09-22-rcsl-wg-histories-site-design.md`
for the full design.

**Current state: proof of concept.** `data/members.json`, `data/projects.json`,
and `data/events.json` contain fake/placeholder data, not the working
group's real roster, projects, or meeting history. Replace them with real
data (same shape, see `data/schema/`) before launch. The landing page copy
in `index.html` is also placeholder text pending the real content.

## Local preview

No build step. From the repo root:

    python -m http.server 8000

Then open `http://localhost:8000/index.html`.

## Running checks

    npm run validate   # JSON Schema validation of the three data files
    npm test            # unit tests for pure logic (node --test)

Both require Node.js locally (only for tooling — the deployed site itself
needs no Node, no backend, no secrets).

## Editing data

Add or edit a member, project, or event by hand-editing the matching JSON
file in `data/` and opening a merge request. Each file must validate
against its schema in `data/schema/` (`npm run validate` checks this
locally; CI enforces it on every push).

- `members.json`: `email` is the unique id, referenced by
  `projects[].participants`.
- `projects.json`: `participants` is a list of member emails.
- `events.json`: sorted newest-first automatically at render time — no
  need to keep the file itself in date order.

## Manual smoke checklist (after any change)

- [ ] Landing page: all sections render, nav links work.
- [ ] Members page: cards sorted by lastname; portraits or initials-avatar
      fallback render correctly.
- [ ] Projects page, graph view: nodes render, drag/pan/zoom work, filter
      dims non-matches, clicking a project opens the modal, clicking a
      scholar highlights their subgraph.
- [ ] Projects page, list view: toggle works both ways; narrow window
      (<700px) defaults to list view.
- [ ] Events page: sorted newest-first, "Upcoming" badge on future dates.
- [ ] `npm run validate` and `npm test` both pass.

## Local tooling credentials

Copy `.env.example` to `.env` and fill in `GITLAB_TOKEN` for local GitLab
API tooling. Never commit `.env` or paste the token into chat/logs.
