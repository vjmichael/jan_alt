// The standalone plugin has no lockfile. Inspect its two handler lists against
// the permission generator while the desktop CI compiles the locked Lu feature.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src-tauri/plugins/tauri-plugin-agent-tools/src/lib.rs', 'utf8')
const build = fs.readFileSync('src-tauri/plugins/tauri-plugin-agent-tools/build.rs', 'utf8')
const between = (text, start, end) => {
  const first = text.indexOf(start)
  assert.notEqual(first, -1, `Missing ${start}`)
  const last = text.indexOf(end, first + start.length)
  assert.notEqual(last, -1, `Missing ${end}`)
  return text.slice(first + start.length, last)
}
const names = (text) => [...text.matchAll(/commands::([a-z_]+)/g)].map((match) => match[1])
const common = names(between(source, 'tauri::generate_handler![', '$($jan_only,)*'))
const jan = names(between(source, 'agent_tools_handler![\n        commands::execute_tool,', ']);'))
jan.unshift('execute_tool')
const generated = [...between(build, 'const COMMANDS: &[&str] = &[', '];').matchAll(/"([a-z_]+)"/g)]
  .map((match) => match[1])
const distinct = (list, label) => {
  assert.equal(new Set(list).size, list.length, `Duplicate ${label} command`)
  return [...list].sort()
}
assert.match(source, /#\[cfg\(feature = "lu-distribution"\)\]\s*let builder = builder\.invoke_handler\(agent_tools_handler!\[\]\)/)
assert.match(source, /#\[cfg\(not\(feature = "lu-distribution"\)\)\]\s*let builder = builder\.invoke_handler\(agent_tools_handler!\[/)
assert.deepEqual(distinct([...common, ...jan], 'Jan handler'), distinct(generated, 'permission generator'))
for (const command of jan) {
  assert.ok(!common.includes(command), `Cowork handler ${command} remains registered in Lu`)
}
const defaults = fs.readFileSync('src-tauri/plugins/tauri-plugin-agent-tools/permissions/default.toml', 'utf8')
for (const command of generated) {
  assert.ok(defaults.includes(`allow-${command.replaceAll('_', '-')}`), `Missing permission for ${command}`)
}
console.log(`Lu registers ${common.length} shared commands; Jan retains ${jan.length} legacy commands; all ${generated.length} have generated permissions`)
