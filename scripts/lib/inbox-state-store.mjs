// Where the inbox keeps its state (last ntfy message seen, pending and resolved
// submissions). A store is { read(): text | null, write(text), quarantine(text) }.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readContentFile, writeContentFile } from './content-store.mjs';

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// A local file, written atomically.
export function fileStateStore(statePath) {
  return {
    async read() {
      try {
        return await readFile(statePath, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async write(text) {
      await mkdir(path.dirname(statePath), { recursive: true });
      const tmp = `${statePath}.tmp`;
      await writeFile(tmp, text);
      await rename(tmp, statePath);
    },
    async quarantine() {
      await rename(statePath, `${statePath}.corrupt-${stamp()}`);
    },
  };
}

// A file at the root of the content tree (local folder or WebDAV), so that every
// editor instance working on the same content shares one view of what was handled.
export function contentStateStore(contentPath, relPath = 'inbox-state.json') {
  return {
    async read() {
      try {
        return await readContentFile(contentPath, relPath);
      } catch (err) {
        if (err.code === 'ENOENT' || err.status === 404) return null;
        throw err;
      }
    },
    write: (text) => writeContentFile(contentPath, relPath, text),
    quarantine: (text) => writeContentFile(contentPath, `${relPath}.corrupt-${stamp()}`, text),
  };
}

// Reads fall back to the first legacy file that exists while the primary store is still empty
// (state kept in a local file before it moved into the content tree); writes go to the primary.
export function withLegacyFallback(primary, legacyPaths) {
  return {
    ...primary,
    async read() {
      const text = await primary.read();
      if (text !== null) return text;
      for (const legacyPath of legacyPaths) {
        const legacy = await fileStateStore(legacyPath).read();
        if (legacy !== null) return legacy;
      }
      return null;
    },
  };
}
