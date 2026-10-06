import { renderRecordFields, collectRecordData } from './record-form.js';
import { EDITABLE_TYPES, buildEnvelope, postEnvelope } from './ntfy.js';

const LABELS = { members: 'member', projects: 'project', events: 'event', news: 'news item' };
// Collections whose records have a stored `id`; the others (events, news) are addressed by array index.
const KEY_FIELD = { members: 'id', projects: 'id' };

export async function initEditPage({ doc, search, config, fetchFn = (...args) => fetch(...args), postFn = postEnvelope }) {
  const params = new URLSearchParams(search);
  const type = params.get('type');
  const message = doc.getElementById('edit-message');
  const form = doc.getElementById('edit-form');
  const show = (text, isError) => {
    message.textContent = text;
    message.className = isError ? 'form-error' : 'form-message';
    message.hidden = false;
  };
  if (!EDITABLE_TYPES.includes(type)) return show('Unknown content type.', true);

  const isNew = !params.has('id');
  const keyField = KEY_FIELD[type];
  const getJSON = async (url) => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
    return res.json();
  };

  let schema;
  let record = {};
  let members = [];
  try {
    schema = await getJSON(`assets/schema/${type}.schema.json`);
    if (!isNew) {
      const records = await getJSON(`assets/data/${type}.json`);
      const id = params.get('id');
      const found = keyField ? records.find((r) => r[keyField] === id) : records[Number(id)];
      if (!found) return show('This entry no longer exists. Please go back and reload the page.', true);
      record = found;
    }
    if (type === 'projects') members = await getJSON('assets/data/members.json');
  } catch (err) {
    return show(err.message, true);
  }

  doc.getElementById('edit-title').textContent = `${isNew ? 'Add' : 'Edit'} ${LABELS[type]}`;
  const itemSchema = schema.items;
  renderRecordFields(form, { itemSchema, record, typeName: type, members, skipReadOnly: true });
  const submit = doc.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Send for review';
  form.append(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collectRecordData(form, { itemSchema, typeName: type, skipReadOnly: true });
    const id = isNew ? undefined : params.get('id');
    if (!isNew && keyField) data[keyField] = id;
    const envelope = buildEnvelope({
      type,
      op: isNew ? 'add' : 'update',
      id,
      data,
      base: !isNew && !keyField ? record : undefined,
    });
    submit.disabled = true;
    try {
      await postFn({ server: config.server, topic: config.topic, envelope });
      form.hidden = true;
      show('Thank you! Your submission was sent and will be published after review.', false);
    } catch (err) {
      submit.disabled = false;
      show(err.message, true);
    }
  });
}

if (typeof document !== 'undefined' && document.getElementById('edit-form')) {
  import('./edit-config.js').then(({ default: config }) => initEditPage({ doc: document, search: location.search, config }));
}
