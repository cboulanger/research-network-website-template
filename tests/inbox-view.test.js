import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderInboxEntries } from '../scripts/editor/inbox-view.js';

function render(entries, handlers = {}) {
  const dom = new JSDOM('<div id="c"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.getElementById('c');
  renderInboxEntries(container, entries, { onReview() {}, onReject() {}, ...handlers });
  return container;
}

test('shows an empty state', () => {
  assert.match(render([]).textContent, /No new submissions/);
});

test('an update shows its field changes; an add shows the submitted values', () => {
  const c = render([
    { id: 'u', time: 1, type: 'members', op: 'update', key: 'a', stale: false, data: {}, changes: [{ field: 'affiliation', from: 'Old', to: 'New' }], prefill: {} },
    { id: 'a', time: 2, type: 'news', op: 'add', key: null, stale: false, data: { title: 'Hello' }, changes: null, prefill: {} },
  ]);
  const text = c.textContent;
  assert.match(text, /affiliation/);
  assert.match(text, /Old/);
  assert.match(text, /New/);
  assert.match(text, /Hello/);
});

test('a stale update shows a warning', () => {
  const c = render([{ id: 'u', time: 1, type: 'members', op: 'update', key: null, stale: true, data: {}, changes: null, prefill: {} }]);
  assert.match(c.querySelector('.inbox-warning').textContent, /no longer|changed/i);
});

test('buttons call the handlers with the entry; submitted text is not interpreted as HTML', () => {
  const entry = { id: 'a', time: 2, type: 'news', op: 'add', key: null, stale: false, data: { title: '<img src=x onerror=alert(1)>' }, changes: null, prefill: {} };
  const calls = [];
  const c = render([entry], { onReview: (e) => calls.push(['review', e.id]), onReject: (e) => calls.push(['reject', e.id]) });
  assert.equal(c.querySelector('img'), null);
  c.querySelector('[data-action="review"]').click();
  c.querySelector('[data-action="reject"]').click();
  assert.deepEqual(calls, [['review', 'a'], ['reject', 'a']]);
});
