# Lightweight Site Theming — Design

**Date:** 2026-09-30
**Status:** Approved, pending implementation

## Goal

Every site cloned from this template currently looks identical: one
hand-authored stylesheet, `assets/css/style.css`, with no way to change the
visual identity short of editing CSS directly. Add a small, build-time
theming system: `content/data/site.json` gets a `theme` field, selectable
from a dropdown in the editor, and the build picks the matching stylesheet.
Ship 5 themes: `light` (today's palette, stays the default), `dark`, and
three more standard palettes — `slate`, `forest`, `sepia`.

No client-side theme switching, no runtime JS, no FOUC risk: the theme is
baked into a single `public/assets/css/style.css` at build time, exactly as
today. Changing a site's theme requires a rebuild, same as every other
`site.json` field already does.

## 1. Splitting the stylesheet

Today `assets/css/style.css` (320 lines) mixes structural CSS with a mostly
unused variable layer: only 5 of the colors used in the file are CSS custom
properties (`--color-bg`, `--color-bg-alt`, `--color-text`, `--color-muted`,
`--color-accent`); the rest — borders, form-control backgrounds, the modal
overlay, the graph tooltip — are literals (`#eee`, `#ccc`, `#fff`,
`rgba(0,0,0,0.5)`, `#1a1a1a`). A dark theme built on top of that file as-is
would have invisible borders and light-colored cards floating on a dark
background.

Split it into:

- **`assets/css/base.css`** — all structural/layout rules, migrated
  verbatim from the current file except every color literal is replaced by
  a `var(--color-*)` reference. Contains no `:root` block and no color
  literals.
- **`assets/css/themes/light.css`**, **`dark.css`**, **`slate.css`**,
  **`forest.css`**, **`sepia.css`** — each ~15-20 lines, containing only a
  `:root { --color-*: ...; }` block with the palette values below. No
  selectors beyond `:root`.

The existing `assets/css/style.css` is deleted; its content is fully
absorbed into `base.css` (structure) and `themes/light.css` (the palette
values it already had).

### New CSS variable set

| Variable | Replaces (today) | Used for |
|---|---|---|
| `--color-bg` | `--color-bg` (existing) | page background |
| `--color-bg-alt` | `--color-bg-alt` (existing) | hero background, `.member-focus-banner` (was literal `#f5f5f5`, now reuses this — same "subtle panel" role, keeps the variable set small) |
| `--color-surface` | literal `#fff` | card/form-control backgrounds: `.filter-input`, `.sort-select`, `.view-toggle-btn`, `.modal-content` |
| `--color-text` | `--color-text` (existing) | body text |
| `--color-muted` | `--color-muted` (existing) | secondary text (dates, affiliations, footer) |
| `--color-accent` | `--color-accent` (existing) | links, active nav, buttons |
| `--color-on-accent` | literal `#fff` | text/icons placed on an accent-colored background (skip-link, `.badge.upcoming`, `.project-box text`) |
| `--color-border` | literal `#eee` | dividers: nav bottom border, card borders, list-item separators |
| `--color-border-strong` | literal `#ccc` | form-control borders: `.filter-input`, `.sort-select` |
| `--color-overlay` | literal `rgba(0,0,0,0.5)` | `.modal` backdrop |
| `--color-tooltip-bg` | literal `#1a1a1a` | `.scholar-tooltip` background |
| `--color-tooltip-text` | literal `#fff` | `.scholar-tooltip` text/links |
| `--font-sans` | `--font-sans` (existing) | unchanged |
| `--max-width` | `--max-width` (existing) | unchanged |

## 2. Theme palettes

First pass — visually reviewable after implementation and easy to adjust
without touching any other file, since each is an isolated `:root` block.

```css
/* light — today's palette, unchanged */
--color-bg: #ffffff;
--color-bg-alt: #fafafa;
--color-surface: #ffffff;
--color-text: #1a1a1a;
--color-muted: #666666;
--color-accent: #2c5282;
--color-on-accent: #ffffff;
--color-border: #eeeeee;
--color-border-strong: #cccccc;
--color-overlay: rgba(0, 0, 0, 0.5);
--color-tooltip-bg: #1a1a1a;
--color-tooltip-text: #ffffff;

/* dark */
--color-bg: #16181d;
--color-bg-alt: #1e2128;
--color-surface: #1e2128;
--color-text: #e8e8e8;
--color-muted: #9aa0a8;
--color-accent: #6ea8fe;
--color-on-accent: #0b1220;
--color-border: #2c2f36;
--color-border-strong: #3a3e46;
--color-overlay: rgba(0, 0, 0, 0.65);
--color-tooltip-bg: #2c2f36;
--color-tooltip-text: #f0f0f0;

/* slate — cool blue-gray, professional */
--color-bg: #ffffff;
--color-bg-alt: #f3f5f7;
--color-surface: #ffffff;
--color-text: #1c2733;
--color-muted: #5c6b7a;
--color-accent: #3a6ea5;
--color-on-accent: #ffffff;
--color-border: #dde3e9;
--color-border-strong: #b9c4cd;
--color-overlay: rgba(15, 23, 32, 0.5);
--color-tooltip-bg: #1c2733;
--color-tooltip-text: #ffffff;

/* forest — muted green, academic */
--color-bg: #fbfbf8;
--color-bg-alt: #f1f4ee;
--color-surface: #ffffff;
--color-text: #23291f;
--color-muted: #647060;
--color-accent: #3f6b3f;
--color-on-accent: #ffffff;
--color-border: #e0e6d9;
--color-border-strong: #b9c4ac;
--color-overlay: rgba(20, 26, 16, 0.5);
--color-tooltip-bg: #23291f;
--color-tooltip-text: #f3f6ee;

/* sepia — warm cream/brown, editorial */
--color-bg: #fbf6ee;
--color-bg-alt: #f3ead9;
--color-surface: #fffdf8;
--color-text: #3a2f22;
--color-muted: #7a6a55;
--color-accent: #9c5b2e;
--color-on-accent: #ffffff;
--color-border: #e6d9c2;
--color-border-strong: #cbb692;
--color-overlay: rgba(40, 28, 14, 0.5);
--color-tooltip-bg: #3a2f22;
--color-tooltip-text: #fbf6ee;
```

## 3. Schema

`schema/site.schema.json` gets a new optional property:

```json
"theme": {
  "type": "string",
  "enum": ["light", "dark", "slate", "forest", "sepia"],
  "default": "light",
  "description": "Visual theme used for the built site."
}
```

Not added to `required` — existing `site.json` files without a `theme`
field remain valid, and the build treats a missing value as `"light"`.

## 4. Editor: generic enum → dropdown

`scripts/editor/app.js`'s `buildField()` currently only special-cases
`propSchema.type === 'array'` (string lists) and `hints.widget` (`textarea`,
`date`); everything else falls through to a plain text `<input>`. Add one
more case, checked generically — not specific to `theme` — so any future
enum field in any schema gets a dropdown for free:

```js
if (Array.isArray(propSchema.enum)) {
  const select = document.createElement('select');
  select.id = `field-${key}`;
  select.name = key;
  for (const option of propSchema.enum) {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    if ((value ?? propSchema.default ?? propSchema.enum[0]) === option) opt.selected = true;
    select.appendChild(opt);
  }
  if (required && !readOnly) select.required = true;
  wrapper.appendChild(select);
  return wrapper;
}
```

placed in `buildField()` before the existing text/textarea branch.
`collectFormData()` needs no change: it already reads `form.querySelector('#field-'+key).value`
generically, which works identically for `<select>` and `<input>`.

## 5. Build

`scripts/build.mjs` currently does a raw directory copy:

```js
await cp('assets/css', path.join(PUBLIC_DIR, 'assets', 'css'), { recursive: true });
```

Replace with theme resolution + concatenation:

```js
const KNOWN_THEMES = ['light', 'dark', 'slate', 'forest', 'sepia'];

async function writeThemedCSS(site) {
  let theme = site.theme || 'light';
  if (!KNOWN_THEMES.includes(theme)) {
    console.warn(`Unknown theme "${theme}", falling back to "light"`);
    theme = 'light';
  }
  const [themeCSS, baseCSS] = await Promise.all([
    readFile(path.join('assets', 'css', 'themes', `${theme}.css`), 'utf8'),
    readFile(path.join('assets', 'css', 'base.css'), 'utf8'),
  ]);
  await mkdir(path.join(PUBLIC_DIR, 'assets', 'css'), { recursive: true });
  await writeFile(path.join(PUBLIC_DIR, 'assets', 'css', 'style.css'), `${themeCSS}\n${baseCSS}`);
}
```

called from `main()` in place of the old `cp(...)` line, as
`await writeThemedCSS(content.site);`. Output path is unchanged
(`public/assets/css/style.css`), so `scripts/lib/page-template.mjs`'s
`<link rel="stylesheet" href="${pathPrefix}assets/css/style.css">` needs no
change.

The fallback warns rather than throwing because `site.json` can in
principle be hand-edited outside the schema-enforced editor; `npm run
validate` (ajv against the schema) already rejects an invalid `theme` value
before a build would run in the normal workflow, so this is defense in
depth, not the primary guard.

## 6. Testing

- `tests/build.test.js`: existing assertion that `public/assets/css/style.css`
  exists continues to pass unchanged (same output path). Add a case that
  builds a fixture content dir with `site.json` containing `"theme": "dark"`
  and asserts the output contains the dark palette's accent color
  (`#6ea8fe`) and not the light one (`#2c5282`).
- Manual: `npm run edit`, change the theme dropdown for the site record,
  use "Build & preview", visually confirm each of the 5 themes renders
  correctly (nav, cards, form controls, modal, graph tooltip all pick up
  the new variables).

## 7. Files touched

- New: `assets/css/base.css`
- New: `assets/css/themes/light.css`, `dark.css`, `slate.css`, `forest.css`, `sepia.css`
- Removed: `assets/css/style.css`
- Modified: `schema/site.schema.json` (add `theme` property)
- Modified: `scripts/editor/app.js` (generic enum → `<select>` in `buildField()`)
- Modified: `scripts/build.mjs` (replace directory copy with `writeThemedCSS()`)
- Modified: `tests/build.test.js` (add dark-theme build assertion)
- Modified: `README.md` (document the `theme` field under the `site.json` description)
