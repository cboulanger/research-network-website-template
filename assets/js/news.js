import { escapeHTML, isExternalLink } from './shared.js';

export { isExternalLink };

export function sortNewsByDateDesc(items) {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function renderNewsItem(item) {
  const external = isExternalLink(item.url);
  const attrs = external ? ' target="_blank" rel="noopener"' : '';
  return `<li class="news-item"><span class="news-date">${escapeHTML(item.date)}</span><a href="${escapeHTML(item.url)}"${attrs}>${escapeHTML(item.title)}</a></li>`;
}

export function renderNews(items, container) {
  const sorted = sortNewsByDateDesc(items);
  container.innerHTML = sorted.length
    ? `<ul class="news-list">${sorted.map(renderNewsItem).join('')}</ul>`
    : '<p class="empty-state">No news yet.</p>';
}

export function renderNewsTeaser(items, container) {
  const sorted = sortNewsByDateDesc(items).slice(0, 3);
  container.innerHTML = sorted.length
    ? `<ul class="news-list">${sorted.map(renderNewsItem).join('')}</ul><p><a href="news.html">See all news &rarr;</a></p>`
    : '<p class="empty-state">No news yet.</p>';
}
