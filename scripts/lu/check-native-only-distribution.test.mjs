import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateLuNativeOnlyBundle } from './check-native-only-distribution.mjs'
const example = {
  productName: 'Lu', mainBinaryName: 'Lu-Desktop', identifier: 'ai.lu.preview',
  bundle: { targets: ['nsis'], resources: {
    'resources/LICENSE':'LICENSE','resources/NOTICE':'NOTICE',
    'resources/licenses/Apache-2.0.txt':'licenses/Apache-2.0.txt',
    'resources/lu-inference/':'lu-inference/'
  } },
  plugins: { updater: { endpoints: [] } },
}
describe('experimental Lu native-only NSIS source manifest', () => {
  it('accepts Lu-only engine and attribution', () => assert.equal(validateLuNativeOnlyBundle(example), true))
  it('rejects inherited binary resources', () => assert.throws(() =>
    validateLuNativeOnlyBundle({...example, bundle: {...example.bundle,
      resources: {...example.bundle.resources,'resources/bin/':'bin/'}}})))
  it('requires license notice', () => assert.throws(() =>
    validateLuNativeOnlyBundle({...example,bundle:{...example.bundle,resources:{'resources/lu-inference/':'lu-inference/'}}})))
  it('rejects legacy updater', () => assert.throws(() =>
    validateLuNativeOnlyBundle({...example, plugins:{updater:{endpoints:['https://apps.jan.ai']}}})))
  it('checks committed candidate configuration', () => {
    const file = new URL('../../src-tauri/tauri.lu.conf.json', import.meta.url)
    assert.equal(validateLuNativeOnlyBundle(JSON.parse(fs.readFileSync(file,'utf8'))), true)
  })
})
