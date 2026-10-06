import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicEditConfig } from '../scripts/lib/public-edit.mjs';

test('getPublicEditConfig is null when NTFY_TOPIC is unset or blank', () => {
  assert.equal(getPublicEditConfig({}), null);
  assert.equal(getPublicEditConfig({ NTFY_TOPIC: '  ' }), null);
});

test('getPublicEditConfig defaults the server and strips trailing slashes', () => {
  assert.deepEqual(getPublicEditConfig({ NTFY_TOPIC: 'abc_123' }), { server: 'https://ntfy.sh', topic: 'abc_123' });
  assert.deepEqual(getPublicEditConfig({ NTFY_TOPIC: 'abc', NTFY_SERVER: 'https://ntfy.example.org/' }), {
    server: 'https://ntfy.example.org', topic: 'abc',
  });
});

test('getPublicEditConfig rejects unsafe topics and servers', () => {
  assert.throws(() => getPublicEditConfig({ NTFY_TOPIC: 'a/b' }), /NTFY_TOPIC/);
  assert.throws(() => getPublicEditConfig({ NTFY_TOPIC: 'x'.repeat(65) }), /NTFY_TOPIC/);
  assert.throws(() => getPublicEditConfig({ NTFY_TOPIC: 'abc', NTFY_SERVER: 'javascript:alert(1)' }), /NTFY_SERVER/);
});
