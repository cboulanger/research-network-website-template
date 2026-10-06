// Form building shared by the editor and the public site. Must not touch `document` at import time.


// Presentation hints live in the schema under "x-editor": on the array schema
// (sort, columns) and on individual properties (widget, rows, readOnly, placeholder).
export function editorHints(schema) {
  return schema?.['x-editor'] || {};
}

export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function memberName(member) {
  return `${member.lastname}, ${member.firstname}`;
}

export function buildStringListField(key, values) {
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

export function buildParticipantPicker(participantIds, members) {
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
      const member = members.find((m) => m.id === id);
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
    members
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

export function buildField(key, propSchema, value, required) {
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

export function renderRecordFields(form, { itemSchema, record, typeName, members = [], skipReadOnly = false }) {
  const required = new Set(itemSchema.required || []);
  Object.entries(itemSchema.properties).forEach(([key, propSchema]) => {
    if (skipReadOnly && editorHints(propSchema).readOnly) return;
    if (typeName === 'projects' && key === 'participants') {
      form.appendChild(buildParticipantPicker(record.participants || [], members));
      return;
    }
    form.appendChild(buildField(key, propSchema, record[key], required.has(key)));
  });
}

export function collectRecordData(form, { itemSchema, typeName, singleton = false, skipReadOnly = false }) {
  const properties = itemSchema.properties;
  const data = {};
  Object.keys(properties).forEach((key) => {
    const propSchema = properties[key];
    if (skipReadOnly && editorHints(propSchema).readOnly) return;
    if (typeName === 'projects' && key === 'participants') {
      data.participants = form.querySelector('[data-field="participants"]').getParticipantIds();
      return;
    }
    if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
      const container = form.querySelector(`[data-field="${key}"]`);
      const items = [...container.querySelectorAll('input')].map((i) => i.value).filter((v) => v.trim() !== '');
      // Optional lists in a singleton are omitted when empty (they often have minItems: 1).
      if (items.length || !singleton) data[key] = items;
      return;
    }
    const input = form.querySelector(`#field-${key}`);
    if (input.value !== '') data[key] = input.value;
  });
  return data;
}
