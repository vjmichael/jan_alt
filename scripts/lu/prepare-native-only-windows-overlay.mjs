// Build-time only: replace Jan's *automatic Windows platform overlay* in an
// explicitly disposable checkout. Tauri merges tauri.windows.conf.json after
// the Lu configuration, so a Lu-only bundle.resources map is insufficient:
// Jan's bun/uv externalBin and jan-llama-worker resources otherwise return.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function prepareLuWindowsPlatformOverride(original, lu) {
  assert.deepEqual(original.bundle.targets, ['nsis','msi'],
    'Unexpected upstream Windows platform targets; review new config before rewriting')
  assert.ok(Array.isArray(original.bundle.resources))
  assert.ok(original.bundle.resources.includes('resources/bin/jan-llama-worker.exe'),
    'Upstream platform worker path not found; cannot safely assume old mappings')
  assert.deepEqual(original.bundle.externalBin, ['resources/bin/bun','resources/bin/uv'],
    'Upstream Jan Bun/UV paths changed; review packaging before proceeding')
  assert.equal(original.app?.windows?.[0]?.title,'Jan',
    'Windows platform identity has changed; refuse blind packaging rewrite')
  assert.equal(lu.productName,'Lu')
  assert.equal(lu.mainBinaryName,'Lu-Desktop')
  assert.equal(lu.identifier,'ai.lu.preview')
  assert.deepEqual(lu.bundle.targets,['nsis'])
  const resources=lu.bundle.resources
  assert.equal(resources['resources/lu-inference/'],'lu-inference/')
  for(const required of ['resources/LICENSE','resources/NOTICE','resources/licenses/Apache-2.0.txt']) {
    assert.ok(resources[required], 'Missing mandatory Jan/Apache attribution input '+required)
  }
  for(const key of Object.keys(resources)) {
    assert.ok(!/(?:resources\/bin|jan-llama-worker|(?:^|\/)bun(?:\/|\.|$)|(?:^|\/)uv(?:\/|\.|$))/i.test(key),
      'Lu resource config still includes inherited Jan runtime: '+key)
  }
  const webview=original.bundle.windows?.webviewInstallMode
  assert.equal(webview?.type,'downloadBootstrapper','Windows 10 WebView2 prerequisite mode changed')
  assert.equal(webview.silent,true)
  const override={
    bundle:{
      targets:['nsis'],
      resources:{...resources},
      externalBin:[],
      windows:{webviewInstallMode:{...webview}},
    },
  }
  assert.ok(!('app' in override),'Do not overwrite the Lu main-window title with Jan')
  assert.deepEqual(override.bundle.externalBin,[])
  assert.ok(!JSON.stringify(override).includes('resources/bin/'))
  return override
}

if (process.argv[1]?.endsWith('prepare-native-only-windows-overlay.mjs')) {
  assert.equal(process.env.LU_DISPOSABLE_BUILD,'1',
    'This transforms tracked Jan platform configuration only in explicitly disposable Lu build checkouts')
  const scratch=process.env.RUNNER_TEMP || process.env.LU_PLATFORM_BACKUP_DIR
  assert.ok(scratch && fs.statSync(scratch).isDirectory(),
    'Specify the disposable runner scratch for a preserved original configuration')
  const file='src-tauri/tauri.windows.conf.json'
  const originalBytes=fs.readFileSync(file)
  const original=JSON.parse(originalBytes.toString('utf8'))
  const lu=JSON.parse(fs.readFileSync('src-tauri/tauri.lu.conf.json','utf8'))
  const safe=prepareLuWindowsPlatformOverride(original,lu)
  const backup=path.join(scratch,'lu-original-tauri-windows-'+process.pid+'.json')
  fs.writeFileSync(backup,originalBytes,{flag:'wx'})
  const draft=file+'.lu-tmp-'+process.pid
  const bytes=Buffer.from(JSON.stringify(safe,null,2)+'\n')
  fs.writeFileSync(draft,bytes,{flag:'wx'})
  fs.renameSync(draft,file)
  const live=JSON.parse(fs.readFileSync(file,'utf8'))
  assert.deepEqual(live,safe,'Windows platform overlay changed after staging')
  console.log('LU_NATIVE_ONLY_WINDOWS_PLATFORM_OVERLAY_PASS original_sha256='+sha256(originalBytes)+
    ' override_sha256='+sha256(bytes)+
    ' Jan_worker=false Bun=false UV=false Lu_WebView2_bootstrap=true Lu_app_title_preserved=true')
}
