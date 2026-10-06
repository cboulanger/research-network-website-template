// Renders pending public submissions. Built with DOM APIs and textContent only:
// the content comes from anonymous visitors and must never be parsed as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const show = (value) => (value === null || value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value));

function changesTable(rows, headers) {
  const table = el('table', 'inbox-changes');
  const head = el('tr');
  headers.forEach((h) => head.append(el('th', '', h)));
  table.append(head);
  rows.forEach((cells) => {
    const tr = el('tr');
    cells.forEach((c) => tr.append(el('td', '', show(c))));
    table.append(tr);
  });
  return table;
}

export function renderInboxEntries(container, entries, { onReview, onReject }) {
  container.replaceChildren();
  if (!entries.length) {
    container.append(el('p', 'empty-state', 'No new submissions.'));
    return;
  }
  for (const entry of entries) {
    const article = el('article', 'inbox-entry');
    article.append(el('h3', '', `${entry.type} · ${entry.op === 'add' ? 'new entry' : 'edit'}`));
    if (entry.time) article.append(el('p', 'inbox-time', new Date(entry.time * 1000).toLocaleString()));
    if (entry.stale) {
      article.append(el('p', 'inbox-warning', 'The record this edit refers to no longer exists or has changed since. Accepting will add it as a new entry.'));
    }
    if (entry.changes) {
      article.append(
        entry.changes.length
          ? changesTable(entry.changes.map((c) => [c.field, c.from, c.to]), ['Field', 'Current', 'Proposed'])
          : el('p', '', 'No changes compared to the current record.')
      );
    } else {
      article.append(changesTable(Object.entries(entry.data), ['Field', 'Value']));
    }
    const actions = el('p', 'inbox-actions');
    const review = el('button', '', 'Review & accept');
    review.type = 'button';
    review.dataset.action = 'review';
    review.addEventListener('click', () => onReview(entry));
    const reject = el('button', '', 'Reject');
    reject.type = 'button';
    reject.dataset.action = 'reject';
    reject.addEventListener('click', () => onReject(entry));
    actions.append(review, ' ', reject);
    article.append(actions);
    container.append(article);
  }
}
