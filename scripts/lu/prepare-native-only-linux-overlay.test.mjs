import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { prepareLuLinuxPlatformOverride } from './prepare-native-only-linux-overlay.mjs'

const load = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const upstream = load('src-tauri/tauri.linux.conf.json')
const common = load('src-tauri/tauri.lu.conf.json')
const linux = load('src-tauri/tauri.lu.linux.conf.json')
const clone = value => structuredClone(value)

test('Linux Lu Debian runtime excludes Jan worker, Bun, UV and inherited updater', () => {
  const original = JSON.stringify({ upstream, common, linux })
  const safe = prepareLuLinuxPlatformOverride(upstream, common, linux)
  assert.deepEqual(safe.bundle.targets, ['deb'])
  assert.deepEqual(safe.bundle.externalBin, [])
  assert.deepEqual(safe.bundle.linux.deb.files, {})
  assert.equal(safe.bundle.resources['resources/lu-inference/'], 'lu-inference/')
  assert.equal(safe.bundle.resources['resources/bin/'], undefined)
  assert.equal(safe.app.windows[0].title, linux.app.windows[0].title)
  assert.equal(JSON.stringify({ upstream, common, linux }), original, 'preparation may not mutate inputs')
})

test('Fails closed when unrecognized Jan target, worker, UV or Bun mapping appears', () => {
  for (const change of [
    x => x.bundle.targets.push('rpm'),
    x => x.bundle.resources.splice(x.bundle.resources.indexOf('resources/bin/jan-llama-worker'),1),
    x => x.bundle.externalBin.push('resources/bin/bun'),
    x => { x.bundle.linux.deb.files['usr/bin/bun'] = 'other/bun' },
    x => { x.app.windows[0].title = 'Something Else' },
  ]) {
    const changed = clone(upstream)
    change(changed)
    assert.throws(() => prepareLuLinuxPlatformOverride(changed, common, linux))
  }
})

test('Fails closed on missing engine, missing Apache attribution and identity drift', () => {
  for (const change of [
    x => { delete x.bundle.resources['resources/lu-inference/'] },
    x => { delete x.bundle.resources['resources/NOTICE'] },
    x => { x.identifier = 'jan.ai.app' },
    x => { x.bundle.resources['resources/bin/'] = 'resources/bin/' },
    x => { x.plugins = { updater: { endpoints: ['https://apps.jan.ai/update-check'] } } },
  ]) {
    const changed = clone(linux)
    change(changed)
    assert.throws(() => prepareLuLinuxPlatformOverride(upstream, common, changed))
  }
})
