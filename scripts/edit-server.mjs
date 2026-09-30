import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { readContentFile, writeContentFile } from './lib/content-store.mjs';
import { getEditableTypes } from './lib/editable-types.mjs';
import { findRecordIndex, replaceRecord, deleteRecord } from './lib/record-store.mjs';
import { cascadeDeleteMember, findProjectsReferencingMember } from './lib/member-cascade.mjs';
import { computeMemberId } from '../assets/js/shared.js';

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html' },
  '/index.html': { file: 'index.html', type: 'text/html' },
  '/app.js': { file: 'app.js', type: 'text/javascript' },
  '/style.css': { file: 'style.css', type: 'text/css' },
};

export function createServer({ contentPath, schemaDir, editorDir }) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const types = getEditableTypes(schemaDir);
  const typeByName = new Map(types.map((t) => [t.name, t]));
  const validators = new Map(types.map((t) => [t.name, ajv.compile(t.schema)]));

  function sendJSON(res, statusCode, body) {
    const text = body === null ? '' : JSON.stringify(body);
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  }

  function sendError(res, statusCode, message, details) {
    sendJSON(res, statusCode, details ? { error: message, details } : { error: message });
  }

  async function readJSONBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      const error = new Error('Request body is not valid JSON');
      error.statusCode = 400;
      throw error;
    }
  }

  async function loadRecords(name) {
    return JSON.parse(await readContentFile(contentPath, `data/${name}.json`));
  }

  function validateOrThrow(name, records) {
    const validate = validators.get(name);
    if (!validate(records)) {
      const error = new Error(`${name} failed schema validation`);
      error.statusCode = 400;
      error.details = validate.errors;
      throw error;
    }
  }

  async function saveRecords(name, records) {
    validateOrThrow(name, records);
    await writeContentFile(contentPath, `data/${name}.json`, JSON.stringify(records, null, 2) + '\n');
  }

  function uniqueMemberId(existingMembers, firstname, lastname) {
    const usedIds = new Set(existingMembers.map((m) => m.id));
    const base = computeMemberId(firstname, lastname);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  async function handleDeleteMember(res, url, memberId) {
    const confirmed = url.searchParams.get('confirm') === 'true';
    const members = await loadRecords('members');
    const projects = await loadRecords('projects');
    if (findRecordIndex(members, 'id', memberId) === -1) {
      return sendError(res, 404, `No members record for key "${memberId}"`);
    }
    const affected = findProjectsReferencingMember(projects, memberId);
    if (affected.length > 0 && !confirmed) {
      return sendJSON(res, 409, { affectedProjects: affected.map((p) => ({ id: p.id, title: p.title })) });
    }
    const { members: updatedMembers, projects: updatedProjects } = cascadeDeleteMember(members, projects, memberId);
    try {
      validateOrThrow('members', updatedMembers);
      validateOrThrow('projects', updatedProjects);
    } catch (err) {
      return sendError(res, err.statusCode || 500, err.message, err.details);
    }
    await writeContentFile(contentPath, 'data/members.json', JSON.stringify(updatedMembers, null, 2) + '\n');
    await writeContentFile(contentPath, 'data/projects.json', JSON.stringify(updatedProjects, null, 2) + '\n');
    return sendJSON(res, 204, null);
  }

  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    if (parts.length === 2 && parts[1] === 'types' && req.method === 'GET') {
      return sendJSON(res, 200, types.map((t) => ({ name: t.name, keyField: t.keyField })));
    }

    if (parts.length === 3 && parts[1] === 'schema' && req.method === 'GET') {
      const type = typeByName.get(parts[2]);
      if (!type) return sendError(res, 404, `Unknown type "${parts[2]}"`);
      return sendJSON(res, 200, type.schema);
    }

    if (parts[1] === 'data' && parts.length >= 3) {
      const name = parts[2];
      const type = typeByName.get(name);
      if (!type) return sendError(res, 404, `Unknown type "${name}"`);
      const key = parts.length === 4 ? decodeURIComponent(parts[3]) : null;

      if (req.method === 'GET' && parts.length === 3) {
        return sendJSON(res, 200, await loadRecords(name));
      }

      if (req.method === 'POST' && parts.length === 3) {
        const body = await readJSONBody(req);
        const records = await loadRecords(name);
        const record = { ...body };
        if (name === 'members') {
          const existingIds = new Set(records.map((m) => m.id));
          if (!record.id) {
            record.id = uniqueMemberId(records, record.firstname, record.lastname);
          } else if (existingIds.has(record.id)) {
            let id = record.id;
            let suffix = 2;
            while (existingIds.has(id)) {
              id = `${record.id}-${suffix}`;
              suffix += 1;
            }
            record.id = id;
          }
        }
        try {
          await saveRecords(name, [...records, record]);
        } catch (err) {
          return sendError(res, err.statusCode || 500, err.message, err.details);
        }
        return sendJSON(res, 201, record);
      }

      if (req.method === 'PUT' && parts.length === 4) {
        const body = await readJSONBody(req);
        const records = await loadRecords(name);
        const updated = replaceRecord(records, type.keyField, key, body);
        if (!updated) return sendError(res, 404, `No ${name} record for key "${key}"`);
        try {
          await saveRecords(name, updated);
        } catch (err) {
          return sendError(res, err.statusCode || 500, err.message, err.details);
        }
        return sendJSON(res, 200, body);
      }

      if (req.method === 'DELETE' && parts.length === 4) {
        if (name === 'members') return handleDeleteMember(res, url, key);
        const records = await loadRecords(name);
        const updated = deleteRecord(records, type.keyField, key);
        if (!updated) return sendError(res, 404, `No ${name} record for key "${key}"`);
        try {
          await saveRecords(name, updated);
        } catch (err) {
          return sendError(res, err.statusCode || 500, err.message, err.details);
        }
        return sendJSON(res, 204, null);
      }
    }

    return sendError(res, 404, 'Not found');
  }

  function serveStatic(res, pathname) {
    const entry = STATIC_FILES[pathname];
    if (!entry) return sendError(res, 404, 'Not found');
    const body = readFileSync(path.join(editorDir, entry.file));
    res.writeHead(200, { 'Content-Type': entry.type });
    res.end(body);
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((err) => sendError(res, err.statusCode || 500, err.message, err.details));
    } else {
      serveStatic(res, url.pathname);
    }
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer({
    contentPath: process.env.CONTENT_PATH || './content',
    schemaDir: path.join(__dirname, '..', 'schema'),
    editorDir: path.join(__dirname, 'editor'),
  });
  const port = Number(process.env.EDIT_PORT) || 4848;
  server.listen(port, '127.0.0.1', () => {
    console.log(`Data editor running at http://127.0.0.1:${port}`);
  });
}
