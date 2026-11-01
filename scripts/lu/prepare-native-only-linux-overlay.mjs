// Disposable Lu Linux build overlay. Tauri auto-merges tauri.linux.conf.json
// after Lu custom configs; without a safe replacement Jan's bun/uv/worker
// resources and window title can silently reappear in the Debian package.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { jsonMergePatch } from '../lu-tauri-merge-patch.mjs'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const LICENSES = ['resources/LICENSE', 'resources/NOTICE', 'resources/licenses/Apache-2.0.txt']
const forbiddenRuntime = /(?:resources\/bin|jan-llama-worker|(?:^|\/)bun(?:\/|\.|$)|(?:^|\/)uv(?:\/|\.|$))/i

export function prepareLuLinuxPlatformOverride(upstream, common, linux) {
  assert.deepEqual(upstream.bundle?.targets, ['deb', 'appimage'],
    'Upstream Linux targets changed; review the platform before transforming it')
  assert.ok(Array.isArray(upstream.bundle?.resources) &&
    upstream.bundle.resources.includes('resources/bin/jan-llama-worker'),
    'Expected Jan worker resource not present; do not blindly rewrite unknown config')
  assert.deepEqual(upstream.bundle?.externalBin, ['resources/bin/uv'],
    'Jan Linux UV external binary changed; audit new upstream source')
  assert.equal(upstream.bundle?.linux?.deb?.files?.['usr/bin/bun'], 'resources/bin/bun',
    'Jan Linux Bun Debian payload changed; audit before overwriting')
  assert.equal(upstream.app?.windows?.[0]?.title, 'Jan',
    'Expected upstream Jan window not present; audit before overwriting')
  assert.equal(common.productName, 'Lu')
  assert.equal(common.mainBinaryName, 'Lu-Desktop')
  assert.equal(common.identifier, 'ai.lu.preview')
  assert.equal(linux.productName, common.productName)
  assert.equal(linux.mainBinaryName, common.mainBinaryName)
  assert.equal(linux.identifier, common.identifier)
  assert.deepEqual(common.bundle?.targets, ['nsis'])
  assert.deepEqual(linux.bundle?.targets, ['deb'])
  assert.equal(linux.bundle?.resources?.['resources/bin/'], null,
    'Linux Lu config must delete the inherited Windows legacy resources')
  // Require Linux-specific explicit packaging admission: an omitted field must
  // not accidentally inherit a Windows-only resource through the common merge.
  for (const key of LICENSES) {
    assert.ok(linux.bundle?.resources?.[key],
      `Linux Lu resource provenance changed or missing: ${key}`)
  }
  assert.equal(linux.bundle?.resources?.['resources/lu-inference/'], 'lu-inference/',
    'Linux Lu must explicitly select its pinned native engine resource')
  const lu = jsonMergePatch(common, linux)
  const resources = lu.bundle.resources
  assert.ok(resources && !Array.isArray(resources), 'Expected Lu named resource map')
  for (const key of LICENSES) {
    assert.ok(resources[key], `Lu package missing required Apache/Jan provenance: ${key}`)
  }
  assert.equal(resources['resources/lu-inference/'], 'lu-inference/',
    'Lu Linux native engine package missing')
  for (const key of Object.keys(resources)) {
    assert.ok(!forbiddenRuntime.test(key), `Jan runtime leaked into Lu: ${key}`)
  }
  assert.deepEqual(lu.plugins?.updater?.endpoints, [],
    'Lu preview must not use Jan updater endpoints')
  const luWindow = linux.app?.windows
  assert.ok(Array.isArray(luWindow) && luWindow.length === 1 &&
    luWindow[0]?.label === 'main' && luWindow[0]?.title?.startsWith('Lu'),
    'One Lu main window is required')
  assert.ok(!JSON.stringify(luWindow).includes('mica'),
    'Linux Lu window cannot use Windows-only title effects')
  const safe = {
    app: { windows: structuredClone(luWindow) },
    bundle: {
      targets: ['deb'],
      resources: { ...resources },
      externalBin: [],
      linux: { deb: { files: {} } },
    },
  }
  assert.ok(!forbiddenRuntime.test(JSON.stringify(safe.bundle)),
    'Jan executable references survived Linux package rewrite')
  return safe
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.env.LU_DISPOSABLE_BUILD, '1',
    'Only a disposable Lu build checkout may rewrite a tracked platform config')
  assert.equal(process.platform, 'linux', 'Linux platform override must run on Linux')
  const scratch = process.env.RUNNER_TEMP || process.env.LU_PLATFORM_BACKUP_DIR
  assert.ok(scratch && fs.statSync(scratch).isDirectory(),
    'Provide a real scratch directory to preserve upstream Linux config')
  const filename = 'src-tauri/tauri.linux.conf.json'
  const original = fs.readFileSync(filename)
  const upstream = JSON.parse(original.toString('utf8'))
  const common = JSON.parse(fs.readFileSync('src-tauri/tauri.lu.conf.json', 'utf8'))
  const linux = JSON.parse(fs.readFileSync('src-tauri/tauri.lu.linux.conf.json', 'utf8'))
  const override = prepareLuLinuxPlatformOverride(upstream, common, linux)
  const backup = path.join(scratch, `lu-original-tauri-linux-${process.pid}.json`)
  fs.writeFileSync(backup, original, { flag: 'wx' })
  const destination = filename + `.lu-tmp-${process.pid}`
  const result = Buffer.from(JSON.stringify(override, null, 2) + '\n')
  fs.writeFileSync(destination, result, { flag: 'wx' })
  fs.renameSync(destination, filename)
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), override)
  console.log(`LU_NATIVE_ONLY_LINUX_PLATFORM_OVERLAY_PASS original_sha256=${sha256(original)} override_sha256=${sha256(result)} Jan_worker=false Bun=false UV=false Lu_engine=true`)
}
