const state = {
  types: [],
  currentType: null,
  schema: null,
  records: [],
  members: [],
  editingKey: null,
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

// Presentation hints live in the schema under "x-editor": on the array schema
// (sort, columns) and on individual properties (widget, rows, readOnly, placeholder).
function editorHints(schema) {
  return schema?.['x-editor'] || {};
}

function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function memberName(member) {
  return `${member.lastname}, ${member.firstname}`;
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

function buildStringListField(key, values) {
  const container = document.createElement('div');
  container.dataset.field = key;
  container.className = 'string-list';

  function addRow(value = '') {
    const row = document.createElement('div');
    row.className = 'array-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => row.remove());
    row.append(input, removeButton);
    container.appendChild(row);
  }

  values.forEach((v) => addRow(v));
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.textContent = 'Add';
  addButton.addEventListener('click', () => addRow());
  container.appendChild(addButton);
  return container;
}

function buildParticipantPicker(participantIds) {
  const container = document.createElement('div');
  container.className = 'field participant-picker';
  container.dataset.field = 'participants';

  const label = document.createElement('label');
  label.textContent = 'participants';
  container.appendChild(label);

  const list = document.createElement('ul');
  list.className = 'participant-list';
  container.appendChild(list);

  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search members by name…';
  container.appendChild(search);

  const results = document.createElement('div');
  results.className = 'participant-search-results';
  container.appendChild(results);

  let currentIds = [...participantIds];

  function renderList() {
    list.innerHTML = '';
    currentIds.forEach((id) => {
      const member = state.members.find((m) => m.id === id);
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = member ? memberName(member) : id;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        currentIds = currentIds.filter((existingId) => existingId !== id);
        renderList();
      });
      li.append(nameSpan, removeButton);
      list.appendChild(li);
    });
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) return;
    state.members
      .filter((m) => !currentIds.includes(m.id) && `${m.firstname} ${memberName(m)}`.toLowerCase().includes(q))
      .forEach((m) => {
        const row = document.createElement('div');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = memberName(m);
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = 'Add';
        addButton.addEventListener('click', () => {
          currentIds.push(m.id);
          search.value = '';
          results.innerHTML = '';
          renderList();
        });
        row.append(nameSpan, addButton);
        results.appendChild(row);
      });
  }

  search.addEventListener('input', () => renderResults(search.value));

  container.getParticipantIds = () => currentIds;
  renderList();
  return container;
}

function buildField(key, propSchema, value, required) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const hints = editorHints(propSchema);
  const readOnly = Boolean(hints.readOnly);
  const label = document.createElement('label');
  label.textContent = key + (required && !readOnly ? ' *' : '');
  label.setAttribute('for', `field-${key}`);
  wrapper.appendChild(label);
  if (propSchema.description) {
    const help = document.createElement('div');
    help.className = 'field-help';
    help.textContent = propSchema.description;
    wrapper.appendChild(help);
  }

  if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
    wrapper.appendChild(buildStringListField(key, value || []));
    return wrapper;
  }

  if (Array.isArray(propSchema.enum)) {
    const select = document.createElement('select');
    select.id = `field-${key}`;
    select.name = key;
    const selected = value ?? propSchema.default ?? propSchema.enum[0];
    for (const option of propSchema.enum) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (option === selected) opt.selected = true;
      select.appendChild(opt);
    }
    if (required && !readOnly) select.required = true;
    if (readOnly) select.disabled = true;
    wrapper.appendChild(select);
    return wrapper;
  }

  const input = hints.widget === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (input.tagName === 'INPUT') input.type = hints.widget === 'date' ? 'date' : 'text';
  if (hints.rows) input.rows = hints.rows;
  input.id = `field-${key}`;
  input.name = key;
  input.value = value ?? (hints.widget === 'date' ? todayISO() : '');
  // type=date ignores pattern and always yields YYYY-MM-DD, so only text inputs get it.
  if (propSchema.pattern && input.type === 'text') input.pattern = propSchema.pattern;
  if (required && !readOnly) input.required = true;
  if (readOnly) input.readOnly = true;
  if (hints.placeholder) input.placeholder = hints.placeholder;
  wrapper.appendChild(input);
  return wrapper;
}

function renderForm(record) {
  const form = document.getElementById('record-form');
  const properties = recordSchema().properties;
  const required = new Set(recordSchema().required || []);
  form.innerHTML = '';

  Object.entries(properties).forEach(([key, propSchema]) => {
    if (state.currentType.name === 'projects' && key === 'participants') {
      form.appendChild(buildParticipantPicker(record.participants || []));
      return;
    }
    form.appendChild(buildField(key, propSchema, record[key], required.has(key)));
  });

  const actions = document.createElement('div');
  actions.className = 'field';
  actions.innerHTML = isSingleton()
    ? '<button type="submit">Save</button>'
    : '<button type="submit">Save</button> <button type="button" id="cancel-button">Cancel</button>';
  form.appendChild(actions);
  form.querySelector('#cancel-button')?.addEventListener('click', hideForm);
}

function openForm(key) {
  state.editingKey = key;
  document.getElementById('form-title').textContent = key === null ? `New ${state.currentType.name}` : `Edit ${state.currentType.name}`;
  hideFormError();
  renderForm(key === null ? {} : findRecordByKey(key));
  document.getElementById('form-panel').hidden = false;
}

function hideForm() {
  document.getElementById('form-panel').hidden = true;
  state.editingKey = null;
}

function collectFormData() {
  const form = document.getElementById('record-form');
  const properties = recordSchema().properties;
  const data = {};
  Object.keys(properties).forEach((key) => {
    if (state.currentType.name === 'projects' && key === 'participants') {
      data.participants = form.querySelector('[data-field="participants"]').getParticipantIds();
      return;
    }
    const propSchema = properties[key];
    if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
      const container = form.querySelector(`[data-field="${key}"]`);
      const items = [...container.querySelectorAll('input')].map((i) => i.value).filter((v) => v.trim() !== '');
      // Optional lists in a singleton are omitted when empty (they often have minItems: 1).
      if (items.length || !isSingleton()) data[key] = items;
      return;
    }
    const input = form.querySelector(`#field-${key}`);
    if (input.value !== '') data[key] = input.value;
  });
  return data;
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
  // Opened synchronously, still inside the click's user-activation window, so
  // the browser doesn't treat it as an unrequested popup. Once the build
  // finishes below, its location is filled in; a tab left on about:blank
  // means the build failed (see the error branch). No "noopener": we need
  // the window reference back to redirect it once the build is done, and
  // this is our own local-only content (never a link to another site).
  const previewTab = window.open();
  try {
    await fetchJSON('/api/build', { method: 'POST' });
    status.textContent = 'Built.';
    if (previewTab) previewTab.location = '/preview/index.html';
  } catch (err) {
    status.classList.add('error');
    setStatusText(status, err.message);
    previewTab?.close();
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

loadTypes().then(() => {
  if (state.types.length) selectType(state.types[0].name);
  probeTypes();
});
