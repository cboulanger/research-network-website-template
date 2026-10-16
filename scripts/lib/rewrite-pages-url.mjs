export function rewritePagesUrl(url) {
  const match = typeof url === 'string' ? url.match(/^pages\.html\?doc=(.+)$/) : null;
  if (!match) return url;
  const stem = match[1].replace(/\.(md|html)$/, '');
  return `pages/${stem}.html`;
}

// The built static site has no pages.html router page, only pages/<name>.html
// files (see buildPagesDocs in scripts/build.mjs) — but resolvePageLink()
// (assets/js/shared.js), used at render time by renderEventItem/renderNewsItem,
// always resolves an internal link to the pages.html?doc=<filename> form,
// since that's the real link form in the live/edit-server context where
// pages.html does exist. This rewrites every such link already present in a
// block of rendered HTML to the static pages/<name>.html form, so it must run
// *after* rendering, not on the raw stored url beforehand (rewriting the raw
// url first would just have resolvePageLink prefix it again, producing a
// broken double-prefixed pages.html?doc=pages/<name>.html link).
const PAGES_DOC_LINK = /pages\.html\?doc=[A-Za-z0-9_-]+\.(?:md|html)/g;

export function rewritePagesLinksInHTML(html) {
  return html.replace(PAGES_DOC_LINK, (match) => rewritePagesUrl(match));
}
