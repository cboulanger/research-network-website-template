const state = {
  types: [],
  currentType: null,
  schema: null,
  records: [],
  members: [],
  editingKey: null,
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

async function selectType(name) {
  state.currentType = state.types.find((t) => t.name === name);
  state.schema = await fetchJSON(`/api/schema/${name}`);
  state.records = await fetchJSON(`/api/data/${name}`);
  if (name === 'projects') {
    state.members = await fetchJSON('/api/data/members');
  }
  document.querySelectorAll('#type-nav a').forEach((a) => a.classList.toggle('active', a.dataset.type === name));
  document.getElementById('type-title').textContent = name;
  renderTable();
  hideForm();
}

function recordKey(record, index) {
  return state.currentType.keyField ? record[state.currentType.keyField] : String(index);
}

function recordLabel(record) {
  if (record.title) return record.title;
  if (record.firstname || record.lastname) return `${record.firstname || ''} ${record.lastname || ''}`.trim();
  return record.date || JSON.stringify(record).slice(0, 40);
}

function renderTable() {
  document.querySelector('#records-table thead').innerHTML = '<tr><th>Record</th><th>Actions</th></tr>';
  const tbody = document.querySelector('#records-table tbody');
  tbody.innerHTML = state.records
    .map((record, index) => {
      const key = recordKey(record, index);
      return `<tr>
        <td>${escapeHTML(recordLabel(record))}</td>
        <td class="row-actions">
          <button type="button" data-action="edit" data-key="${escapeHTML(key)}">Edit</button>
          <button type="button" data-action="delete" data-key="${escapeHTML(key)}">Delete</button>
        </td>
      </tr>`;
    })
    .join('');
}

function findRecordByKey(key) {
  return state.records.find((record, index) => recordKey(record, index) === key);
}

function hideFormError() {
  const el = document.getElementById('form-error');
  el.hidden = true;
  el.textContent = '';
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

  const memberName = (member) => `${member.firstname} ${member.lastname}`;

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
      .filter((m) => !currentIds.includes(m.id) && memberName(m).toLowerCase().includes(q))
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
  const isAutoId = state.currentType.name === 'members' && key === 'id';
  const label = document.createElement('label');
  label.textContent = key + (required && !isAutoId ? ' *' : '');
  label.setAttribute('for', `field-${key}`);
  wrapper.appendChild(label);

  if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
    wrapper.appendChild(buildStringListField(key, value || []));
    return wrapper;
  }

  const input = key === 'description' ? document.createElement('textarea') : document.createElement('input');
  if (input.tagName === 'INPUT') input.type = 'text';
  input.id = `field-${key}`;
  input.name = key;
  input.value = value ?? '';
  if (propSchema.pattern) input.pattern = propSchema.pattern;
  if (required && !isAutoId) input.required = true;
  if (isAutoId) input.placeholder = 'Leave blank to auto-generate from name';
  wrapper.appendChild(input);
  return wrapper;
}

function renderForm(record) {
  const form = document.getElementById('record-form');
  const properties = state.schema.items.properties;
  const required = new Set(state.schema.items.required || []);
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
  actions.innerHTML = '<button type="submit">Save</button> <button type="button" id="cancel-button">Cancel</button>';
  form.appendChild(actions);
  form.querySelector('#cancel-button').addEventListener('click', hideForm);
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
  const properties = state.schema.items.properties;
  const data = {};
  Object.keys(properties).forEach((key) => {
    if (state.currentType.name === 'projects' && key === 'participants') {
      data.participants = form.querySelector('[data-field="participants"]').getParticipantIds();
      return;
    }
    const propSchema = properties[key];
    if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
      const container = form.querySelector(`[data-field="${key}"]`);
      data[key] = [...container.querySelectorAll('input')].map((i) => i.value).filter((v) => v.trim() !== '');
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

loadTypes().then(() => {
  if (state.types.length) selectType(state.types[0].name);
});
