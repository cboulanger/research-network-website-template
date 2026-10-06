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
