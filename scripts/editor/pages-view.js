import { escapeHTML } from '../../assets/js/shared.js';

export function hidePagesPanels(doc = document) {
  doc.getElementById('pages-panel').hidden = true;
  doc.getElementById('page-new-panel').hidden = true;
  doc.getElementById('page-editor-panel').hidden = true;
}

export function initPagesView({
  doc = document,
  fetchFn = (...args) => fetch(...args),
  confirmFn = (message) => confirm(message),
  alertFn = (message) => alert(message),
  DataTableCtor = globalThis.DataTable,
  EditorCtor = globalThis.toastui?.Editor,
} = {}) {
  const state = { current: null, editor: null };
  let pagesDataTable = null;

  async function fetchJSON(url, options) {
    const res = await fetchFn(url, options);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.error || `Request failed: ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return body;
  }

  const typePanel = () => doc.getElementById('type-panel');
  const formPanel = () => doc.getElementById('form-panel');
  const pagesPanel = doc.getElementById('pages-panel');
  const newPanel = doc.getElementById('page-new-panel');
  const editorPanel = doc.getElementById('page-editor-panel');

  function showList() {
    typePanel().hidden = true;
    formPanel().hidden = true;
    newPanel.hidden = true;
    editorPanel.hidden = true;
    pagesPanel.hidden = false;
  }

  function destroyEditor() {
    if (state.editor) {
      state.editor.destroy();
      state.editor = null;
    }
  }

  async function loadList() {
    const loading = doc.getElementById('pages-loading');
    const errorBox = doc.getElementById('pages-load-error');
    errorBox.hidden = true;
    loading.hidden = false;
    // Rapid clicks can leave several loads in flight; only the latest may render.
    const token = (loadList.latest = Symbol());
    let pages;
    try {
      pages = await fetchJSON('/api/pages');
    } catch (err) {
      if (loadList.latest !== token) return;
      loading.hidden = true;
      errorBox.textContent = `Could not load pages: ${err.message}`;
      errorBox.hidden = false;
      return;
    }
    if (loadList.latest !== token) return;
    loading.hidden = true;
    renderList(pages);
  }

  function renderList(pages) {
    if (pagesDataTable) {
      pagesDataTable.destroy();
      pagesDataTable = null;
    }
    doc.querySelector('#pages-table thead').innerHTML = '<tr><th>Title</th><th>Filename</th><th>Type</th><th>Actions</th></tr>';
    const tbody = doc.querySelector('#pages-table tbody');
    tbody.innerHTML = pages
      .map(
        (page) => `<tr data-filename="${escapeHTML(page.filename)}">
          <td>${escapeHTML(page.title)}</td>
          <td>${escapeHTML(page.filename)}</td>
          <td>${escapeHTML(page.type)}</td>
          <td class="row-actions"><button type="button" data-action="delete" data-filename="${escapeHTML(page.filename)}">Delete</button></td>
        </tr>`
      )
      .join('');
    pagesDataTable = new DataTableCtor('#pages-table', {
      paging: false,
      order: [[0, 'asc']],
      columnDefs: [{ targets: -1, orderable: false, searchable: false }],
    });
  }

  function showEditorMessage(text) {
    const el = doc.getElementById('page-editor-message');
    el.textContent = text;
    el.hidden = !text;
  }

  function showEditorError(text) {
    const el = doc.getElementById('page-editor-error');
    el.textContent = text;
    el.hidden = !text;
  }

  function mountEditor(page) {
    destroyEditor();
    state.current = page;
    doc.getElementById('page-editor-title').textContent = page.filename;
    doc.getElementById('page-html-notice').hidden = page.type !== 'html';
    showEditorMessage('');
    showEditorError('');
    const host = doc.getElementById('page-editor-host');
    host.innerHTML = '';
    if (typeof EditorCtor !== 'function') {
      showEditorError('Could not load the page editor — the editor script failed to load. Reload this page; if the problem persists, check your network connection to this server.');
      return;
    }
    if (page.type === 'html') {
      state.editor = new EditorCtor({ el: host, initialEditType: 'wysiwyg', height: '480px' });
      state.editor.setHTML(page.content);
    } else {
      state.editor = new EditorCtor({ el: host, initialEditType: 'markdown', previewStyle: 'vertical', height: '480px', initialValue: page.content });
    }
  }

  async function openPage(filename) {
    typePanel().hidden = true;
    formPanel().hidden = true;
    pagesPanel.hidden = true;
    newPanel.hidden = true;
    editorPanel.hidden = false;
    // Rapid clicks can leave several loads in flight; only the latest may render.
    const token = (openPage.latest = Symbol());
    let page;
    try {
      page = await fetchJSON(`/api/pages/${encodeURIComponent(filename)}`);
    } catch (err) {
      if (openPage.latest !== token) return;
      showEditorError(err.message);
      return;
    }
    if (openPage.latest !== token) return;
    mountEditor(page);
  }

  async function savePage() {
    if (!state.current || !state.editor) return;
    showEditorMessage('');
    showEditorError('');
    const content = state.current.type === 'html' ? state.editor.getHTML() : state.editor.getMarkdown();
    try {
      const updated = await fetchJSON(`/api/pages/${encodeURIComponent(state.current.filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      state.current = updated;
      showEditorMessage('Saved.');
    } catch (err) {
      showEditorError(err.message);
    }
  }

  async function deletePage(filename) {
    if (!confirmFn(`Delete the page "${filename}"?`)) return;
    try {
      await fetchJSON(`/api/pages/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    } catch (err) {
      alertFn(err.message);
      return;
    }
    if (state.current && state.current.filename === filename) {
      destroyEditor();
      editorPanel.hidden = true;
      pagesPanel.hidden = false;
    }
    await loadList();
  }

  doc.getElementById('pages-nav-link').addEventListener('click', (e) => {
    e.preventDefault();
    showList();
    loadList();
  });

  doc.querySelector('#pages-table tbody').addEventListener('click', (e) => {
    const deleteButton = e.target.closest('button[data-action="delete"]');
    if (deleteButton) {
      e.stopPropagation();
      deletePage(deleteButton.dataset.filename);
      return;
    }
    const row = e.target.closest('tr[data-filename]');
    if (row) openPage(row.dataset.filename);
  });

  doc.getElementById('pages-new-button').addEventListener('click', () => {
    pagesPanel.hidden = true;
    newPanel.hidden = false;
    doc.getElementById('page-new-error').hidden = true;
    doc.getElementById('page-new-form').reset();
  });

  doc.getElementById('page-new-cancel').addEventListener('click', () => {
    newPanel.hidden = true;
    pagesPanel.hidden = false;
  });

  doc.getElementById('page-new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = doc.getElementById('page-new-title').value.trim();
    const format = doc.getElementById('page-new-format').value;
    const errorBox = doc.getElementById('page-new-error');
    errorBox.hidden = true;
    let page;
    try {
      page = await fetchJSON('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, format }),
      });
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      return;
    }
    newPanel.hidden = true;
    await openPage(page.filename);
  });

  doc.getElementById('page-save-button').addEventListener('click', savePage);
  doc.getElementById('page-delete-button').addEventListener('click', () => {
    if (state.current) deletePage(state.current.filename);
  });
  doc.getElementById('page-editor-close').addEventListener('click', () => {
    destroyEditor();
    editorPanel.hidden = true;
    pagesPanel.hidden = false;
    loadList();
  });
}
