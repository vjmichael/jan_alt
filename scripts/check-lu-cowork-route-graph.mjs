// Check the generated Lu route graph after the actual branded Vite build.
// A hidden sidebar is insufficient if routes still import Cowork code.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const path = 'web-app/src/routeTree.gen.ts'
const tree = fs.readFileSync(path, 'utf8')
for (const route of [
  "'./routes/cowork'",
  "'./routes/artifacts'",
  "'./routes/settings/cowork'",
]) {
  assert.ok(!tree.includes(route), `Lu route graph still imports ${route}`)
}
assert.ok(tree.includes("'./routes/threads/$threadId'"), 'Lu chat thread route missing')
assert.ok(tree.includes("'./routes/index'"), 'Lu home route missing')
console.log('Lu generated route graph excludes Cowork routes and retains chat')
