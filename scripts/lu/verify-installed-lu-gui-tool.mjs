/**
 * LU-WIN-GUI-01: an unchanged installed NSIS Lu-Desktop, no debug build.
 * Debugging is enabled ONLY for this disposable Windows test process using
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS. CDP drives DOM controls; it must
 * never call the native tool IPC itself or supply the model's tool result.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'

export const SELECTORS = Object.freeze({
  picker: '[data-testid="lu-native-model-select"]',
  load: '[data-testid="lu-native-load"]',
  toggle: '[data-testid="lu-native-chat-toggle"]',
  firstInput: '[data-testid="lu-native-first-message"]',
  firstSend: '[data-testid="lu-native-first-send"]',
  threadInput: '[data-testid="chat-input"]',
  threadSend: '[data-testid="send-message-button"]',
  assistant: '[data-testid="message-item"][data-message-role="assistant"]',
  toolLabel: 'section:has([data-testid="lu-native-chat-toggle"])',
})
const sleep = ms => delay(ms)
const CHUNK = 500
const UI_WAIT_MS = 60_000
const GENERATION_WAIT_MS = 210_000
// Public logs contain ONLY this known stage enum, not arbitrary host errors.
let publicStage = "preflight"
let publicCdpStatus = "not-requested"
let publicHostExited = false

export function inside(root, candidate) {
  const r = resolve(root), c = resolve(candidate)
  const rel = relative(r, c)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}
export function safeThreadId(id) {
  return typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
}
export function readMessages(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    const parsed = JSON.parse(line)
    assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'corrupt JSONL row')
    return parsed
  })
}
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function persistedProof(messages, marker) {
  const matching = messages.filter(item => item.role === 'assistant' &&
    JSON.stringify(item.content).includes(marker))
  assert.equal(matching.length, 1, 'expected exactly one stored assistant containing tool-only proof')
  assert.equal(typeof matching[0].id, 'string')
  assert(matching[0].id.length > 0)
  return { assistantId: matching[0].id, contentHash: digest(matching[0].content) }
}
export function verifyJournalRecords(records, marker) {
  assert(records.length >= 6 && records.length <= 8, 'unexpected journal length for tool turn')
  assert.equal(records[0].kind, 'USER_REQUEST')
  assert.equal(records.at(-1).kind, 'FINAL_ANSWER')
  const kinds = records.map(r => r.kind)
  assert(!kinds.includes('REJECTED') && !kinds.includes('GENERATION_FAILURE'))
  assert.equal(kinds.filter(kind => kind === 'MODEL_OUTPUT').length, 2)
  assert.equal(kinds.filter(kind => kind === 'TOOL_FEEDBACK').length, 1)
  const first = records.find(r => r.kind === 'MODEL_OUTPUT')
  const proposed = JSON.parse(first.payload)
  assert.equal(proposed.kind, 'tool', 'real model must request a tool')
  assert.equal(proposed.name, 'lu_files_read_text', 'model must select the read tool')
  assert.equal(proposed.arguments?.path, 'notes.txt', 'tool must read isolated file')
  const feedback = JSON.parse(records.find(r => r.kind === 'TOOL_FEEDBACK').payload)
  assert.equal(feedback.name, 'lu_files_read_text')
  assert.equal(feedback.response?.ok, true)
  assert(JSON.stringify(feedback).includes(marker), 'actual tool feedback omitted file-only proof')
  assert(records.at(-1).payload.includes(marker), 'model continuation omitted tool result')
  return true
}
export function verifyJournal(dbPath, threadId, marker, prompt) {
  const db = new DatabaseSync(dbPath, { readonly: true })
  try {
    const rows = db.prepare(`SELECT task_id, kind, payload FROM lu_model_boundary_audit
      WHERE conversation_id = ? ORDER BY sequence ASC`).all(threadId)
    // The host reconstructs a bounded transcript from durable messages; the
  // audited USER_REQUEST includes prior context, not only the current text.
  const candidates = rows.filter(row => row.kind === 'USER_REQUEST' &&
    (row.payload === prompt || row.payload.endsWith(`\nCurrent user request:\n${prompt}`)))
    assert.equal(candidates.length, 1, 'expected one exact persisted USER request for tool turn')
    const taskId = candidates[0].task_id
    const taskRows = rows.filter(row => row.task_id === taskId)
    verifyJournalRecords(taskRows, marker)
    return { taskCount: new Set(rows.map(r => r.task_id)).size, modelOutputs: 2, nativeToolCalls: 1 }
  } finally { db.close() }
}
export async function until(label, fn, timeout = UI_WAIT_MS) {
  const end = Date.now() + timeout
  let lastError
  while (Date.now() < end) {
    try { const result = await fn(); if (result) return result } catch (error) { lastError = error }
    await sleep(CHUNK)
  }
  const cause = lastError instanceof Error && /socket|closed/i.test(lastError.message)
    ? ' (CDP was disconnected)' : ''
  throw new Error(`Lu installed GUI timeout at ${label}${cause}`)
}

export class CdpPage {
  constructor(ws) {
    this.ws = ws
    this.nextId = 0
    this.pending = new Map()
    ws.addEventListener('message', event => {
      let data
      try { data = JSON.parse(event.data) } catch { return }
      const deferred = this.pending.get(data.id)
      if (!deferred) return
      this.pending.delete(data.id)
      if (data.error) deferred.reject(new Error(`CDP protocol code ${data.error.code}`))
      else deferred.resolve(data.result)
    })
    ws.addEventListener('close', () => {
      for (const deferred of this.pending.values()) deferred.reject(new Error('CDP socket closed'))
      this.pending.clear()
    })
  }
  static async connect(port, timeout = 60_000, child = null) {
    publicCdpStatus = "port-unavailable"
    return until('installed WebView2 CDP target', async () => {
      if (child && child.exitCode !== null) {
        publicHostExited = true
        publicCdpStatus = "desktop-exited"
        return null
      }
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
      if (!response.ok) return null
      publicCdpStatus = "port-ready"
      const targets = await response.json()
      const pages = targets.filter(t => t.type === 'page' &&
        /^wss?:\/\/(127\.0\.0\.1|localhost):\d+\//.test(t.webSocketDebuggerUrl ?? '') &&
        /^([a-z]+:\/\/)?[^ ]/.test(t.url ?? ''))
      if (pages.length !== 1) { publicCdpStatus = "page-not-unique"; return null }
      publicCdpStatus = "page-found"
      const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
      publicCdpStatus = "websocket-attempted"
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
      })
      const page = new CdpPage(ws)
      await page.call('Runtime.enable')
      publicCdpStatus = "attached"
      return page
    }, timeout)
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      assert.equal(this.ws.readyState, WebSocket.OPEN, 'CDP socket unavailable')
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    })
    if (response.exceptionDetails) throw new Error('Lu WebView DOM script rejected')
    return response.result?.value
  }
  close() { this.ws.close() }
}
const dom = (expression) => `(() => { ${expression} })()`
const select = selector => `document.querySelector(${JSON.stringify(selector)})`
export async function uiClick(page, selector) {
  const result = await page.eval(dom(`const n = ${select(selector)}; if (!n || n.disabled) return false; n.click(); return true;`))
  assert.equal(result, true, `installed Lu control unavailable: ${selector}`)
}
export async function uiType(page, selector, text) {
  const result = await page.eval(dom(`const n=${select(selector)}; if(!(n instanceof HTMLTextAreaElement))return false;
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(n,${JSON.stringify(text)}); n.dispatchEvent(new Event('input',{bubbles:true}));
    n.dispatchEvent(new Event('change',{bubbles:true})); return true;`))
  assert.equal(result, true, 'Lu composer textarea unavailable')
}
async function uiStatus(page) {
  return page.eval(dom(`return {url:location.pathname, assistantCount:document.querySelectorAll(${JSON.stringify(SELECTORS.assistant)}).length,
    loaded:${select(SELECTORS.load)}?.textContent?.includes('Loaded')===true,
    toggle:${select(SELECTORS.toggle)}?.checked===true,
    toolLabel:${select(SELECTORS.toolLabel)}?.textContent?.match(/Last response:\\s*(\\d+)\\s+native tool call/ )?.[1] ?? null,
    proofText:Array.from(document.querySelectorAll(${JSON.stringify(SELECTORS.assistant)})).at(-1)?.textContent ?? ''};`))
}
async function findModelAndLoad(page, expectedName) {
  await until('Lu installed model picker', async () => page.eval(dom(`return !!${select(SELECTORS.picker)} && ${select(SELECTORS.picker)}.options.length>0;`)))
  const modelFound = await page.eval(dom(`return [...${select(SELECTORS.picker)}.options].some(o=>o.textContent.includes(${JSON.stringify(expectedName)}));`))
  assert(modelFound, 'pinned GGUF did not appear in installed Lu GUI picker')
  await uiClick(page, SELECTORS.load)
  await until('Lu installed GGUF load', async () => (await uiStatus(page)).loaded, 160_000)
  await uiClick(page, SELECTORS.toggle)
  assert((await uiStatus(page)).toggle, 'Lu native chat opt-in checkbox not active')
}
async function awaitAssistant(page, count, marker = null) {
  return until('real GGUF assistant completion', async () => {
    const status = await uiStatus(page)
    if (status.assistantCount <= count) return null
    if (marker && !status.proofText.includes(marker)) return null
    // A stop button replaces this control while streaming. Its existence is
    // the actual completion barrier; no fixed sleep can substitute.
    if (!await page.eval(dom(`return !!${select(SELECTORS.threadSend)};`))) return null
    return status
  }, GENERATION_WAIT_MS)
}
async function nextPort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).on('error', reject))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
// Wry/Tauri passes its own browser arguments; current WebView2 runtimes may
// ignore WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS in that case. Use the official
// per-executable HKCU policy ONLY on the disposable runner. Never overwrite
// an existing policy value; always delete the exact value on teardown.
const WIN_WEBVIEW_POLICY = 'HKCU\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments'
let ownsWebviewPolicy = false
function setDisposableWebviewPolicy(port) {
  if (!ownsWebviewPolicy) {
    const check = spawnSync('reg.exe', ['query', WIN_WEBVIEW_POLICY, '/v', 'Lu-Desktop.exe'], { windowsHide: true, stdio: 'ignore' })
    if (check.status === 0) throw new Error('refusing to overwrite preexisting WebView2 policy')
  }
  const value = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`
  const added = spawnSync('reg.exe', ['add', WIN_WEBVIEW_POLICY, '/v', 'Lu-Desktop.exe', '/t', 'REG_SZ', '/d', value, '/f'],
    { windowsHide: true, stdio: 'ignore' })
  if (added.status !== 0) throw new Error('WebView2 disposable browser policy not admitted')
  ownsWebviewPolicy = true
}
function clearDisposableWebviewPolicy() {
  if (!ownsWebviewPolicy) return
  spawnSync('reg.exe', ['delete', WIN_WEBVIEW_POLICY, '/v', 'Lu-Desktop.exe', '/f'], { windowsHide: true, stdio: 'ignore' })
  ownsWebviewPolicy = false
}
async function launchInstalled(executable, profileRoot, port) {
  setDisposableWebviewPolicy(port)
  const env = {
    ...process.env, JAN_DATA_ROOT: profileRoot, USERPROFILE: profileRoot,
    HOME: profileRoot, TEMP: join(profileRoot, 'tmp'), TMP: join(profileRoot, 'tmp'),
  }
  delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
  const child = spawn(executable, [], { cwd: dirname(executable), env, stdio: 'ignore', windowsHide: false })
  return child
}
async function exitInstalled(page, child) {
  // A normal UI-host exit, not a hidden tool invocation or forced process kill.
  const requested = await page.eval(dom(`const invoke=window.__TAURI_INTERNALS__?.invoke;
    if(typeof invoke!=='function')return false;
    setTimeout(()=>void invoke('confirm_exit').catch(()=>undefined),50); return true;`))
  assert.equal(requested, true, 'installed app cannot request safe exit')
  page.close()
  await until('installed Lu desktop process exit', async () => child.exitCode !== null, 25_000)
}
function validateInputs(executable, profileRoot, modelPath) {
  assert.equal(process.platform, 'win32', 'installed GUI gate only runs on Windows')
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'disposable CI approval absent')
  assert.equal(process.env.RUNNER_OS, 'Windows', 'not a disposable Windows runner')
  assert.equal(basename(executable), 'Lu-Desktop.exe', 'not the installed Lu executable')
  assert(isAbsolute(executable) && isAbsolute(profileRoot) && isAbsolute(modelPath))
  assert(inside(process.env.RUNNER_TEMP, executable))
  assert(inside(process.env.RUNNER_TEMP, profileRoot))
  assert(inside(process.env.RUNNER_TEMP, modelPath))
  assert(existsSync(executable) && existsSync(modelPath))
  assert(!existsSync(profileRoot), 'refusing to reuse existing test profile')
}
export function resolveInputs(args) {
  assert.equal(args.length, 3, 'expected executable, isolated profile and GGUF paths')
  return args.map(value => resolve(value))
}

/** Fast native NSIS UI preflight. No model, no tool, no conversation. */
export async function probeInstalledCdp(args) {
  publicStage = "cdp-preflight"
  assert.equal(args.length, 2, "CDP preflight requires app and disposable profile")
  const [exe, root] = args.map(value => resolve(value))
  assert.equal(process.platform, "win32")
  assert.equal(process.env.GITHUB_ACTIONS, "true")
  assert.equal(process.env.RUNNER_OS, "Windows")
  assert.equal(basename(exe), "Lu-Desktop.exe")
  assert(inside(process.env.RUNNER_TEMP, exe) && inside(process.env.RUNNER_TEMP, root))
  assert(existsSync(exe) && !existsSync(root), "invalid preflight paths")
  mkdirSync(join(root, "AppData", "Local"), { recursive: true })
  mkdirSync(join(root, "AppData", "Roaming", "Lu", "data"), { recursive: true })
  mkdirSync(join(root, "tmp"), { recursive: true })
  const port = await nextPort()
  let child, page
  try {
    child = await launchInstalled(exe, root, port)
    page = await CdpPage.connect(port, 60_000, child)
    await until("installed Lu WebView root", () =>
      page.eval("!!document.querySelector('#root')"), 30_000)
    await exitInstalled(page, child)
    child = undefined; page = undefined
    publicStage = "preflight-passed"
    console.log("LU_INSTALLED_GUI_CDP_PREFLIGHT_PASS real_installed_executable=true model=not_run tool=not_run")
  } finally {
    page?.close()
    if (child && child.exitCode === null) child.kill()
    clearDisposableWebviewPolicy()
  }
}

export async function main(args = process.argv.slice(2)) {
  assert.equal(args.length, 3, 'usage: node verify-installed-lu-gui-tool.mjs <installed Lu-Desktop.exe> <new runner profile> <pinned GGUF>')
  const [executable, root, sourceModel] = resolveInputs(args)
  validateInputs(executable, root, sourceModel)
  const data = join(root, 'AppData', 'Roaming', 'Lu', 'data')
  const catalog = join(data, 'lu-models')
  const filename = basename(sourceModel)
  assert.equal(filename, 'qwen2.5-0.5b-instruct-q4_k_m.gguf')
  publicStage = "prepare-profile"
  mkdirSync(catalog, { recursive: true })
  mkdirSync(join(root, 'AppData', 'Local'), { recursive: true })
  mkdirSync(join(root, 'tmp'), { recursive: true })
  const copied = join(catalog, filename)
  // The PowerShell launcher hashes the source model. No second 470 MB read
  // is needed in Node to copy it into the disposable installed profile.
  assert(!existsSync(copied), 'refusing to replace a prior GGUF')
  copyFileSync(sourceModel, copied)
  let child
  let page
  const unique = randomBytes(12).toString('hex').toUpperCase()
  const marker = `LU_GUI_FILE_PROOF_${unique}`
  const toolPrompt = 'Read notes.txt using the advertised lu_files_read_text tool. First respond with ONLY a JSON tool request, not Python, Markdown or prose. Do not invent or guess the file content. Once the tool result is provided, respond with ONLY a JSON final response containing the exact file marker.'
  try {
    publicStage = "launch-A"
    const port = await nextPort()
    child = await launchInstalled(executable, root, port)
    publicStage = "cdp-A"
    page = await CdpPage.connect(port, 60_000, child)
    publicStage = "model-load"
    await findModelAndLoad(page, filename)
    publicStage = "first-chat"
    await uiType(page, SELECTORS.firstInput, 'Give a short English greeting.')
    await uiClick(page, SELECTORS.firstSend)
    const threadId = await until('saved native conversation created', async () => {
      const uri = await page.eval('window.location.pathname')
      const id = typeof uri === 'string' && uri.startsWith('/threads/') ? uri.split('/')[2] : null
      return safeThreadId(id) && id
    })
    await awaitAssistant(page, 0)
    publicStage = "scratch-fixture"
    const threadRoot = join(data, 'agent-workspace', 'threads', threadId)
    mkdirSync(threadRoot, { recursive: true })
    const proofFile = join(threadRoot, 'notes.txt')
    writeFileSync(proofFile, marker + '\n', { flag: 'wx' })
    const before = (await uiStatus(page)).assistantCount
    publicStage = "model-tool-turn"
    await uiType(page, SELECTORS.threadInput, toolPrompt)
    await until('GUI send control enabled', () => page.eval(dom(`return !!${select(SELECTORS.threadSend)} && !${select(SELECTORS.threadSend)}.disabled;`)))
    await uiClick(page, SELECTORS.threadSend)
    const rendered = await awaitAssistant(page, before, marker)
    assert(Number(rendered.toolLabel) > 0, 'installed GUI never reported a real native tool call')
    const savedPath = join(data, 'threads', threadId, 'messages.jsonl')
    const proof = await until('tool assistant persisted to JSONL', () =>
      existsSync(savedPath) && persistedProof(readMessages(savedPath), marker), 30_000)
    publicStage = "audit-journal"
    const journalPath = join(data, 'lu-native-model-audit.sqlite3')
    const receipt = await until('native model/tool/final durable audit', () =>
      existsSync(journalPath) && verifyJournal(journalPath, threadId, marker, toolPrompt), 30_000)
    publicStage = "exit-A"
    await exitInstalled(page, child)
    page = undefined; child = undefined
    publicStage = "launch-B"
    const secondPort = await nextPort()
    child = await launchInstalled(executable, root, secondPort)
    publicStage = "cdp-B"
    page = await CdpPage.connect(secondPort, 60_000, child)
    await until('Lu thread list loaded after cold restart', async () =>
      page.eval(dom(`return !!document.querySelector(${JSON.stringify(SELECTORS.firstInput)});`)), UI_WAIT_MS)
    await page.eval(dom(`history.pushState({},'',${JSON.stringify(`/threads/${threadId}`)});window.dispatchEvent(new PopStateEvent('popstate'));return true;`))
    publicStage = "restore-B"
    const restored = await until('exact native tool answer restored after cold process restart', async () => {
      const state = await uiStatus(page)
      return state.proofText.includes(marker) ? state : null
    }, 60_000)
    const saved = readMessages(savedPath)
    const same = saved.filter(m => m.role === 'assistant' && m.id === proof.assistantId)
    assert.equal(same.length, 1, 'native assistant duplicated on restart')
    assert.equal(digest(same[0].content), proof.contentHash, 'native assistant changed on restart')
    assert(restored.proofText.includes(marker))
    // Strictly read-only: saved journal cannot gain a third model generation.
    const after = verifyJournal(journalPath, threadId, marker, toolPrompt)
    assert.equal(after.nativeToolCalls, receipt.nativeToolCalls)
    await exitInstalled(page, child)
    page = undefined; child = undefined
    publicStage = "passed"
    console.log('LU_INSTALLED_GUI_REAL_GGUF_TOOL_RESTART_PASS model=true tool=1 journal=true jsonl=true coldRestart=true legacyFallback=false')
  } finally {
    page?.close()
    if (child && child.exitCode === null) {
      // Do not mislabel forced teardown as a successful clean shutdown.
      child.kill()
      await delay(300)
    }
    clearDisposableWebviewPolicy()
  }
}

if (process.argv[1]?.endsWith('verify-installed-lu-gui-tool.mjs')) {
  const promise = process.argv[2] === '--probe-cdp' ? probeInstalledCdp(process.argv.slice(3)) : main()
  promise.catch(error => {
    // Never leak model text, paths, session tokens or debug-port addresses.
    console.error('LU_INSTALLED_GUI_REAL_GGUF_TOOL_RESTART_FAIL stage=' + publicStage +
      ' category=' + (error instanceof assert.AssertionError ? 'assertion' : 'runtime') +
      ' cdp=' + publicCdpStatus + ' hostExited=' + publicHostExited)
    process.exitCode = 1
  })
}
