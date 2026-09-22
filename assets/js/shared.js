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

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const NAV_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'members.html', label: 'Members', page: 'members' },
  { href: 'projects.html', label: 'Projects', page: 'projects' },
  { href: 'events.html', label: 'Events', page: 'events' },
  { href: 'news.html', label: 'News', page: 'news' },
];

export function navHTML(activePage) {
  const items = NAV_LINKS.map(
    (l) => `<a href="${l.href}"${l.page === activePage ? ' class="active"' : ''}>${l.label}</a>`
  ).join('');
  return `<nav class="site-nav"><span class="site-title">RCSL WG Histories</span><div class="nav-links">${items}</div></nav>`;
}

export function initNav(activePage) {
  const mount = document.getElementById('nav');
  if (mount) mount.outerHTML = navHTML(activePage);
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
