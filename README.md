# Research Network Website Template

A static, no-backend website template for research networks, working
groups, and similar academic collaborations — members, projects, events,
news, and publications pages, ready to fill in with your own content.

**Demo:** <https://cboulanger.github.io/research-network-website-template>
(built from this repo's generic placeholder content).

A Node build step (`npm run build`) turns JSON/Markdown content — normally
stored outside the repo (see "Storing content outside the repo" below), with
the `content/` directory holding only generic demo data — into fully static,
crawlable HTML in `public/`, the directory GitHub Pages (or GitLab Pages, if
you host there instead) publishes. Node is a build-time tool only; the
deployed site itself needs no Node, no backend, no secrets.

CI is defined both for GitHub Actions (`.github/workflows/ci.yml`) and GitLab
CI (`.gitlab-ci.yml`), doing the same thing: validate content and run tests on
every push/pull request, then build and publish `public/` to Pages on pushes
to the default branch. Use whichever matches where you host the repo; the
other one is simply inert on that forge.

**Reusing this template for a real group:** the `content/` tree committed in
this repo is generic placeholder/demo data only — real content is never
hand-edited in the repo or added in a pull/merge request. Instead, point
`CONTENT_PATH` (see `.env.example` and "Storing content outside the repo"
below) at an external store holding your real data in the same shape (see
`schema/`). This keeps content editing separate from code changes: anyone
who can reach the content store can add a member or news item without
touching git at all.

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

## Content shape

Real content lives outside the repo (see "Storing content outside the repo"
below) as a `data/`/`pages/`/`images/` tree in the same shape as the generic
demo content committed under `content/`. Each data file must validate
against its schema in `schema/` (`npm run validate` checks this; CI enforces
it on every push).

- `site.json`: site-wide text and branding (nav banner label, landing page
  title/subtitle, optional `favicon`/`logo` filenames pointing at the
  `images/` directory).
- `members.json`: `id` (`{lastname-slug}-{firstname-slug}`, e.g.
  `adler-ada`; a numeric suffix like `-2` resolves a same-name collision)
  is the unique id, referenced by `projects[].participants` and used as
  the anchor/link id on the Members and Projects pages. `email` is a
  required contact field, never rendered or shipped to the browser, and
  is not used for linking.
- `projects.json`: `participants` is a list of member `id`s.
- `events.json`: sorted newest-first automatically at build time — no need
  to keep the file itself in date order.
- `news.json`: same shape as `events.json`. `url` can be an absolute
  `http(s)://` link (opens in a new tab) or `pages.html?doc=<filename>`
  (rewritten at build time to the real static page URL, opens in the same
  tab).

- `publications.json` (optional): turns on the Publications page, nav
  link, and the landing page's "Latest Publications" box. Without it, none
  of these appear.

      {
        "zoteroGroup": "https://www.zotero.org/groups/2211429",
        "style": "chicago-author-date",
        "locale": "en-US"
      }

  At build time, every top-level item of that Zotero group is fetched,
  already formatted in the given CSL `style` (any id from
  <https://www.zotero.org/styles>, e.g. `apa`). An item is listed if one
  of its authors or editors matches a member: last names must be equal,
  ignoring case, diacritics, and "oe"-style transliterations (Kovač = Kovac,
  Sundström = Sundstroem); first names must share their first word, where
  an initial counts (A. = Ada). Set `creatorTypes` (default
  `["author", "editor"]`) to count other Zotero roles. URLs and DOIs in the
  citations are linked. The group library must be publicly readable
  (group settings → "Library Reading: Anyone on the internet"), or set
  `ZOTERO_API_KEY` (see `.env.example`). If Zotero can't be reached or
  doesn't answer within 30 s (`ZOTERO_TIMEOUT_MS`), the build fails before
  writing any output, leaving the previous build (and the deployed site)
  in place rather than publishing an empty list.
  `docs/demo/zotero-demo-publications.bib` holds fake entries matching the
  demo members, for importing into a test group.

A longer write-up (e.g. to link from a news item) is a `.md` or `.html` file
in the `pages/` directory — the build turns it into its own static page
(`pages/about.md` → `public/pages/about.html`), no code changes required.
Link to it from `news.json`/`events.json` with `pages.html?doc=<filename>`.

The landing page's "About" box is `pages/about.md` too — rendered into
`index.html` directly at build time. Editing it updates both places, which
is also why a document under `pages/` shouldn't contain a page-relative link
like `events.html` to another top-level page: the same file is rendered at
two different depths (site root, and one level down at
`public/pages/<name>.html`), so a page-relative link only resolves
correctly from one of them. Either avoid the link (the nav bar already
links to every top-level page) or use an absolute `https://` URL.

## Storing content outside the repo

`CONTENT_PATH` (set in `.env`, or as a build variable in CI) tells the build
where to read the `data/`/`pages/`/`images/` tree from instead of the
committed `content/` demo. It accepts either:

- a local directory path — mainly useful for testing without network access
  (e.g. `.local/content`, which is gitignored);
- **(preferred) a remote `http(s)://` URL**, fetched at build time with
  optional Basic Auth (`CONTENT_USERNAME`/`CONTENT_PASSWORD`). This is the
  right choice for a real deployment: content editors work directly against
  the content store (no git, no pull requests, no code access needed), and
  both your local builds and CI fetch the same live data.

### Setting up a WebDAV content store

Any WebDAV server works (most cloud file-sync services, including
Nextcloud, expose one); Nextcloud is used here as the example:

1. In Nextcloud, create a folder for the site's content and, inside it,
   three subfolders: `data/`, `pages/`, `images/`.
2. Add the required files to `data/`: `site.json`, `members.json`,
   `projects.json`, `events.json`, `news.json` (and, optionally,
   `publications.json`) — each validated against its schema in `schema/`.
   Add any linked write-ups to `pages/` and any portraits/logos/favicons to
   `images/`, as described above.
3. Get the folder's WebDAV URL: in the Nextcloud web UI, open the folder,
   click the folder's "Details" panel, and copy its WebDAV address (or
   construct it as `https://<your-nextcloud-host>/remote.php/dav/files/<username>/<path-to-folder>`).
4. If the folder isn't publicly shared, create an app password (Nextcloud
   Settings → Security → "Create new app password") rather than using your
   main account password — this is what goes in `CONTENT_USERNAME`/
   `CONTENT_PASSWORD`.
5. Set `CONTENT_PATH` to that WebDAV URL:

       cp .env.example .env
       # edit .env: CONTENT_PATH=<the WebDAV URL>, CONTENT_USERNAME=..., CONTENT_PASSWORD=...
       npm run build

   In CI, set the same three as repository variables/secrets (see "Using
   this as a template on GitHub" below) rather than committing `.env`.

On a fetch failure or timeout (`CONTENT_TIMEOUT_MS`, default 30s), the build
fails before writing any output, so the previous build (and the currently
deployed site) is left in place rather than publishing a broken or empty
site.

## Local tooling credentials

Copy `.env.example` to `.env` and fill in `GITHUB_TOKEN` and/or
`GITLAB_TOKEN`/`GITLAB_HOST` for local forge API tooling (`npm run deploy`
triggers a rebuild on every forge whose token is set — both at once if both
are set), and/or
`CONTENT_PATH`/`CONTENT_USERNAME`/`CONTENT_PASSWORD` to build from real or
remote content. Never commit `.env` or paste any of its values into
chat/logs.

## Using this as a template on GitHub

Click "Use this template" on the GitHub repo page (or `gh repo create
<name> --template <owner>/<repo>`) to get your own copy with a clean git
history. Then, in the new repo's Settings:

- **Pages**: set "Build and deployment" source to "GitHub Actions" (the
  included workflow handles the rest on every push to the default branch).
- **Actions → General**: if you use `CONTENT_PATH`/`CONTENT_USERNAME`/
  `CONTENT_PASSWORD` for real (non-generic) content, add them as repository
  variables/secrets — `CONTENT_PATH` as a variable, the other two as secrets.
