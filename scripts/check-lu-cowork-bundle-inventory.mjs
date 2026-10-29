// This reports actual Rollup chunk membership after the branded production build.
// It is an inventory gate; absence of Cowork is a later, separate release gate.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const path = 'web-app/.lu-bundle-modules.json'
const modules = JSON.parse(fs.readFileSync(path, 'utf8'))
assert.ok(Array.isArray(modules) && modules.length > 0, 'Lu bundle inventory is empty')
assert.ok(modules.some(({ module }) => module === 'web-app/src/routes/index.tsx'), 'Lu home missing from bundle inventory')
const cowork = modules.filter(({ module }) => /(?:cowork|artifacts)/i.test(module))
assert.ok(
  !modules.some(({ module }) => module === 'web-app/src/components/left-sidebar/NavCowork.tsx'),
  'Lu bundle still imports Jan Cowork sidebar'
)
assert.ok(
  !modules.some(({ module }) => module === 'web-app/src/hooks/useCoworkConfig.ts'),
  'Lu bundle still imports Jan Cowork configuration'
)
for (const module of [
  'web-app/src/hooks/useCoworkRun.ts',
  'web-app/src/lib/coworkTurns.ts',
]) {
  assert.ok(!modules.some((entry) => entry.module === module), `Lu bundle still imports ${module}`)
}
console.log(`Lu optimized source modules: ${modules.length}; Cowork/Artifacts path matches: ${cowork.length}`)
for (const { module, chunks } of cowork) console.log(`${module}: ${chunks.join(', ')}`)
