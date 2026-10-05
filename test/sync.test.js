import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHARED } from '../scripts/build-extension.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('shared files are in sync (run `npm run sync` if this fails)', () => {
  for (const [from, to] of SHARED) {
    assert.equal(readFileSync(root + to, 'utf8'), readFileSync(root + from, 'utf8'), `${to} is out of date`);
  }
});

test('extension manifest is valid MV3 with a side panel', () => {
  const m = JSON.parse(readFileSync(root + 'extension/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.side_panel.default_path, 'sidepanel.html');
  assert.ok(m.permissions.includes('sidePanel'));
  assert.ok(!m.permissions.includes('tabs'), 'avoid the scary "read your browsing history" warning');
});
