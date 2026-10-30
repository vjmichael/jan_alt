import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsonMergePatch } from '../lu-tauri-merge-patch.mjs'

test('Linux overlay deletes inherited Windows binaries under Tauri merge semantics', () => {
  const base = { bundle: { targets: ['nsis'], resources: {
    'resources/bin/': 'bin/', 'resources/lu-inference/': 'lu-inference/',
  } }, app: { windows: [{ title: 'Windows', windowEffects: { effects: ['mica'] } }] } }
  const overlay = { bundle: { targets: ['deb'], resources: { 'resources/bin/': null } },
    app: { windows: [{ title: 'Lu Linux' }] } }
  const resolved = jsonMergePatch(base, overlay)
  assert.deepEqual(resolved.bundle.targets, ['deb'])
  assert.deepEqual(resolved.bundle.resources, {
    'resources/lu-inference/': 'lu-inference/',
  })
  assert.deepEqual(resolved.app.windows, [{ title: 'Lu Linux' }])
  assert.ok(Object.hasOwn(base.bundle.resources, 'resources/bin/'))
})

test('merely omitting Windows resources does not remove them from an overlay', () => {
  const resolved = jsonMergePatch({ bundle: { resources: { 'resources/bin/': 'bin/' } } },
    { bundle: { resources: { 'resources/lu-inference/': 'lu-inference/' } } })
  assert.ok(Object.hasOwn(resolved.bundle.resources, 'resources/bin/'))
})
