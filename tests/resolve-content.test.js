import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContent } from '../scripts/lib/resolve-content.mjs';

test('resolveContent returns the absolute path of a local directory as-is', async () => {
  const dir = await resolveContent('content');
  assert.ok(dir.endsWith('content'));
  assert.equal(dir.startsWith('/'), true);
});

test('resolveContent rejects a local path that does not exist', async () => {
  await assert.rejects(() => resolveContent('./does-not-exist'), /does not exist/);
});
