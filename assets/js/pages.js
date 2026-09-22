import { initNav } from './shared.js';

const DOC_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.(md|html)$/;

export function isValidDocFilename(name) {
  return typeof name === 'string' && DOC_FILENAME_PATTERN.test(name);
}

export function getDocType(name) {
  if (!isValidDocFilename(name)) return null;
  return name.endsWith('.md') ? 'markdown' : 'html';
}

if (typeof document !== 'undefined' && document.getElementById('page-content')) {
  initNav('pages');
  const container = document.getElementById('page-content');
  const params = new URLSearchParams(window.location.search);
  const doc = params.get('doc');

  if (!doc || !isValidDocFilename(doc)) {
    container.innerHTML = '<p class="error-state">No page specified.</p>';
  } else {
    fetch(`pages/${doc}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load pages/${doc}: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const type = getDocType(doc);
        container.innerHTML = type === 'markdown' ? marked.parse(text) : text;
      })
      .catch((err) => {
        container.innerHTML = '<p class="error-state">Couldn\'t load this page.</p>';
        console.error(err);
      });
  }
}
