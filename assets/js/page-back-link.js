export function resolveBackLink(referrer) {
  if (typeof referrer !== 'string' || !referrer) return null;
  if (/\/news\.html(?:[?#]|$)/.test(referrer)) return { label: 'All News', href: 'news.html' };
  if (/\/events\.html(?:[?#]|$)/.test(referrer)) return { label: 'All Events', href: 'events.html' };
  return null;
}

if (typeof document !== 'undefined') {
  const backLinkEl = document.getElementById('page-back-link');
  if (backLinkEl) {
    const backLink = resolveBackLink(document.referrer);
    backLinkEl.innerHTML = backLink ? `<a href="../${backLink.href}">&larr; ${backLink.label}</a>` : '';
  }
}
