import { initNav, isValidDocFilename, getDocType, renderPageDoc } from './shared.js';

export { isValidDocFilename, getDocType };

export function titleFromFilename(name) {
  const stem = name.replace(/\.(md|html)$/, '');
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function resolveBackLink(referrer) {
  if (typeof referrer !== 'string' || !referrer) return null;
  if (/\/news\.html(?:[?#]|$)/.test(referrer)) return { label: 'All News', href: 'news.html' };
  if (/\/events\.html(?:[?#]|$)/.test(referrer)) return { label: 'All Events', href: 'events.html' };
  return null;
}

if (typeof document !== 'undefined' && document.getElementById('page-content')) {
  initNav('pages');
  const container = document.getElementById('page-content');
  const params = new URLSearchParams(window.location.search);
  const doc = params.get('doc');

  const backLinkEl = document.getElementById('page-back-link');
  if (backLinkEl) {
    const backLink = resolveBackLink(document.referrer);
    backLinkEl.innerHTML = backLink ? `<a href="${backLink.href}">&larr; ${backLink.label}</a>` : '';
  }

  renderPageDoc(doc, container).then((ok) => {
    if (!ok) return;
    const heading = container.querySelector('h1');
    const title = heading ? heading.textContent.trim() : titleFromFilename(doc);
    document.title = `${title} — RCSL WG Histories`;
  });
}
