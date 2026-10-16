import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderRecordFields, collectRecordData } from '../assets/js/record-form.js';

const itemSchema = {
  type: 'object',
  required: ['id', 'title', 'participants'],
  properties: {
    id: { type: 'string', 'x-editor': { readOnly: true } },
    title: { type: 'string' },
    kind: { enum: ['a', 'b'] },
    participants: { type: 'array', items: { type: 'string' } },
  },
};
const members = [{ id: 'm1', firstname: 'Ada', lastname: 'Adler' }];
const record = { id: 'p1', title: 'T', participants: ['m1'] };

function makeForm() {
  const dom = new JSDOM('<body></body>');
  globalThis.document = dom.window.document;
  return document.createElement('form');
}

test('renderRecordFields renders a control per property and fills values', () => {
  const form = makeForm();
  renderRecordFields(form, { itemSchema, record, typeName: 'projects', members });
  assert.equal(form.querySelector('#field-title').value, 'T');
  assert.equal(form.querySelector('#field-title').required, true);
  assert.equal(form.querySelector('#field-id').readOnly, true);
  assert.equal(form.querySelector('[data-field="participants"] li span').textContent, 'Adler, Ada');
});

test('collectRecordData returns what the form shows', () => {
  const form = makeForm();
  renderRecordFields(form, { itemSchema, record, typeName: 'projects', members });
  form.querySelector('#field-title').value = 'New title';
  assert.deepEqual(collectRecordData(form, { itemSchema, typeName: 'projects' }), {
    id: 'p1', title: 'New title', kind: 'a', participants: ['m1'],
  });
});

test('skipReadOnly leaves readOnly fields out of both render and collect', () => {
  const form = makeForm();
  renderRecordFields(form, { itemSchema, record, typeName: 'projects', members, skipReadOnly: true });
  assert.equal(form.querySelector('#field-id'), null);
  assert.equal('id' in collectRecordData(form, { itemSchema, typeName: 'projects', skipReadOnly: true }), false);
});

test('a property title is used as the label; without one the key is used', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    required: ['lastname'],
    properties: {
      lastname: { type: 'string', title: 'Last name' },
      nickname: { type: 'string' },
      participants: { type: 'array', items: { type: 'string' }, title: 'Participants' },
    },
  };
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'projects', members: [] });
  assert.equal(form.querySelector('label[for="field-lastname"]').textContent, 'Last name *');
  assert.equal(form.querySelector('label[for="field-nickname"]').textContent, 'nickname');
  assert.equal(form.querySelector('[data-field="participants"] label').textContent, 'Participants');
});

test('a page-link field shows matching pages as the user types, and selecting one fills in the filename', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    properties: {
      url: { type: 'string', title: 'Link', 'x-editor': { widget: 'page-link' } },
    },
  };
  const pages = [
    { filename: 'about.md', type: 'markdown', title: 'About the Network' },
    { filename: 'example.html', type: 'html', title: 'Example HTML Content Page' },
  ];
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'events', pages });

  const input = form.querySelector('#field-url');
  input.value = 'about';
  input.dispatchEvent(new document.defaultView.Event('input'));

  const dropdown = form.querySelector('.page-link-results');
  assert.equal(dropdown.hidden, false);
  assert.match(dropdown.textContent, /About the Network/);
  assert.doesNotMatch(dropdown.textContent, /Example HTML/);

  dropdown.querySelector('div').click();
  assert.equal(input.value, 'about.md');
  assert.equal(dropdown.hidden, true);
});

test('a page-link field never shows a dropdown for a value starting with http', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    properties: { url: { type: 'string', title: 'Link', 'x-editor': { widget: 'page-link' } } },
  };
  const pages = [{ filename: 'http-page.md', type: 'markdown', title: 'http-page' }];
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'events', pages });

  const input = form.querySelector('#field-url');
  input.value = 'http://example.org';
  input.dispatchEvent(new document.defaultView.Event('input'));

  assert.equal(form.querySelector('.page-link-results').hidden, true);
});

test('a page-link field with no pages supplied behaves like a plain input (the public edit form\'s case)', () => {
  const form = makeForm();
  const schema = {
    type: 'object',
    properties: { url: { type: 'string', title: 'Link', 'x-editor': { widget: 'page-link' } } },
  };
  renderRecordFields(form, { itemSchema: schema, record: {}, typeName: 'events' });

  const input = form.querySelector('#field-url');
  input.value = 'anything';
  input.dispatchEvent(new document.defaultView.Event('input'));

  assert.equal(form.querySelector('.page-link-results').hidden, true);
  assert.equal(input.value, 'anything');
});
