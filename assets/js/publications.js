// Publications are selected and sanitized at build time
// (scripts/lib/publications.mjs); `html` is the already-safe citation.

function compareDateDesc(a, b) {
  const ad = a.date || '';
  const bd = b.date || '';
  return ad < bd ? 1 : ad > bd ? -1 : 0;
}

function compareAuthorAsc(a, b) {
  return (a.sortName || '').localeCompare(b.sortName || '');
}

function compareAddedDesc(a, b) {
  const aa = a.added || '';
  const ba = b.added || '';
  return aa < ba ? 1 : aa > ba ? -1 : 0;
}

// Newest first; same date by first creator's last name A–Z.
export function sortPublicationsDesc(items) {
  return [...items].sort((a, b) => compareDateDesc(a, b) || compareAuthorAsc(a, b) || compareAddedDesc(a, b));
}

// First creator's last name A–Z; works with the same last name newest first.
export function sortPublicationsByAuthor(items) {
  return [...items].sort((a, b) => compareAuthorAsc(a, b) || compareDateDesc(a, b) || compareAddedDesc(a, b));
}

export function renderPublicationItem(item, attrs = '') {
  return `<li class="publication-item"${attrs}>${item.html}</li>`;
}

// Renders newest first (the no-JS order), recording each entry's position
// in both sort orders so the page script can reorder without re-sorting.
export function renderPublications(items, container) {
  const byDate = sortPublicationsDesc(items);
  const authorRank = new Map(sortPublicationsByAuthor(items).map((p, i) => [p, i]));
  container.innerHTML = byDate.length
    ? `<ul class="publication-list">${byDate
        .map((p, i) => renderPublicationItem(p, ` data-rank-date="${i}" data-rank-author="${authorRank.get(p)}"`))
        .join('')}</ul>`
    : '<p class="empty-state">No publications yet.</p>';
}

export function renderPublicationsTeaser(items, container) {
  const sorted = sortPublicationsDesc(items).slice(0, 3);
  container.innerHTML = sorted.length
    ? `<ul class="publication-list">${sorted.map((p) => renderPublicationItem(p)).join('')}</ul><p><a href="publications.html">See all publications &rarr;</a></p>`
    : '<p class="empty-state">No publications yet.</p>';
}

export function reorderPublicationList(list, mode) {
  const rankKey = mode === 'author' ? 'rankAuthor' : 'rankDate';
  [...list.children]
    .sort((a, b) => Number(a.dataset[rankKey]) - Number(b.dataset[rankKey]))
    .forEach((li) => list.appendChild(li));
}

if (typeof document !== 'undefined' && document.getElementById('publication-sort')) {
  const controls = document.getElementById('publication-sort-controls');
  const select = document.getElementById('publication-sort');
  const list = document.querySelector('#publications-list .publication-list');

  if (list) {
    controls.hidden = false;
    select.addEventListener('change', () => reorderPublicationList(list, select.value));
  }
}
