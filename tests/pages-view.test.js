import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initPagesView, hidePagesPanels } from '../scripts/editor/pages-view.js';

const PAGE_HTML = `
<a href="#" id="pages-nav-link">Pages</a>
<div id="type-panel"></div>
<div id="form-panel"></div>

<section id="pages-panel" hidden>
  <button id="pages-new-button" type="button">New</button>
  <div id="pages-loading" hidden></div>
  <div id="pages-load-error" hidden></div>
  <table id="pages-table"><thead></thead><tbody></tbody></table>
</section>

<div id="page-new-panel" hidden>
  <div id="page-new-error" hidden></div>
  <form id="page-new-form">
    <input id="page-new-title">
    <select id="page-new-format">
      <option value="markdown" selected>Markdown</option>
      <option value="html">HTML</option>
    </select>
    <button id="page-new-cancel" type="button">Cancel</button>
  </form>
</div>

<section id="page-editor-panel" hidden>
  <h1 id="page-editor-title"></h1>
  <button id="page-save-button" type="button">Save</button>
  <button id="page-delete-button" type="button">Delete</button>
  <button id="page-editor-close" type="button">Close</button>
  <p id="page-html-notice" hidden></p>
  <div id="page-editor-message" hidden></div>
  <div id="page-editor-error" hidden></div>
  <div id="page-editor-host"></div>
</section>
`;

class StubDataTable {
  constructor(selector, options) {
    this.selector = selector;
    this.options = options;
  }
  destroy() {}
}

let lastEditor;
class StubEditor {
  constructor(options) {
    this.options = options;
    this.value = options.initialValue ?? '';
    lastEditor = this;
  }
  setHTML(html) { this.value = html; }
  getHTML() { return this.value; }
  getMarkdown() { return this.value; }
  destroy() {}
}

function setup({ fetchFn, confirmFn = () => true, alertFn = () => {} } = {}) {
  const dom = new JSDOM(PAGE_HTML);
  const doc = dom.window.document;
  initPagesView({ doc, fetchFn, confirmFn, alertFn, DataTableCtor: StubDataTable, EditorCtor: StubEditor });
  return { dom, doc };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('clicking the Pages nav link hides the type panels and loads the list', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('type-panel').hidden = false;
  doc.getElementById('form-panel').hidden = false;

  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('type-panel').hidden, true);
  assert.equal(doc.getElementById('form-panel').hidden, true);
  assert.equal(doc.getElementById('pages-panel').hidden, false);
  assert.deepEqual(calls, ['/api/pages']);
  assert.equal(doc.querySelector('#pages-table tbody tr td').textContent, 'About');
});

test('a load error is shown and the list stays hidden', async () => {
  const fetchFn = async () => jsonResponse({ error: 'offline' }, 500);
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(doc.getElementById('pages-load-error').textContent, /offline/);
  assert.equal(doc.getElementById('pages-load-error').hidden, false);
});

test('clicking a row opens it in the editor with the loaded content', async () => {
  const fetchFn = async (url) => {
    if (url === '/api/pages') return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    if (url === '/api/pages/about.md') return jsonResponse({ filename: 'about.md', type: 'markdown', content: '# About' });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('page-editor-panel').hidden, false);
  assert.equal(doc.getElementById('pages-panel').hidden, true);
  assert.equal(doc.getElementById('page-editor-title').textContent, 'about.md');
  assert.equal(doc.getElementById('page-html-notice').hidden, true);
  assert.equal(lastEditor.options.initialEditType, 'markdown');
  assert.equal(lastEditor.value, '# About');
});

test('opening an html page mounts the editor in wysiwyg mode via setHTML and shows the fidelity notice', async () => {
  const fetchFn = async (url) => {
    if (url === '/api/pages') return jsonResponse([{ filename: 'example.html', type: 'html', title: 'Example' }]);
    if (url === '/api/pages/example.html') return jsonResponse({ filename: 'example.html', type: 'html', content: '<h1>Example</h1>' });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(lastEditor.options.initialEditType, 'wysiwyg');
  assert.equal(lastEditor.value, '<h1>Example</h1>');
  assert.equal(doc.getElementById('page-html-notice').hidden, false);
});

test('saving a markdown page PUTs getMarkdown() and shows a confirmation', async () => {
  const puts = [];
  const fetchFn = async (url, options) => {
    if (url === '/api/pages') return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    if (url === '/api/pages/about.md' && (!options || options.method === undefined)) {
      return jsonResponse({ filename: 'about.md', type: 'markdown', content: '# About' });
    }
    if (url === '/api/pages/about.md' && options.method === 'PUT') {
      puts.push(JSON.parse(options.body));
      return jsonResponse({ filename: 'about.md', type: 'markdown', content: JSON.parse(options.body).content });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  lastEditor.value = '# About\n\nEdited.';
  doc.getElementById('page-save-button').dispatchEvent(new doc.defaultView.Event('click'));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(puts, [{ content: '# About\n\nEdited.' }]);
  assert.match(doc.getElementById('page-editor-message').textContent, /Saved/);
});

test('deleting a page from the list asks for confirmation and removes the row', async () => {
  const deletes = [];
  let confirmed = false;
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse(
        confirmed
          ? []
          : [{ filename: 'about.md', type: 'markdown', title: 'About' }]
      );
    }
    if (url === '/api/pages/about.md' && options?.method === 'DELETE') {
      deletes.push(url);
      confirmed = true;
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const confirmCalls = [];
  const confirmFn = (message) => {
    confirmCalls.push(message);
    return true;
  };
  const { doc } = setup({ fetchFn, confirmFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.querySelector('#pages-table tbody button[data-action="delete"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(confirmCalls.length, 1);
  assert.deepEqual(deletes, ['/api/pages/about.md']);
  assert.equal(doc.querySelectorAll('#pages-table tbody tr').length, 0);
});

test('a failing delete calls alertFn and leaves the row in place', async () => {
  const alertCalls = [];
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    }
    if (url === '/api/pages/about.md' && options?.method === 'DELETE') {
      return jsonResponse({ error: 'locked' }, 500);
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn, alertFn: (message) => alertCalls.push(message) });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody button[data-action="delete"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(alertCalls, ['locked']);
  assert.equal(doc.querySelectorAll('#pages-table tbody tr').length, 1);
});

test('deleting from inside the open editor asks for confirmation and returns to the list', async () => {
  let confirmed = false;
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse(confirmed ? [] : [{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    }
    if (url === '/api/pages/about.md' && (!options || !options.method)) {
      return jsonResponse({ filename: 'about.md', type: 'markdown', content: '# About' });
    }
    if (url === '/api/pages/about.md' && options?.method === 'DELETE') {
      confirmed = true;
      return jsonResponse(null, 204);
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.getElementById('page-delete-button').dispatchEvent(new doc.defaultView.Event('click'));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('page-editor-panel').hidden, true);
  assert.equal(doc.getElementById('pages-panel').hidden, false);
});

test('closing the editor without saving returns to the list unchanged', async () => {
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    }
    if (url === '/api/pages/about.md') {
      return jsonResponse({ filename: 'about.md', type: 'markdown', content: '# About' });
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody tr').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.getElementById('page-editor-close').dispatchEvent(new doc.defaultView.Event('click'));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('page-editor-panel').hidden, true);
  assert.equal(doc.getElementById('pages-panel').hidden, false);
});

test('declining the confirmation does not delete', async () => {
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) {
      return jsonResponse([{ filename: 'about.md', type: 'markdown', title: 'About' }]);
    }
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn, confirmFn: () => false });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.querySelector('#pages-table tbody button[data-action="delete"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(doc.querySelectorAll('#pages-table tbody tr').length, 1);
});

test('creating a new page posts title and format, then opens the created page', async () => {
  const posts = [];
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) return jsonResponse([]);
    if (url === '/api/pages' && options.method === 'POST') {
      posts.push(JSON.parse(options.body));
      return jsonResponse({ filename: 'our-team.html', type: 'html', content: '<h1>Our Team</h1>\n', title: 'Our Team' }, 201);
    }
    if (url === '/api/pages/our-team.html') return jsonResponse({ filename: 'our-team.html', type: 'html', content: '<h1>Our Team</h1>\n' });
    throw new Error(`unexpected fetch: ${url} ${options?.method}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  doc.getElementById('pages-new-button').dispatchEvent(new doc.defaultView.Event('click'));
  assert.equal(doc.getElementById('page-new-panel').hidden, false);

  doc.getElementById('page-new-title').value = 'Our Team';
  doc.getElementById('page-new-format').value = 'html';
  doc.getElementById('page-new-form').dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(posts, [{ title: 'Our Team', format: 'html' }]);
  assert.equal(doc.getElementById('page-editor-panel').hidden, false);
  assert.equal(doc.getElementById('page-editor-title').textContent, 'our-team.html');
});

test('a failing create shows the error without leaving the new-page form', async () => {
  const fetchFn = async (url, options) => {
    if (url === '/api/pages' && (!options || !options.method)) return jsonResponse([]);
    if (url === '/api/pages' && options.method === 'POST') return jsonResponse({ error: 'A page named "x.md" already exists.' }, 409);
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { doc } = setup({ fetchFn });
  doc.getElementById('pages-nav-link').dispatchEvent(new doc.defaultView.Event('click', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  doc.getElementById('pages-new-button').dispatchEvent(new doc.defaultView.Event('click'));
  doc.getElementById('page-new-title').value = 'x';
  doc.getElementById('page-new-form').dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(doc.getElementById('page-new-panel').hidden, false);
  assert.match(doc.getElementById('page-new-error').textContent, /already exists/);
});

test('hidePagesPanels hides all three pages panels', () => {
  const dom = new JSDOM(PAGE_HTML);
  const doc = dom.window.document;
  doc.getElementById('pages-panel').hidden = false;
  doc.getElementById('page-new-panel').hidden = false;
  doc.getElementById('page-editor-panel').hidden = false;
  hidePagesPanels(doc);
  assert.equal(doc.getElementById('pages-panel').hidden, true);
  assert.equal(doc.getElementById('page-new-panel').hidden, true);
  assert.equal(doc.getElementById('page-editor-panel').hidden, true);
});
