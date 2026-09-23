# Member → Projects Link — Design

**Date:** 2026-09-23
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-09-23-static-build-pipeline-design.md`
(members and projects pages are rendered at build time; the projects graph
is hydrated client-side from `assets/projects-graph-data.json`).

## Goal

Each member on the Members page (grid card and list item) gets a "Projects"
link. Following it opens the Projects page focused on that member — the same
effect as clicking the member's scholar node in the graph — in both graph
view and list view.

This is the reverse of the existing Projects-list → `members.html#<slug>`
link.

## 1. The link on the Members page

- `renderMemberCard(member, participantSlugs)` and
  `renderMemberListItem(member, participantSlugs)` take an optional `Set` of
  member slugs (via `memberSlug()`) that participate in at least one project.
  `renderMembers` / `renderMemberList` accept and forward the same set.
- If the member's slug is in the set, the card/list item includes
  `<a class="member-projects-link" href="projects.html#member=<slug>">Projects</a>`
  (slug HTML-escaped). If the set is omitted or the member is not in it, no
  link is rendered — members without projects never get a dead-end link.
- `buildMembersPage` in `scripts/build.mjs` computes the set: for every
  project, map each `participants` email to its member (by email) and add
  `memberSlug(member)`. Unknown emails are ignored (the projects build
  already warns about them).

## 2. Reading the focus request on the Projects page

- New pure export `parseMemberHash(hash)` in `assets/js/projects-graph.js`:
  returns the slug for `#member=<slug>` (URI-decoded, non-empty), otherwise
  `null`. Accepts the hash with or without the leading `#`.
- After graph data loads, the page reads `location.hash`. If a slug is
  returned and a node with id `scholar:<slug>` exists, focus that member
  (sections 3–5). Otherwise the page loads normally (unknown slug is a
  silent no-op).
- The page listens for `hashchange` and re-applies: a valid member hash
  focuses that member; anything else clears the focus. This keeps
  back/forward and manual URL edits working.

## 3. Focus banner (shared by both views)

- A banner element `#member-focus-banner` (hidden by default) is rendered
  in `projects.html` between the list controls and the views:
  "Showing projects of **Firstname Lastname** · [Show all]".
  The "Show all" control is a `<button type="button">`.
- Focusing a member — via the hash or by manually clicking a scholar node —
  applies the focus to **both** views (graph highlight + list filter) and
  shows the banner. Switching views therefore keeps the focus. A manual
  click also writes `#member=<slug>` via `history.replaceState`, so the URL
  always reflects the current focus (and a reload keeps it). Focusing also
  empties the filter box (see section 6).
- "Show all" clears the focus in both views, hides the banner and tooltip,
  and removes the hash with `history.replaceState` (no new history entry).
- This also closes an existing gap: previously nothing but the filter box
  cleared a manual graph highlight.

## 4. Graph view

- Reuses the existing `highlight(centerNode, links, nodeSel, linkSel)`
  unchanged. Clearing removes `node-dimmed` from all nodes and links.
- The tooltip (`showScholarLabel`) needs a position when the focus comes
  from the hash rather than a click. It is positioned from the scholar
  node's `getBoundingClientRect()` (centre-top, matching the tooltip's
  `translate(-50%, -120%)` placement above a click point), computed once the force
  simulation has settled (`simulation.on('end')`), or immediately when
  `reducedMotion` is on (layout is pre-computed). If graph view is hidden at
  that time, the tooltip is skipped — the banner already names the member.
- No pan/zoom to the node (YAGNI): the canvas is centred and small enough
  that the node is in view.

## 5. List view

- `renderListView` adds `data-participants="<slug1> <slug2> …"` (escaped,
  space-separated member slugs) to each project `<li>`, and adds
  `data-slug="<slug>"` to each participant `<a>`.
- New exports:
  - `participantsInclude(participantsAttr, slug)`: pure predicate — true if
    `slug` is an exact whitespace-separated token of `participantsAttr`.
  - `focusListOnMember(container, slug)`: sets `hidden` on every project
    `<li>` for which `participantsInclude(li.dataset.participants, slug)`
    is false, and adds class `participant-focused` to that member's
    participant links (`a[data-slug]`) in the remaining items.
  - `clearListFocus(container)`: un-hides all items and removes
    `participant-focused`.
- CSS: `.participant-focused { font-weight: bold; }`.

## 6. Interaction with the filter box

Typing in `#project-filter` clears the member focus (banner, graph
highlight, list filter, hash). Only one kind of narrowing is active at a
time.

## 7. Error handling

- Malformed/unknown hash → no-op, normal page.
- If graph data fails to load, the static list view remains as today; the
  member focus is not applied (it is wired in the same success path). This
  is acceptable: the list is still fully usable.
- Members page without JavaScript: the link is a plain anchor and still
  navigates; the projects page simply shows everything.

## 8. Testing

- `tests/members.test.js`: link rendered only when the member's slug is in
  the participant set; absent when the set is omitted; href uses the
  escaped slug; both card and list item.
- `tests/projects-graph.test.js`:
  - `parseMemberHash`: `#member=jane-doe`, `member=jane-doe`, empty,
    `#member=`, `#other=x`, URI-encoded slug.
  - `renderListView` output contains `data-participants` and `data-slug`.
  - `participantsInclude`: match, no match, exact-token matching (slug
    `ann` does not match `anna`), empty/undefined attribute.
  - `focusListOnMember` / `clearListFocus` are thin DOM wrappers (the test
    suite runs under plain `node --test` without a DOM library) and are
    verified manually.
- `tests/build.test.js`: built `members.html` contains
  `projects.html#member=<slug>` for a participant and not for a
  non-participant; built `projects.html` contains `#member-focus-banner`.
- Manual: graph tooltip placement after settle, reduced-motion path,
  back/forward, "Show all", filter clears focus, mobile list view.

## Out of scope

- Pan/zoom to the focused node.
- Combining member focus with the text filter.
- Focusing on a project (rather than a member) via the URL.
