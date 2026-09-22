import test from 'node:test';
import assert from 'node:assert/strict';
import { sortEventsByDateDesc, isUpcoming, renderEventItem, renderEventsTeaser } from '../assets/js/events.js';

const events = [
  { date: '2024-09-04', title: 'Bangor roundtable' },
  { date: '2026-11-10', title: 'Next meeting', url: 'https://example.org' },
  { date: '2023-01-15', title: 'Kickoff' },
];

test('sortEventsByDateDesc orders newest first', () => {
  const sorted = sortEventsByDateDesc(events);
  assert.deepEqual(sorted.map((e) => e.date), ['2026-11-10', '2024-09-04', '2023-01-15']);
});

test('isUpcoming compares against a fixed "today" for determinism', () => {
  assert.equal(isUpcoming({ date: '2026-11-10' }, '2026-09-22'), true);
  assert.equal(isUpcoming({ date: '2024-09-04' }, '2026-09-22'), false);
});

test('renderEventItem links the title when url is present', () => {
  const html = renderEventItem(events[1], '2026-09-22');
  assert.match(html, /<a href="https:\/\/example.org"/);
});

test('renderEventItem shows an upcoming badge for future dates', () => {
  const html = renderEventItem(events[1], '2026-09-22');
  assert.match(html, /badge upcoming/);
});

test('renderEventItem adds target=_blank only for external links', () => {
  const external = renderEventItem(events[1], '2026-09-22');
  const internal = renderEventItem(
    { date: '2025-07-02', title: 'Online meeting', url: 'pages.html?doc=notes.md' },
    '2026-09-22'
  );
  assert.match(external, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(internal, /target="_blank"/);
});

test('renderEventsTeaser shows only the 3 most recent items plus a "See all events" link', () => {
  const fourEvents = [
    ...events,
    { date: '2020-01-01', title: 'Ancient meeting' },
  ];
  const container = { innerHTML: '' };
  renderEventsTeaser(fourEvents, container, '2026-09-22');
  const order = [...container.innerHTML.matchAll(/class="event-date">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['2026-11-10', '2024-09-04', '2023-01-15']);
  assert.match(container.innerHTML, /See all events/);
  assert.match(container.innerHTML, /href="events.html"/);
});

test('renderEventsTeaser shows the empty state for an empty list, with no "See all events" link', () => {
  const container = { innerHTML: '' };
  renderEventsTeaser([], container, '2026-09-22');
  assert.match(container.innerHTML, /No events yet\./);
  assert.doesNotMatch(container.innerHTML, /See all events/);
});
