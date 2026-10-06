import { editorHints, renderRecordFields, collectRecordData } from '/assets/js/record-form.js';
import { renderInboxEntries } from '/inbox-view.js';

const state = {
  types: [],
  currentType: null,
  schema: null,
  records: [],
  members: [],
  editingKey: null,
  inboxEntry: null,
};

// Object schemas (site, publications) are a single record edited in place;
// array schemas are collections listed in a table.
function isSingleton() {
  return state.currentType.kind === 'object';
}

// The schema describing one record's fields.
function recordSchema() {
  return isSingleton() ? state.schema : state.schema.items;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Status messages (deploy/build results) sometimes embed a URL worth
// clicking (a pipeline run, a live site); this turns plain text into safe
// HTML with any http(s) URL as a real link instead of inert text.
function setStatusText(el, text) {
  el.innerHTML = escapeHTML(text).replace(
    /https?:\/\/[^\s]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  );
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.error || `Request failed: ${res.status}`);
    error.status = res.status;
    error.details = body?.details;
    error.body = body;
    throw error;
  }
  return body;
}

async function loadTypes() {
  state.types = await fetchJSON('/api/types');
  const nav = document.getElementById('type-nav');
  nav.innerHTML = state.types.map((t) => `<a href="#${t.name}" data-type="${t.name}">${t.name}</a>`).join('');
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-type]');
    if (!a) return;
    e.preventDefault();
    selectType(a.dataset.type);
  });
}

function navLink(name) {
  return document.querySelector(`#type-nav a[data-type="${name}"]`);
}

// Flags a category whose data cannot be loaded (e.g. the content host is
// unreachable) with an icon in the nav; the tooltip carries the reason.
function setLoadFailed(name, err) {
  const link = navLink(name);
  if (!link) return;
  link.classList.toggle('load-failed', Boolean(err));
  if (err) link.title = `Could not load ${name}: ${err.message}`;
  else link.removeAttribute('title');
}

function showLoadError(name, err) {
  const box = document.getElementById('load-error');
  box.innerHTML = `<span></span> <button type="button" id="retry-button">Retry</button>`;
  box.firstChild.textContent = `Could not load ${name}: ${err.message}`;
  box.querySelector('#retry-button').addEventListener('click', () => selectType(name));
  box.hidden = false;
  document.getElementById('table-body').hidden = true;
  document.getElementById('new-button').hidden = true;
  document.getElementById('form-panel').hidden = true;
}

// Checks every category up front so failures are flagged in the nav without
// having to click each one. Requests run in parallel.
function probeTypes() {
  for (const { name } of state.types) {
    fetchJSON(`/api/data/${name}`)
      .then(() => setLoadFailed(name, null))
      .catch((err) => setLoadFailed(name, err));
  }
}

async function selectType(name) {
  state.currentType = state.types.find((t) => t.name === name);
  document.querySelectorAll('#type-nav a').forEach((a) => a.classList.toggle('active', a.dataset.type === name));
  document.getElementById('type-title').textContent = name;
  document.getElementById('load-error').hidden = true;
  document.getElementById('table-body').hidden = true;
  document.getElementById('new-button').hidden = true;
  document.getElementById('form-panel').hidden = true;
  const loading = document.getElementById('loading');
  loading.hidden = false;
  // Rapid clicks can leave several loads in flight; only the latest may render.
  const token = (selectType.latest = Symbol());
  try {
    state.schema = await fetchJSON(`/api/schema/${name}`);
    state.records = await fetchJSON(`/api/data/${name}`);
    if (name === 'projects') {
      state.members = await fetchJSON('/api/data/members');
    }
  } catch (err) {
    setLoadFailed(name, err);
    if (selectType.latest !== token) return;
    loading.hidden = true;
    showLoadError(name, err);
    return;
  }
  setLoadFailed(name, null);
  if (selectType.latest !== token) return;
  loading.hidden = true;
  document.getElementById('table-body').hidden = isSingleton();
  document.getElementById('new-button').hidden = isSingleton();
  if (isSingleton()) {
    renderForm(state.records);
    hideFormError();
    document.getElementById('form-panel').hidden = false;
    document.getElementById('form-title').textContent = 'Properties';
    state.editingKey = null;
  } else {
    renderTable();
    hideForm();
  }
}

function recordKey(record, index) {
  return state.currentType.keyField ? record[state.currentType.keyField] : String(index);
}

// Columns shown in the record list: the schema's "columns" hint, else the first property.
function listColumns() {
  const columns = editorHints(state.schema).columns;
  return columns?.length ? columns : Object.keys(recordSchema().properties).slice(0, 1);
}

// Translates the schema's "sort" hint (field name(s) + direction) into a
// DataTables `order` array of [columnIndex, direction] pairs, so the table's
// initial sort matches today's behavior while leaving ongoing sorting to the
// user via the column headers DataTables adds.
function initialOrder(columns) {
  const sort = editorHints(state.schema).sort;
  if (!sort) return [];
  const direction = sort.order === 'desc' ? 'desc' : 'asc';
  return [].concat(sort.by)
    .map((field) => columns.indexOf(field))
    .filter((index) => index !== -1)
    .map((index) => [index, direction]);
}

// Holds the live DataTables instance so a type switch can tear it down before
// the table markup is replaced. DataTables' own `destroy: true` init option
// instead restores the DOM to whatever it looked like at the *first* ever
// init of this table node before reinitializing — which would clobber the
// fresh rows below with the previous type's data — so destroying explicitly,
// before rewriting the markup, is required here.
let dataTable = null;

function renderTable() {
  if (dataTable) {
    dataTable.destroy();
    dataTable = null;
  }
  const columns = listColumns();
  document.querySelector('#records-table thead').innerHTML =
    `<tr>${columns.map((c) => `<th>${escapeHTML(c)}</th>`).join('')}<th>Actions</th></tr>`;
  const tbody = document.querySelector('#records-table tbody');
  tbody.innerHTML = state.records
    .map((record, index) => {
      const key = recordKey(record, index);
      return `<tr>
        ${columns.map((c) => `<td class="cell-${escapeHTML(c)}">${escapeHTML(record[c])}</td>`).join('')}
        <td class="row-actions">
          <button type="button" data-action="edit" data-key="${escapeHTML(key)}">Edit</button>
          <button type="button" data-action="delete" data-key="${escapeHTML(key)}">Delete</button>
        </td>
      </tr>`;
    })
    .join('');
  dataTable = new DataTable('#records-table', {
    paging: false,
    order: initialOrder(columns),
    columnDefs: [{ targets: -1, orderable: false, searchable: false }],
  });
}

function findRecordByKey(key) {
  return state.records.find((record, index) => recordKey(record, index) === key);
}

function hideFormError() {
  const message = document.getElementById('form-message');
  message.hidden = true;
  message.textContent = '';
  const el = document.getElementById('form-error');
  el.hidden = true;
  el.textContent = '';
}

function showFormMessage(message) {
  const el = document.getElementById('form-message');
  el.textContent = message;
  el.hidden = false;
}

function showFormError(message, details) {
  const el = document.getElementById('form-error');
  const detailText = Array.isArray(details) ? details.map((d) => `${d.instancePath || '(root)'}: ${d.message}`).join('\n') : '';
  el.textContent = detailText ? `${message}\n${detailText}` : message;
  el.hidden = false;
}

function renderForm(record) {
  const form = document.getElementById('record-form');
  form.innerHTML = '';
  renderRecordFields(form, { itemSchema: recordSchema(), record, typeName: state.currentType.name, members: state.members });

  const actions = document.createElement('div');
  actions.className = 'field';
  actions.innerHTML = isSingleton()
    ? '<button type="submit">Save</button>'
    : '<button type="submit">Save</button> <button type="button" id="cancel-button">Cancel</button>';
  form.appendChild(actions);
  form.querySelector('#cancel-button')?.addEventListener('click', hideForm);
}

function openForm(key, prefill) {
  state.editingKey = key;
  document.getElementById('form-title').textContent = state.inboxEntry
    ? `Review submission: ${state.currentType.name}`
    : key === null ? `New ${state.currentType.name}` : `Edit ${state.currentType.name}`;
  hideFormError();
  renderForm(prefill ?? (key === null ? {} : findRecordByKey(key)));
  document.getElementById('form-panel').hidden = false;
}

function hideForm() {
  document.getElementById('form-panel').hidden = true;
  state.editingKey = null;
  state.inboxEntry = null;
}

function collectFormData() {
  return collectRecordData(document.getElementById('record-form'), {
    itemSchema: recordSchema(),
    typeName: state.currentType.name,
    singleton: isSingleton(),
  });
}

async function deleteRecordByKey(key) {
  const name = state.currentType.name;
  if (!confirm(`Delete this ${name} record?`)) return;
  try {
    await fetchJSON(`/api/data/${name}/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 409 && name === 'members') {
      const titles = err.body.affectedProjects.map((p) => p.title).join(', ');
      if (!confirm(`This member is a participant in: ${titles}. Delete anyway and remove them from these projects?`)) return;
      await fetchJSON(`/api/data/${name}/${encodeURIComponent(key)}?confirm=true`, { method: 'DELETE' });
    } else {
      alert(err.message);
      return;
    }
  }
  await selectType(name);
}

document.getElementById('records-table').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const key = button.dataset.key;
  if (button.dataset.action === 'edit') openForm(key);
  if (button.dataset.action === 'delete') deleteRecordByKey(key);
});

document.getElementById('new-button').addEventListener('click', () => openForm(null));

document.getElementById('record-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = collectFormData();
  const name = state.currentType.name;
  try {
    if (isSingleton()) {
      await fetchJSON(`/api/data/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await selectType(name);
      showFormMessage('Saved.');
      return;
    }
    if (state.editingKey === null) {
      await fetchJSON(`/api/data/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetchJSON(`/api/data/${name}/${encodeURIComponent(state.editingKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    if (state.inboxEntry) {
      const entry = state.inboxEntry;
      await fetchJSON(`/api/inbox/${encodeURIComponent(entry.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      });
      loadInbox();
    }
    await selectType(name);
  } catch (err) {
    showFormError(err.message, err.details);
  }
});

document.getElementById('preview-button').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const status = document.getElementById('preview-status');
  button.disabled = true;
  status.className = 'tool-status';
  status.textContent = 'Building…';
  try {
    await fetchJSON('/api/build', { method: 'POST' });
    // The tab is opened only now, so it never shows a blank page while
    // building. The await may have outlived the click's user-activation
    // window and the browser may block the popup, so also offer a link.
    status.textContent = 'Built. ';
    const link = document.createElement('a');
    link.href = '/preview/index.html';
    link.target = '_blank';
    link.textContent = 'Open preview';
    status.append(link);
    window.open(link.href, '_blank');
  } catch (err) {
    status.classList.add('error');
    setStatusText(status, err.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('deploy-button').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const status = document.getElementById('deploy-status');
  button.disabled = true;
  status.className = 'tool-status';
  status.textContent = 'Requesting rebuild…\nWaiting for it to finish, this can take a few minutes.';
  try {
    const { results } = await fetchJSON('/api/deploy', { method: 'POST' });
    setStatusText(status, results.map((r) => `[${r.name}] ${r.message}`).join('\n'));
    if (results.some((r) => !r.ok)) status.classList.add('error');
  } catch (err) {
    status.classList.add('error');
    const details = Array.isArray(err.details)
      ? err.details.map((d) => `\n• ${d.instancePath || '/'} ${d.message}`).join('')
      : '';
    setStatusText(status, err.message + details);
  } finally {
    button.disabled = false;
  }
});

fetchJSON('/api/site')
  .then(({ url }) => {
    if (!url) return;
    const link = document.getElementById('site-link');
    link.href = url;
    link.hidden = false;
  })
  .catch(() => {}); // the link is a convenience; the editor works without it

const inboxPanel = document.getElementById('inbox-panel');
let inboxEntries = [];

async function loadInbox() {
  const status = document.getElementById('inbox-status');
  status.textContent = 'Checking for submissions…';
  try {
    const body = await fetchJSON('/api/inbox');
    if (!body.enabled) return;
    inboxEntries = body.entries;
    document.getElementById('inbox-tool').hidden = false;
    document.getElementById('inbox-button').textContent = `Inbox (${inboxEntries.length})`;
    const notes = [];
    if (body.dropped) notes.push(`${body.dropped} invalid message(s) ignored.`);
    if (body.warning) notes.push(body.warning);
    status.textContent = notes.join(' ');
    status.classList.toggle('error', Boolean(body.warning));
    renderInboxEntries(document.getElementById('inbox-list'), inboxEntries, { onReview: reviewSubmission, onReject: rejectSubmission });
  } catch (err) {
    status.textContent = err.message;
    status.classList.add('error');
  }
}

async function reviewSubmission(entry) {
  inboxPanel.hidden = true;
  await selectType(entry.type);
  state.inboxEntry = entry;
  openForm(entry.key, entry.prefill);
}

async function rejectSubmission(entry) {
  if (!confirm('Reject this submission?')) return;
  await fetchJSON(`/api/inbox/${encodeURIComponent(entry.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject' }),
  });
  await loadInbox();
}

document.getElementById('inbox-button').addEventListener('click', () => { inboxPanel.hidden = false; });
document.getElementById('inbox-close').addEventListener('click', () => { inboxPanel.hidden = true; });
document.getElementById('inbox-refresh').addEventListener('click', loadInbox);
loadInbox();

loadTypes().then(() => {
  if (state.types.length) selectType(state.types[0].name);
  probeTypes();
});
