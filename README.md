# Research Network Website Template

A static, no-backend website template for research networks, working
groups, and similar academic collaborations — members, projects, events,
news, and publications pages, ready to fill in with your own content.

**Demo:** <https://cboulanger.github.io/research-network-website-template>
(built from this repo's generic placeholder content).

## Quick start

This guide takes you from the template to your own live website. You don't
need to be a programmer, but you should be comfortable installing software
and typing a few commands into a terminal. Allow about an hour.

**How it works:** your content (members, projects, events, news) lives as
ordinary files on a file share of your own, not in this repository. A build
step turns those files into a plain static website, which GitHub publishes
for free (GitHub Pages). To change the site you edit the content with a
local editor, then trigger a rebuild. The `content/` folder in this repo
holds generic sample data only — real content is never edited in the repo.

### 1. Create your copy and switch on GitHub Pages

1. If you don't have a GitHub account yet, create a free one at
   <https://github.com/signup>. Then sign in and click **Fork** on this
   repository's page (or run `gh repo fork <owner>/<repo>`) and create the
   fork. This gives you your own copy of the website code, which stays
   linked to the original so that you can pick up later improvements (see
   "Updating the website code" below).
2. In your fork open the **Actions** tab and click "I understand my
   workflows, go ahead and enable them" (GitHub disables them on forks by
   default). Then open **Settings → Pages** and set "Build and
   deployment → Source" to **GitHub Actions**.
3. Back in the **Actions** tab, select the "CI" workflow and click
   **Run workflow**. After a minute or two your site is live at
   `https://<your-username>.github.io/<repository-name>`. It shows the
   generic sample content — check that it looks like the demo.

### 2. Get a WebDAV share for your content

Your real content is kept on a **WebDAV** share: a shared folder that
programs can read and write over the web. If you have an ownCloud or
Nextcloud account (many universities provide one), you already have one;
otherwise ask your IT administrator for "a WebDAV folder I can read and write
to". You'll need:

- the folder's **WebDAV URL** — in Nextcloud, open the folder, click its
  "Details" panel and copy the WebDAV address (or build it as
  `https://<your-nextcloud-host>/remote.php/dav/files/<username>/<path-to-folder>`);
- a **username** and **password**. Instead of your main password, create an
  app password (Nextcloud: Settings → Security → "Create new app password"),
  which you can revoke later without changing your login.

### 3. Copy the sample content to the share

Download this repository as a ZIP (on GitHub: **Code → Download ZIP**; you'll
use the same ZIP again in step 5) and copy the contents of its `content/`
folder into your WebDAV folder, so that it contains:

    data/     site.json, members.json, projects.json, events.json, news.json
    pages/    longer write-ups (e.g. about.md)
    images/   portraits, logo, favicon

You'll replace the sample entries with real ones in step 8.

### 4. Install Node.js

Node.js (which includes `npm`) runs the build and editor tools on your
computer. Download the "LTS" version (22 or newer) from <https://nodejs.org>
and install it with the default options. Check it worked by opening a
terminal (Windows: PowerShell; macOS: Terminal) and typing `node --version`.

### 5. Unpack the project and configure it

1. Unpack the ZIP from step 3 somewhere convenient. (Cloning with git works
   too but isn't required.)
2. In the unpacked folder, copy the file `.env.example` to `.env`. (Files
   starting with a dot may be hidden; enable "show hidden files" if needed.)
3. Open `.env` in a text editor and fill in:

       CONTENT_PATH=<your WebDAV URL>
       CONTENT_USERNAME=<your username>
       CONTENT_PASSWORD=<your app password>

   `.env` contains passwords: never share it or commit it to git.
4. So that you can trigger a rebuild of the site from your computer
   (step 10), create a GitHub personal access token (GitHub → Settings →
   Developer settings → Personal access tokens; scope "repo", or
   "Actions: write" for a fine-grained token) and add it to `.env`, together
   with the name of your GitHub repository:

       GITHUB_TOKEN=<your token>
       GITHUB_REPOSITORY=<your-username>/<repository-name>

### 6. Give GitHub access to your content

GitHub builds the public site, so it needs the same three settings. In your
repository open **Settings → Secrets and variables → Actions** and add:

| Name               | Where         | Value             |
|--------------------|---------------|-------------------|
| `CONTENT_PATH`     | *Variables* tab | your WebDAV URL |
| `CONTENT_USERNAME` | *Secrets* tab   | your username   |
| `CONTENT_PASSWORD` | *Secrets* tab   | your app password |

### 7. Install and start the editor

In a terminal, change into the unpacked folder and run:

    npm install
    npm run edit

`npm install` downloads the required tools (needed once). `npm run edit`
starts the local editor; open <http://127.0.0.1:4848> in your browser.

### 8. Edit your content

Use the editor to replace the sample members, projects, events and news with
your own. Each change is saved straight to your WebDAV share. Press Ctrl+C in
the terminal to stop the editor.

### 9. Preview your site (optional)

    npm run build

This builds the site into the `public/` folder from your current content and
reports any errors. Then open `public/index.html` in your browser to look at
it. (Opening the file directly shows most of the site; the projects graph
needs a local web server, see "Local preview" below.) You can skip this step
if you just want to publish.

### 10. Publish

    npm run deploy

This asks GitHub to rebuild the public site, then waits and reports whether
the build succeeded. GitHub fetches your content from the WebDAV share
itself, so nothing needs to be uploaded. Instead of the command you can click
**Deploy site** in the editor, which does the same. Repeat steps 7–10
whenever you want to update the site.

### Updating the website code

Improvements to the template are published in the original repository
(<https://github.com/cboulanger/research-network-website-template>). Your
content is stored separately, so updating the code never touches it. There
are two copies of the code to update:

**1. The website code on GitHub** (this is what builds your public site).
Synchronize your fork with the original:

1. Open your fork on GitHub.
2. Above the file list, click **Sync fork**. If GitHub says the fork is
   "up to date", there is nothing to do.
3. Click **Update branch**. (If GitHub reports conflicts, you have changed
   files in your fork; either discard those changes or ask someone with git
   experience for help.)

The workflow runs by itself after the sync; you can also click **Deploy
site** in the editor to rebuild the site right away. From the command line
you can do the same with `gh repo sync <your-username>/<repository-name>`.

**2. The local copy you use for the editor.** This only affects
`npm run edit` and the local tools, not the public site. Download the ZIP of
*your* (freshly synced) fork, unpack it, copy your `.env` file from the old
folder into the new one, and run `npm install`. The old folder can then be
deleted.

The rest of this document is reference material.

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

Both need Node.js locally (tooling only; the deployed site needs none).

## Local data editor

    npm run edit

Starts a local-only admin UI at `http://127.0.0.1:4848` (override the port
with `EDIT_PORT`) for editing `members.json`, `projects.json`,
`events.json`, and `news.json` — schema-driven forms with create/edit/delete,
plus a search-and-add picker for a project's participants. It reads and
writes the same `CONTENT_PATH` the build uses, saving each change
immediately, so point it at a copy of your content to try it out. It has no
authentication of its own — run it on your own machine only, never expose it
beyond `127.0.0.1`.

### Build & preview button

The sidebar's **Build & preview locally** button (`POST /api/build`) runs the
same build as `npm run build`/CI against your current `CONTENT_PATH`, then
opens the result in a new tab once the build is done (if the browser blocks
the popup, click the "Open preview" link that appears next to the status),
served from `/preview/` by the editor itself
(so the projects graph and other same-origin fetches work, unlike opening
`public/index.html` as a `file://` URL). Re-click it after further edits to
rebuild and reopen.

### Deploy button and site link

The sidebar's **Deploy site** button (`POST /api/deploy`) first validates every
collection the editor manages against its schema — the same check as
`npm run validate` — and refuses to trigger a rebuild if any of it fails,
listing the errors instead, so CI is never started on content it would reject.
It then asks each forge whose token is set (`GITHUB_TOKEN`, `GITLAB_TOKEN`) to
rebuild, and — like `npm run deploy` — polls that forge's workflow/pipeline
until it finishes or `DEPLOY_POLL_TIMEOUT_MS` passes (default 5 minutes,
checking every `DEPLOY_POLL_INTERVAL_MS`, default 10s), so the status box
reports a real success or failure instead of just "rebuild started"; see
`.env.example` for the settings.

Below the button, an **Open the site** link (`GET /api/site`) points at the
published site. The address is resolved in this order:

1. `SITE_URL`, if set. Use it to override the lookup, e.g. when the site is
   reverse-proxied under a different domain than the forge's own Pages address.
2. GitHub: the `html_url` from the repository's Pages settings
   (`GET /repos/{owner}/{name}/pages`); if the token cannot read them, the
   default `https://{owner}.github.io/{name}/`.
3. GitLab: the `url` from the project's Pages API
   (`GET /projects/:id/pages`, available on recent GitLab versions).

If none of these yields an address (no token, an older GitLab, an API error)
the link is simply not shown; a failed lookup never affects deploying.

### Editor hints in the schemas

The editor takes its presentation hints from an `x-editor` keyword in
`schema/*.schema.json` (ignored by validation; registered with Ajv in
`edit-server.mjs` and `scripts/lib/ajv-editor-keyword.cjs`):

- On a property: `"widget": "date"` (date picker, empty value defaults to
  today, stored as `YYYY-MM-DD`), `"widget": "textarea"` with `"rows": N`,
  `"readOnly": true` (ids; assigned by the server on create), `"placeholder"`.
- On the collection: `"sort": { "by": "date" | ["lastname", "firstname"],
  "order": "asc" | "desc" }` and `"columns": ["date", "title"]` (property names shown
  as aligned columns in the record list). Sorting is display-only; the JSON files keep their order.

## Public edits via ntfy (optional)

With `NTFY_TOPIC` set, visitors can propose changes without any backend. Open
any list page (members, projects, events, news) with `?edit` appended to the
URL (edit mode is remembered for the browser session): each row gets an
**Edit** button and the list an **Add** button. The form (`edit.html`, with
the public data under `assets/data/*.json`) posts a JSON message to
`{NTFY_SERVER}/{NTFY_TOPIC}`. An add carries no id; an update carries the
record id (events and news have no id and are addressed by array index, with
the original record sent as `base`). Nothing is published until a reviewer
accepts the submission in the editor.

- **Setup.** Set `NTFY_TOPIC` (and optionally `NTFY_SERVER`, default
  `https://ntfy.sh`) in `.env` for local builds, and as **variables** (not
  secrets, the topic is visible in the site source) for CI: repository
  Variables on GitHub (`ci.yml` already reads them), project CI/CD variables
  on GitLab (leave "Mask variable" off; `.gitlab-ci.yml` needs no change).
  Pick a long random topic name.
- **Private fields.** `"x-editor": { "private": true }` on a schema property
  keeps it out of the published data, the public form and the messages.
  `email` is private, so reviewers fill it in for new members. (As a
  consequence the member avatar colour is now derived from the member id,
  not the email.)
- **Reviewing.** When a topic is configured, the editor shows an **Inbox (n)**
  button. Entries show a field-by-field diff against the current record
  (updates whose record no longer matches are marked stale and open as an
  add). **Review & accept** opens the normal form prefilled; saving goes
  through the usual save path and then removes the entry. **Reject**
  discards it. Opening another record or the New form while reviewing
  abandons that review (the entry stays in the inbox); if the record was
  saved but removing the entry failed, pressing Save again only retries the
  removal. Pending entries are kept in `.local/inbox.json` (written
  atomically; a corrupt file is moved aside to
  `inbox.json.corrupt-<timestamp>` and the inbox starts empty).
- **Limits and trust.** ntfy.sh keeps messages about 12 h and allows 4 KB per
  message (the form checks this before sending); self-host and set
  `NTFY_SERVER` for more. Anyone who knows the topic can read and post to it,
  so every message is validated against the schema and reviewed by hand;
  submissions that fail validation are silently dropped (the inbox reports
  how many). Pending entries are not capped, so anyone can flood the topic:
  review or reject promptly, or use a self-hosted ntfy with access control.
  Note that the data behind the edit forms is published at
  `assets/data/*.json` (private fields stripped).
- **Disabling.** Leave `NTFY_TOPIC` blank; none of this is built.

## Content shape

Real content lives outside the repo (see "Storing content outside the repo"
below) as a `data/`/`pages/`/`images/` tree in the same shape as the generic
demo content committed under `content/`. Each data file must validate
against its schema in `schema/` (`npm run validate` checks this; CI enforces
it on every push).

- `site.json`: site-wide text and branding (nav banner label, landing page
  title/subtitle, optional `favicon`/`logo` filenames pointing at the
  `images/` directory), plus an optional `theme` (one of `light` (default),
  `dark`, `slate`, `forest`, `sepia`) selecting which stylesheet under
  `assets/css/themes/` the build uses.
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

On a fetch failure or timeout (`CONTENT_TIMEOUT_MS`, default 30s), the build
fails before writing any output, so the previous build (and the currently
deployed site) is left in place rather than publishing a broken or empty
site.

See the Quick start (steps 2, 3, 5 and 6) for setting up a WebDAV store with
Nextcloud and wiring it into `.env` and the GitHub repository.

## Hosting on GitLab

CI is defined for both GitHub Actions (`.github/workflows/ci.yml`) and GitLab
CI (`.gitlab-ci.yml`); both validate content and run tests on every
push/pull request, then build and publish `public/` to Pages on pushes to the
default branch. Use whichever matches where you host the repo; the other is
inert. On GitLab, set `CONTENT_PATH`/`CONTENT_USERNAME`/`CONTENT_PASSWORD` as
masked CI/CD variables, and put `GITLAB_TOKEN`, `GITLAB_HOST` (and, without
git, `GITLAB_PROJECT=group/name`) in `.env` for
`npm run deploy`, which triggers a rebuild on every forge whose token is set.
Never commit `.env` or paste any of its values into chat/logs.

## Development

This section is about developing the template itself, not the sites built
from it. The template is developed on GitHub
(<https://github.com/cboulanger/research-network-website-template>); GitLab
is only used as a hosting/deployment target for derived sites (see
[Hosting on GitLab](#hosting-on-gitlab)) and is not part of the template's
own release process.

**Conventional commits.** Commit messages on this repository follow
[Conventional Commits](https://www.conventionalcommits.org/): a `feat:`
commit introduces a new feature, `fix:` a bug fix, and a `BREAKING CHANGE:`
footer (or `!` after the type) marks a breaking change. Other prefixes such
as `chore:`, `docs:`, `refactor:`, and `test:` don't trigger a release.

**Semantic release.** The `release` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs
[semantic-release](https://semantic-release.gitbook.io/) after every push to
`master` that passes validation. It inspects the commit messages since the
last release to determine the next version, tags the commit, and publishes a
GitHub Release with generated notes — no manual version bumps or changelog
edits. Configuration lives in [`.releaserc.json`](.releaserc.json).

**Branch protection.** `master` is a protected branch: it requires the
`validate` status check to pass and cannot be pushed to directly, including
by admins. This means all changes — including by maintainers — go through a
feature branch and a pull request. Merge only once CI is green; the release
job then runs automatically on `master`.
