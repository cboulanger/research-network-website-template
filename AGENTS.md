# Agent notes: running the README setup non-interactively

This file is for coding agents (not end users) that need to carry out or
verify the README's Part 1 ("Setting up and running your site") on someone's behalf — e.g. setting up a
new site, or re-testing that the guide still works after a change.  An agent
should do the equivalent through `gh`/the API instead of trying to drive a
browser. The mapping below is the part that isn't obvious from the guide.

## Step-by-step: GitHub side (README setup step 1)

```sh
# Fork. Note: GitHub refuses to fork a repo into the account that owns it —
# if you're testing as the template's own owner, fork into an org you
# belong to instead (gh repo fork <owner>/<repo> --org <org>), or, if no org
# is appropriate, create a new repo and mirror-push into it:
gh repo create <you>/<new-repo> --public
git clone --bare https://github.com/<owner>/<template-repo>.git /tmp/mirror.git
git -C /tmp/mirror.git push --mirror https://github.com/<you>/<new-repo>.git

# "I understand my workflows, go ahead and enable them" — only needed on a
# real fork (forks start with Actions disabled); a plain new repo already
# has Actions enabled, so this call is a no-op there but required on a fork:
gh api -X PUT repos/<you>/<new-repo>/actions/permissions -F enabled=true -F allowed_actions=all

# Settings -> Pages -> Source: GitHub Actions
gh api -X POST repos/<you>/<new-repo>/pages -f build_type=workflow
# (if the site already has a Pages config from a previous run, POST 409s — use PUT instead)

# Actions tab -> "CI" -> Run workflow
gh workflow run CI --repo <you>/<new-repo>
gh run list --repo <you>/<new-repo> --limit 1          # get the run id
gh run watch <run-id> --repo <you>/<new-repo> --exit-status

# Resulting Pages URL (also printed by the `pages` API call above):
#   https://<you>.github.io/<new-repo>/
```

`gh api` note: boolean fields need `-F` (typed), not `-f` (always a string) —
`-f enabled=true` sends the string `"true"` and GitHub 422s.

## Step-by-step: content + secrets (README setup steps 2, 3, 5, 6)

Put the content under a **new** subfolder of the WebDAV share, not on top of
existing content — e.g. `<webdav-root>/<test-name>/{data,pages,images}` —
copied from this repo's `content/` folder.

```sh
gh variable set CONTENT_PATH --repo <you>/<new-repo> --body "<https WebDAV URL>"

# Secrets: never dump a whole .env that also holds unrelated credentials
# (GITHUB_TOKEN, GITLAB_TOKEN, ...) into `gh secret set --env-file` — it
# uploads every key in the file as a secret, including ones that should be
# a *variable* (CONTENT_PATH) or don't belong in this repo at all. Extract
# only the two keys that are actually secrets into a throwaway file first:
grep -E '^(CONTENT_USERNAME|CONTENT_PASSWORD)=' .env > /tmp/secrets.env
gh secret set --env-file /tmp/secrets.env --repo <you>/<new-repo>
rm /tmp/secrets.env
```

## Step-by-step: branding — theme and logo (README "Edit your content")

`site.json` controls the site's visual identity: `theme` (one of 5
built-in palettes) and `logo` (a filename in the content share's `images/`
folder, shown next to the title on the landing page). Don't pick a default
silently here — this is a branding decision, ask the user.

1. **Theme.** Ask which of `light`, `dark`, `slate`, `forest`, `sepia`
   (`schema/site.schema.json`'s `theme` enum) fits the organization, or
   whether they'd rather have a custom palette matching an existing brand
   color. For a custom one:
   - copy `assets/css/themes/light.css` to `assets/css/themes/<name>.css`
     and fill in its 12 `--color-*` variables — see
     `docs/superpowers/specs/2026-09-30-site-theming-design.md` for what
     each variable controls (surface vs. bg-alt, border vs.
     border-strong, on-accent, tooltip colors, overlay) and a worked
     example of deriving a full palette from one accent color;
   - add `<name>` to the `enum` in `schema/site.schema.json`'s `theme`
     property so it validates and shows up in the editor's dropdown.
2. **Logo.** Ask if they have a logo image. If yes, add it to the content
   share's `images/` folder and set `logo` to its filename. If not, leave
   `logo` unset — the landing page's hero logo is only rendered when it's
   set (see `buildIndexPage` in `scripts/build.mjs`), so the site still
   looks correct without one.

Set both the same way as any other `site.json` field: `PUT /api/data/site`
on the running editor (`npm run edit`) — not a `gh` step, this is local
tooling like the section below.

## Step-by-step: local tooling (README setup steps 4, 5, 7 and "Working with the editor"; the desktop app is Part 2 "Desktop app")

Nothing unusual here — `npm install`, `npm run validate`, `npm test`,
`npm run build`, `npm run edit`, `npm run deploy` all worked exactly as
documented against a real WebDAV share reached over HTTPS with Basic Auth.
The editor's `POST /api/data/<collection>` / `PUT /api/data/<collection>/<id>`
/ `DELETE /api/data/<collection>/<id>` calls write straight through to the
WebDAV share, confirmed by reading the record back immediately afterward.

## Gotchas actually hit during testing

- **WebDAV write-then-read lag.** If content was just placed on a WebDAV
  share that's mounted locally via a desktop sync client (e.g. the Nextcloud
  client), the very next `npm run build`/`validate` can fail with a fetch
  timeout on a file you just created — the client hasn't pushed it to the
  server yet. Retry once after a few seconds before concluding something is
  broken.

- **`npm run deploy` fails fast on an unrelated forge.** It triggers
  *every* forge whose token env var is set (`GITHUB_TOKEN` and/or
  `GITLAB_TOKEN`), and if triggering any one of them throws (e.g.
  `GITLAB_TOKEN` is set but `GITLAB_PROJECT` isn't, and there's no git
  remote to infer it from — likely if you copied a `.env` from another
  project, or the folder isn't a git clone), the whole command exits 1
  *without ever polling the one that matters*. Before running `npm run
  deploy` for a single-forge test, blank out the token for any forge you
  don't intend to use in that `.env`.

- **The deploy status poll isn't resilient to one flaky request.** A single
  transient network error (`fetch failed`) while polling a run's status is
  treated as a final failure for that target, even though the actual GitHub
  Actions run went on to succeed. If `npm run deploy` reports a failure,
  check `gh run list --repo <owner>/<repo>` (or the Actions tab) before
  trusting that report — it's the source of truth, not the CLI's exit code.

- **`CONTENT_PATH` is a Variable, not a Secret.** The workflow reads it as
  `${{ vars.CONTENT_PATH }}`; storing it as a repo secret instead leaves
  `vars.CONTENT_PATH` empty and the build silently falls back to the
  generic `content/` demo data instead of failing loudly.

- **`NTFY_TOPIC`/`NTFY_SERVER` are CI Variables** like `CONTENT_PATH` (on
  GitLab: non-masked project CI/CD variables; the topic is public in the site
  source). If unset the public-edit feature is simply not built, so a missing
  variable is silent — check `public/edit.html` exists when testing the
  feature.

- **A repo that's a real deployment (not just the template) may only have
  one forge configured.** E.g. a site that deploys via GitLab CI may have a
  `.env` with `CONTENT_USERNAME`/`CONTENT_PASSWORD`/`GITLAB_*` but no
  `GITHUB_TOKEN`/`GITHUB_REPOSITORY` at all — don't assume both are present
  just because `.env.example` lists both.

## Cleanup

If you spin up a throwaway repo/WebDAV folder to test this, delete both
afterward: `gh repo delete <owner>/<repo> --yes` (needs the `delete_repo`
token scope — `gh auth refresh -h github.com -s delete_repo` if missing,
which requires an interactive browser step) and remove the WebDAV test
subfolder.
