import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName,
  creatorMatchesMember,
  cleanBibHTML,
  linkifyHTML,
  selectMemberPublications,
} from '../scripts/lib/publications.mjs';
import {
  sortPublicationsDesc,
  sortPublicationsByAuthor,
  reorderPublicationList,
  renderPublicationItem,
  renderPublications,
  renderPublicationsTeaser,
} from '../assets/js/publications.js';

const ada = { firstname: 'Ada', lastname: 'Adler' };
const dana = { firstname: 'Dana', lastname: 'Kovac' };
const erik = { firstname: 'Erik', lastname: 'Sundström' };

test('normalizeName strips diacritics, case and punctuation', () => {
  assert.equal(normalizeName('Kovač'), 'kovac');
  assert.equal(normalizeName('  Sundström-Øberg '), 'sundstrom oberg');
  assert.equal(normalizeName('Ł. Weiß'), 'l weiss');
});

test('creatorMatchesMember matches despite diacritics on either side', () => {
  assert.equal(creatorMatchesMember({ firstName: 'Dana', lastName: 'Kovač' }, dana), true);
  assert.equal(creatorMatchesMember({ firstName: 'Erik', lastName: 'Sundstrom' }, erik), true);
  assert.equal(creatorMatchesMember({ firstName: 'Erik', lastName: 'Sundstroem' }, erik), true);
});

test('creatorMatchesMember accepts initials and middle names', () => {
  assert.equal(creatorMatchesMember({ firstName: 'A.', lastName: 'Adler' }, ada), true);
  assert.equal(creatorMatchesMember({ firstName: 'Ada M.', lastName: 'Adler' }, ada), true);
  assert.equal(creatorMatchesMember({ firstName: 'A. M.', lastName: 'ADLER' }, ada), true);
});

test('creatorMatchesMember rejects different first names and missing first names', () => {
  assert.equal(creatorMatchesMember({ firstName: 'Benjamin', lastName: 'Adler' }, ada), false);
  assert.equal(creatorMatchesMember({ firstName: 'B.', lastName: 'Adler' }, ada), false);
  assert.equal(creatorMatchesMember({ firstName: '', lastName: 'Adler' }, ada), false);
  assert.equal(creatorMatchesMember({ firstName: 'Ada', lastName: 'Adlerova' }, ada), false);
});

test('creatorMatchesMember handles single-field creator names', () => {
  assert.equal(creatorMatchesMember({ name: 'Ada Adler' }, ada), true);
  assert.equal(creatorMatchesMember({ name: 'Adler, Ada' }, ada), true);
  assert.equal(creatorMatchesMember({ name: 'Institute for Legal History' }, ada), false);
});

test('linkifyHTML links bare DOIs and URLs but leaves existing links alone', () => {
  const html = linkifyHTML('See doi:10.5555/abc.123. Or https://example.org/x?a=1&amp;b=2, and <a href="https://doi.org/10.5555/zzz">https://doi.org/10.5555/zzz</a>.');
  assert.match(html, /<a href="https:\/\/doi\.org\/10\.5555\/abc\.123">doi:10\.5555\/abc\.123<\/a>\./);
  assert.match(html, /<a href="https:\/\/example\.org\/x\?a=1&amp;b=2">https:\/\/example\.org\/x\?a=1&amp;b=2<\/a>,/);
  assert.equal(html.match(/<a /g).length, 3);
});

test('cleanBibHTML unwraps the csl-entry, keeps formatting and opens links in a new tab', () => {
  const bib = '<div class="csl-bib-body" style="line-height: 2;">\n  <div class="csl-entry">Adler, A. (2024). <i>A Book</i>. Press. <a href="https://doi.org/10.5555/1">https://doi.org/10.5555/1</a></div>\n</div>';
  const html = cleanBibHTML(bib);
  assert.equal(
    html,
    'Adler, A. (2024). <i>A Book</i>. Press. <a href="https://doi.org/10.5555/1" target="_blank" rel="noopener">https://doi.org/10.5555/1</a>'
  );
});

test('cleanBibHTML strips disallowed tags, event handlers and non-http links', () => {
  const html = cleanBibHTML('<div class="csl-entry"><script>alert(1)</script><span onclick="x()" style="font-variant:small-caps;">Adler</span> <a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)></div>');
  assert.doesNotMatch(html, /<script|onclick|javascript:|<img/);
  assert.match(html, /<span style="font-variant:small-caps;">Adler<\/span>/);
  assert.match(html, /bad/);
});

function zoteroItem(key, creators, parsedDate, extra = {}) {
  return {
    key,
    meta: parsedDate ? { parsedDate } : {},
    bib: `<div class="csl-bib-body"><div class="csl-entry">Entry ${key}</div></div>`,
    data: { key, itemType: 'journalArticle', creators, dateAdded: '2026-01-01T00:00:00Z', ...extra },
  };
}

test('selectMemberPublications keeps only items authored or edited by a member', () => {
  const items = [
    zoteroItem('A', [{ creatorType: 'author', firstName: 'Ada', lastName: 'Adler' }], '2024'),
    zoteroItem('B', [{ creatorType: 'author', firstName: 'Someone', lastName: 'Else' }], '2025'),
    zoteroItem('C', [{ creatorType: 'editor', firstName: 'D.', lastName: 'Kovač' }], '2023-05'),
    zoteroItem('D', [{ creatorType: 'reviewedAuthor', firstName: 'Ada', lastName: 'Adler' }], '2026'),
  ];
  const pubs = selectMemberPublications(items, [ada, dana]);
  assert.deepEqual(pubs.map((p) => p.key), ['A', 'C']);
  assert.equal(pubs[0].date, '2024');
  assert.equal(pubs[0].html, 'Entry A');
});

test('selectMemberPublications honours configured creator types', () => {
  const items = [zoteroItem('D', [{ creatorType: 'reviewedAuthor', firstName: 'Ada', lastName: 'Adler' }], '2026')];
  assert.equal(selectMemberPublications(items, [ada], { creatorTypes: ['reviewedAuthor'] }).length, 1);
});

test('selectMemberPublications skips notes and attachments', () => {
  const note = zoteroItem('N', [], '2026', { itemType: 'note' });
  assert.equal(selectMemberPublications([note], [ada]).length, 0);
});

test('sortPublicationsDesc orders newest first, undated last', () => {
  const sorted = sortPublicationsDesc([
    { key: 'a', date: '2023', html: '' },
    { key: 'b', date: '', html: '' },
    { key: 'c', date: '2025-02-01', html: '' },
    { key: 'd', date: '2024-11', html: '' },
  ]);
  assert.deepEqual(sorted.map((p) => p.key), ['c', 'd', 'a', 'b']);
});

test('sortPublicationsDesc orders entries with the same date by author A-Z', () => {
  const sorted = sortPublicationsDesc([
    { key: 's', date: '2024', sortName: 'sundstrom' },
    { key: 'new', date: '2025', sortName: 'okoro' },
    { key: 'a', date: '2024', sortName: 'adler' },
    { key: 'k', date: '2024', sortName: 'kovac' },
  ]);
  assert.deepEqual(sorted.map((p) => p.key), ['new', 'a', 'k', 's']);
});

test('renderPublicationItem inserts the pre-sanitized citation HTML', () => {
  assert.equal(renderPublicationItem({ key: 'a', date: '2024', html: '<i>X</i>' }), '<li class="publication-item"><i>X</i></li>');
});

test('selectMemberPublications derives an accent-free sort name from the first creator\'s last name', () => {
  const items = [
    zoteroItem('A', [{ creatorType: 'author', firstName: 'Dana', lastName: 'Kovač' }, { creatorType: 'author', firstName: 'Ada', lastName: 'Adler' }], '2024'),
    zoteroItem('B', [{ creatorType: 'editor', name: 'Adler, Ada' }], '2024'),
  ];
  assert.deepEqual(selectMemberPublications(items, [ada]).map((p) => p.sortName), ['kovac', 'adler']);
});

test('sortPublicationsByAuthor orders by first creator\'s last name A-Z, then newest first', () => {
  const sorted = sortPublicationsByAuthor([
    { key: 'k', date: '2024', sortName: 'kovac' },
    { key: 'a1', date: '2020', sortName: 'adler' },
    { key: 'a2', date: '2025', sortName: 'adler' },
    { key: 'b', date: '2023', sortName: 'bergman' },
  ]);
  assert.deepEqual(sorted.map((p) => p.key), ['a2', 'a1', 'b', 'k']);
});

test('renderPublications sorts by date and records each entry\'s rank in both orders', () => {
  const container = {};
  renderPublications(
    [
      { key: 'old', date: '2020', sortName: 'adler', html: 'Old' },
      { key: 'new', date: '2025', sortName: 'okoro', html: 'New' },
    ],
    container
  );
  assert.ok(container.innerHTML.indexOf('New') < container.innerHTML.indexOf('Old'));
  assert.match(container.innerHTML, /data-rank-date="0" data-rank-author="1">New/);
  assert.match(container.innerHTML, /data-rank-date="1" data-rank-author="0">Old/);
});

test('reorderPublicationList re-appends list items in the chosen rank order', () => {
  const li = (name, d, a) => ({ name, dataset: { rankDate: String(d), rankAuthor: String(a) } });
  const children = [li('x', 0, 2), li('y', 1, 0), li('z', 2, 1)];
  const appended = [];
  const list = { children, appendChild: (el) => appended.push(el.name) };
  reorderPublicationList(list, 'author');
  assert.deepEqual(appended, ['y', 'z', 'x']);
});

test('renderPublications shows the empty state for an empty list', () => {
  const container = {};
  renderPublications([], container);
  assert.match(container.innerHTML, /No publications yet/);
});

test('renderPublicationsTeaser shows only the 3 newest plus a see-all link', () => {
  const pubs = ['2020', '2021', '2022', '2023'].map((date) => ({ key: date, date, html: `P${date}` }));
  const container = {};
  renderPublicationsTeaser(pubs, container);
  assert.equal(container.innerHTML.match(/publication-item/g).length, 3);
  assert.doesNotMatch(container.innerHTML, /P2020/);
  assert.match(container.innerHTML, /href="publications\.html"/);
});
