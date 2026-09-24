export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function getInitials(firstname, lastname) {
  const f = (firstname || '').trim().charAt(0);
  const l = (lastname || '').trim().charAt(0);
  return (f + l).toUpperCase();
}

const AVATAR_PALETTE = ['#c05621', '#2f855a', '#6b46c1', '#b83280', '#2b6cb0', '#975a16'];

export function hashColor(key, palette = AVATAR_PALETTE) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function isExternalLink(url) {
  return /^https?:\/\//i.test(url);
}

export function memberSlug(member) {
  const slugify = (value) =>
    String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slugify(member.firstname)}-${slugify(member.lastname)}`;
}

export function textMatchesQuery(query, searchText) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchText.toLowerCase().includes(q);
}

export function skipLinkHTML() {
  return '<a href="#main-content" class="skip-link">Skip to main content</a>';
}

const DOC_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.(md|html)$/;

export function isValidDocFilename(name) {
  return typeof name === 'string' && DOC_FILENAME_PATTERN.test(name);
}

export function getDocType(name) {
  if (!isValidDocFilename(name)) return null;
  return name.endsWith('.md') ? 'markdown' : 'html';
}

export function titleFromFilename(name) {
  const stem = name.replace(/\.(md|html)$/, '');
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'members.html', label: 'Members', page: 'members' },
  { href: 'projects.html', label: 'Projects', page: 'projects' },
  { href: 'events.html', label: 'Events', page: 'events' },
  { href: 'news.html', label: 'News', page: 'news' },
  { href: 'publications.html', label: 'Publications', page: 'publications' },
];

export function navHTML(activePage, bannerLabel = 'Site', excludePages = []) {
  const items = NAV_LINKS.filter((l) => !excludePages.includes(l.page)).map(
    (l) => `<a href="${l.href}"${l.page === activePage ? ' class="active"' : ''}>${l.label}</a>`
  ).join('');
  return `<nav class="site-nav"><span class="site-title">${escapeHTML(bannerLabel)}</span><div class="nav-links">${items}</div></nav>`;
}

export function wirePortraitFallback(root = document) {
  root.querySelectorAll('img[data-portrait-fallback]').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        const initials = img.dataset.initials || '';
        const color = img.dataset.avatarColor || '#2c5282';
        const wrapper = document.createElement('div');
        wrapper.className = 'avatar-fallback';
        wrapper.style.backgroundColor = color;
        wrapper.textContent = initials;
        img.replaceWith(wrapper);
      },
      { once: true }
    );
  });
}
