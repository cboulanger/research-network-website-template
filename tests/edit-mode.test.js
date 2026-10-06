import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { isEditRequested, editHref, decorateEditMode } from '../assets/js/edit-mode.js';

const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};

test('?edit enables edit mode and is remembered for the session; ?edit=0 turns it off', () => {
  const storage = memoryStorage();
  assert.equal(isEditRequested('', storage), false);
  assert.equal(isEditRequested('?edit', storage), true);
  assert.equal(isEditRequested('', storage), true);
  assert.equal(isEditRequested('?edit=0', storage), false);
  assert.equal(isEditRequested('', storage), false);
});

test('isEditRequested works without usable storage', () => {
  assert.equal(isEditRequested('?edit', null), true);
  assert.equal(isEditRequested('', null), false);
});

test('editHref builds add and edit links', () => {
  assert.equal(editHref('members'), 'edit.html?type=members&new');
  assert.equal(editHref('members', 'adler-ada'), 'edit.html?type=members&id=adler-ada');
});

test('members page rows get Edit buttons and the list gets an Add button', async () => {
  const dom = new JSDOM(`<main><h1>Members</h1><div class="list-controls"></div>
    <div id="members-grid"><ul><li class="member-card" data-record-id="adler-ada"></li></ul></div>
    <div id="members-list"><ul><li class="member-list-item" data-record-id="adler-ada"></li></ul></div></main>`);
  await decorateEditMode(dom.window.document, async () => { throw new Error('not needed'); });
  const hrefs = [...dom.window.document.querySelectorAll('a.edit-button')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['edit.html?type=members&id=adler-ada', 'edit.html?type=members&id=adler-ada']);
  assert.equal(dom.window.document.querySelector('a.edit-add-button').getAttribute('href'), 'edit.html?type=members&new');
  assert.ok(dom.window.document.querySelector('.edit-banner'));
});

test('events rows (sorted by date) map back to their original array index', async () => {
  const dom = new JSDOM(`<main><h1>Events</h1><div id="events-list"><ul class="event-list">
    <li class="event-item">new</li><li class="event-item">old</li></ul></div></main>`);
  const records = [{ date: '2020-01-01', title: 'old' }, { date: '2021-01-01', title: 'new' }];
  await decorateEditMode(dom.window.document, async (type) => { assert.equal(type, 'events'); return records; });
  const hrefs = [...dom.window.document.querySelectorAll('a.edit-button')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['edit.html?type=events&id=1', 'edit.html?type=events&id=0']);
});

test('pages that are not editable lists are left alone', async () => {
  const dom = new JSDOM('<main><h1>About</h1></main>');
  await decorateEditMode(dom.window.document, async () => []);
  assert.equal(dom.window.document.querySelector('a'), null);
});
