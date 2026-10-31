import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {prepareLuWindowsPlatformOverride} from './prepare-native-only-windows-overlay.mjs'
const original=()=>JSON.parse(fs.readFileSync('src-tauri/tauri.windows.conf.json','utf8'))
const lu=()=>JSON.parse(fs.readFileSync('src-tauri/tauri.lu.conf.json','utf8'))
describe('native-only Windows Tauri platform config overlay',()=>{
  it('excludes Jan worker Bun/UV in the target-specific platform file',()=>{
    const cfg=prepareLuWindowsPlatformOverride(original(),lu())
    assert.equal(cfg.bundle.externalBin.length,0)
    assert.ok(!JSON.stringify(cfg).includes('resources/bin/'))
    assert.equal(cfg.bundle.targets.join(','),'nsis')
    assert.equal(cfg.bundle.resources['resources/lu-inference/'],'lu-inference/')
  })
  it('preserves Windows 10 WebView2 installer bootstrap and Lu title',()=>{
    const cfg=prepareLuWindowsPlatformOverride(original(),lu())
    assert.equal(cfg.bundle.windows.webviewInstallMode.type,'downloadBootstrapper')
    assert.equal(cfg.bundle.windows.webviewInstallMode.silent,true)
    assert.ok(!('app' in cfg))
  })
  it('does not modify original Jan source files',()=>{
    const before=fs.readFileSync('src-tauri/tauri.windows.conf.json')
    prepareLuWindowsPlatformOverride(original(),lu())
    const after=fs.readFileSync('src-tauri/tauri.windows.conf.json')
    assert.deepEqual(after,before)
  })
  it('fails closed on altered Jan worker config',()=>{
    const j=original();j.bundle.resources=j.bundle.resources.filter(x=>!x.includes('jan-llama-worker.exe'))
    assert.throws(()=>prepareLuWindowsPlatformOverride(j,lu()))
  })
  it('fails closed on changed Bun/UV externalBin',()=>{
    const j=original();j.bundle.externalBin=['resources/bin/bun']
    assert.throws(()=>prepareLuWindowsPlatformOverride(j,lu()))
  })
  it('fails closed on Lu runtime reintroduction',()=>{
    const cfg=lu();cfg.bundle.resources['resources/bin/']='bin/'
    assert.throws(()=>prepareLuWindowsPlatformOverride(original(),cfg))
  })
  it('fails closed when mandatory license mapping disappears',()=>{
    const cfg=lu();delete cfg.bundle.resources['resources/NOTICE']
    assert.throws(()=>prepareLuWindowsPlatformOverride(original(),cfg))
  })
})
