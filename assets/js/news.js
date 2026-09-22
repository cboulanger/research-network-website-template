import { fetchJSON, initNav, escapeHTML } from './shared.js';

export function sortNewsByDateDesc(items) {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function isExternalLink(url) {
  return /^https?:\/\//i.test(url);
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

if (typeof document !== 'undefined') {
  const newsList = document.getElementById('news-list');
  if (newsList) {
    initNav('news');
    fetchJSON('data/news.json')
      .then((items) => renderNews(items, newsList))
      .catch((err) => {
        newsList.innerHTML = '<p class="error-state">Couldn\'t load news.</p>';
        console.error(err);
      });
  }

  const newsTeaser = document.getElementById('news-teaser');
  if (newsTeaser) {
    fetchJSON('data/news.json')
      .then((items) => renderNewsTeaser(items, newsTeaser))
      .catch((err) => {
        newsTeaser.innerHTML = '<p class="error-state">Couldn\'t load news.</p>';
        console.error(err);
      });
  }
}
