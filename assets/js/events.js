import { fetchJSON, initNav, escapeHTML, isExternalLink } from './shared.js';

export function sortEventsByDateDesc(events) {
  return [...events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function isUpcoming(event, today = new Date().toISOString().slice(0, 10)) {
  return event.date >= today;
}

export function renderEventItem(event, today) {
  let titleHTML = escapeHTML(event.title);
  if (event.url) {
    const attrs = isExternalLink(event.url) ? ' target="_blank" rel="noopener"' : '';
    titleHTML = `<a href="${escapeHTML(event.url)}"${attrs}>${escapeHTML(event.title)}</a>`;
  }
  const badge = isUpcoming(event, today) ? '<span class="badge upcoming">Upcoming</span>' : '';
  return `<li class="event-item"><span class="event-date">${event.date}</span><span class="event-title">${titleHTML}</span>${badge}</li>`;
}

export function renderEvents(events, container, today = new Date().toISOString().slice(0, 10)) {
  const sorted = sortEventsByDateDesc(events);
  container.innerHTML = sorted.length
    ? `<ul class="event-list">${sorted.map((e) => renderEventItem(e, today)).join('')}</ul>`
    : '<p class="empty-state">No events yet.</p>';
}

if (typeof document !== 'undefined' && document.getElementById('events-list')) {
  initNav('events');
  const container = document.getElementById('events-list');
  fetchJSON('data/events.json')
    .then((events) => renderEvents(events, container))
    .catch((err) => {
      container.innerHTML = '<p class="error-state">Couldn\'t load event data.</p>';
      console.error(err);
    });
}
