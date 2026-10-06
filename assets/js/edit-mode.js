import { sortEventsByDateDesc } from './events.js';
import { sortNewsByDateDesc } from './news.js';

// Per list page: where the list lives, which elements are its rows, and how
// to learn each row's key. members/projects rows carry data-record-id;
// events/news have no id, so rows are matched to the data by re-applying the
// page's own (stable) sort and the key is the record's array index.
const PAGES = {
  members: { container: '#members-grid', rows: '#members-grid [data-record-id], #members-list [data-record-id]' },
  projects: { container: '#project-list', rows: '#project-list li[data-record-id]' },
  events: { container: '#events-list', rows: '#events-list li.event-item', sort: sortEventsByDateDesc },
  news: { container: '#news-list', rows: '#news-list li.news-item', sort: sortNewsByDateDesc },
};

export function isEditRequested(search, storage) {
  const params = new URLSearchParams(search);
  try {
    if (params.get('edit') === '0') {
      storage?.removeItem('edit');
      return false;
    }
    if (params.has('edit')) {
      storage?.setItem('edit', '1');
      return true;
    }
    return storage?.getItem('edit') === '1';
  } catch {
    return params.has('edit') && params.get('edit') !== '0';
  }
}

export function editHref(type, id) {
  return id === undefined ? `edit.html?type=${type}&new` : `edit.html?type=${type}&id=${encodeURIComponent(id)}`;
}

function link(doc, text, href, className) {
  const a = doc.createElement('a');
  a.className = className;
  a.setAttribute('href', href);
  a.textContent = text;
  return a;
}

export async function decorateEditMode(doc, loadRecords) {
  const type = Object.keys(PAGES).find((t) => doc.querySelector(PAGES[t].container));
  if (!type) return;
  const page = PAGES[type];
  const rows = [...doc.querySelectorAll(page.rows)];

  let keys;
  if (page.sort) {
    const records = await loadRecords(type);
    keys = page.sort(records.map((record, index) => ({ ...record, __index: index }))).map((r) => String(r.__index));
  } else {
    keys = rows.map((row) => row.dataset.recordId);
  }
  rows.forEach((row, i) => {
    if (keys[i] !== undefined) row.append(' ', link(doc, 'Edit', editHref(type, keys[i]), 'edit-button'));
  });

  const banner = doc.createElement('p');
  banner.className = 'edit-banner';
  banner.append('Edit mode: your changes are sent to the editors for review. ', link(doc, 'Exit edit mode', '?edit=0', 'edit-exit'));
  const add = link(doc, 'Add', editHref(type), 'edit-add-button');
  const controls = doc.querySelector('.list-controls');
  const heading = doc.querySelector('h1');
  (heading ?? doc.body).after(banner);
  if (controls) controls.append(add);
  else banner.after(add);
}

if (typeof document !== 'undefined') {
  let storage = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // storage may be blocked; edit mode then only lasts for this page view
  }
  if (isEditRequested(location.search, storage)) {
    decorateEditMode(document, async (type) => {
      const res = await fetch(`assets/data/${type}.json`);
      if (!res.ok) throw new Error(`Could not load ${type} data`);
      return res.json();
    }).catch((err) => console.error(err));
  }
}
