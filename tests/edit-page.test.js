import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initEditPage, bootEditPage } from '../assets/js/edit-page.js';

const memberSchema = {
  type: 'array',
  items: { type: 'object', required: ['lastname'], properties: {
    id: { type: 'string', 'x-editor': { readOnly: true } }, lastname: { type: 'string' },
  } },
};
const eventSchema = { type: 'array', items: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } };
const files = {
  'assets/schema/members.schema.json': memberSchema,
  'assets/schema/events.schema.json': eventSchema,
  'assets/data/members.json': [{ id: 'adler-ada', lastname: 'Adler' }],
  'assets/data/events.json': [{ title: 'zero' }, { title: 'one' }],
};
const fetchFn = async (url) => (url in files
  ? { ok: true, json: async () => files[url] }
  : { ok: false, status: 404 });

function setup(search) {
  const dom = new JSDOM('<h1 id="edit-title"></h1><div id="edit-message" hidden></div><form id="edit-form"></form>');
  globalThis.document = dom.window.document;
  const sent = [];
  const postFn = async (args) => sent.push(args);
  const ready = initEditPage({ doc: dom.window.document, search, config: { server: 'https://ntfy.sh', topic: 't' }, fetchFn, postFn });
  return { dom, sent, ready };
}
const submit = async (dom) => {
  dom.window.document.getElementById('edit-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
};

test('adding a member posts an add envelope without an id', async () => {
  const { dom, sent, ready } = setup('?type=members&new');
  await ready;
  assert.equal(dom.window.document.getElementById('edit-title').textContent, 'Add member');
  assert.equal(dom.window.document.querySelector('#field-id'), null);
  dom.window.document.querySelector('#field-lastname').value = 'Okoro';
  await submit(dom);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].envelope.op, 'add');
  assert.equal(sent[0].envelope.id, undefined);
  assert.deepEqual(sent[0].envelope.data, { lastname: 'Okoro' });
  assert.equal(sent[0].topic, 't');
});

test('editing a member posts an update envelope carrying the id inside data', async () => {
  const { dom, sent, ready } = setup('?type=members&id=adler-ada');
  await ready;
  assert.equal(dom.window.document.querySelector('#field-lastname').value, 'Adler');
  dom.window.document.querySelector('#field-lastname').value = 'Adler-Smith';
  await submit(dom);
  assert.equal(sent[0].envelope.op, 'update');
  assert.equal(sent[0].envelope.id, 'adler-ada');
  assert.deepEqual(sent[0].envelope.data, { id: 'adler-ada', lastname: 'Adler-Smith' });
  assert.equal(sent[0].envelope.base, undefined);
  assert.match(dom.window.document.getElementById('edit-message').textContent, /Thank you/);
});

test('editing an event (no id field) addresses it by index and sends the original as base', async () => {
  const { dom, sent, ready } = setup('?type=events&id=1');
  await ready;
  dom.window.document.querySelector('#field-title').value = 'changed';
  await submit(dom);
  assert.equal(sent[0].envelope.id, '1');
  assert.deepEqual(sent[0].envelope.base, { title: 'one' });
  assert.deepEqual(sent[0].envelope.data, { title: 'changed' });
});

test('unknown types and missing records show an error instead of a form', async () => {
  let ctx = setup('?type=site&new');
  await ctx.ready;
  assert.equal(ctx.dom.window.document.getElementById('edit-message').hidden, false);
  assert.equal(ctx.dom.window.document.getElementById('edit-form').children.length, 0);
  ctx = setup('?type=members&id=nobody');
  await ctx.ready;
  assert.match(ctx.dom.window.document.getElementById('edit-message').textContent, /no longer exists/);
});

test('a failing post shows the error and re-enables the button', async () => {
  const dom = new JSDOM('<h1 id="edit-title"></h1><div id="edit-message" hidden></div><form id="edit-form"></form>');
  globalThis.document = dom.window.document;
  await initEditPage({
    doc: dom.window.document, search: '?type=members&new', config: { server: 'x', topic: 't' }, fetchFn,
    postFn: async () => { throw new Error('boom'); },
  });
  await submit(dom);
  assert.match(dom.window.document.getElementById('edit-message').textContent, /boom/);
  assert.equal(dom.window.document.querySelector('button[type=submit]').disabled, false);
});

test('keyless types reject non-integer ids without rendering a form', async () => {
  for (const search of ['?type=events&id=', '?type=events&id=1e0', '?type=events&id=-1', '?type=events&id=0x1', '?type=events&id=1.0', '?type=events&id=%201']) {
    const ctx = setup(search);
    await ctx.ready;
    const doc = ctx.dom.window.document;
    assert.match(doc.getElementById('edit-message').textContent, /no longer exists/, search);
    assert.equal(doc.getElementById('edit-form').children.length, 0, search);
  }
  const ok = setup('?type=events&id=0');
  await ok.ready;
  assert.equal(ok.dom.window.document.querySelector('#field-title').value, 'zero');
});

test('errors are announced with role=alert', async () => {
  const ctx = setup('?type=members&id=nobody');
  await ctx.ready;
  const msg = ctx.dom.window.document.getElementById('edit-message');
  assert.equal(msg.getAttribute('role'), 'alert');
  assert.equal(msg.className, 'form-error');
});

test('bootEditPage shows an error when the config cannot be loaded', async () => {
  const dom = new JSDOM('<h1 id="edit-title"></h1><div id="edit-message" hidden></div><form id="edit-form"></form>');
  await bootEditPage({ doc: dom.window.document, search: '?type=members&new', loadConfig: async () => { throw new Error('stale page'); } });
  const msg = dom.window.document.getElementById('edit-message');
  assert.equal(msg.hidden, false);
  assert.equal(msg.className, 'form-error');
  assert.match(msg.textContent, /stale page/);
});
