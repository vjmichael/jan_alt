import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export const NATIVE_MODEL_ID = 'lu-native-e2e-probe'
export const NATIVE_PROBE_TRIGGER = 'NATIVE_TOOL_E2E_TRIGGER'
export const NATIVE_ALLOWED_CALL = 'call_lu_allowed_read'
export const NATIVE_DENIED_CALL = 'call_lu_denied_escape'

type ChatMessage = {
  role?: string
  content?: unknown
  tool_call_id?: string
}
type ChatBody = {
  model?: string
  stream?: boolean
  messages?: ChatMessage[]
  tools?: Array<{ type: string; function?: { name?: string } }>
}
type ToolResult = { tool_call_id: string; content: string }

export type NativeToolMock = {
  baseUrl: string
  modelId: string
  apiKey: string
  requestedToolNames: string[][]
  toolResults: ToolResult[]
  close: () => Promise<void>
}

const completionId = 'chatcmpl-lu-native-tool-e2e'

function sendJson(res: ServerResponse, code: number, obj: unknown) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(obj))
}

function frame(res: ServerResponse, delta: Record<string, unknown>, finish: string | null) {
  res.write('data: ' + JSON.stringify({
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: NATIVE_MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finish }],
  }) + '\n\n')
}

function startStream(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
}

function endStream(res: ServerResponse) {
  res.write('data: ' + JSON.stringify({
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: NATIVE_MODEL_ID,
    choices: [],
    usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
  }) + '\n\n')
  res.end('data: [DONE]\n\n')
}

function sendText(res: ServerResponse, text: string) {
  startStream(res)
  frame(res, { role: 'assistant', content: '' }, null)
  frame(res, { content: text }, null)
  frame(res, {}, 'stop')
  endStream(res)
}

function sendNativeCalls(res: ServerResponse) {
  startStream(res)
  frame(res, { role: 'assistant', content: '' }, null)
  // A model-originated OpenAI-compatible tool-calls SSE packet. Two separate
  // real native tools exercise the Rust Protobuf adapter and sandbox gate.
  frame(res, {
    tool_calls: [
      {
        index: 0,
        id: NATIVE_ALLOWED_CALL,
        type: 'function',
        function: { name: 'lu_files_read_text', arguments: '{"path":"allowed.txt"}' },
      },
      {
        index: 1,
        id: NATIVE_DENIED_CALL,
        type: 'function',
        function: { name: 'lu_files_read_text', arguments: '{"path":"../outside.txt"}' },
      },
    ],
  }, null)
  frame(res, {}, 'tool_calls')
  endStream(res)
}

function userText(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  if (!last) return ''
  return typeof last.content === 'string' ? last.content : JSON.stringify(last.content ?? '')
}

async function bodyText(req: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of req) {
    body += String(chunk)
    if (body.length > 1024 * 1024) throw new Error('Oversized native tool test request')
  }
  return body
}

/**
 * Deterministic external-model fixture, not a simulated Lu native tool.
 * All tool execution occurs inside the actual Lu Rust host on a Windows VM.
 * We record OpenAI-compatible tool-output messages returning to the model.
 */
export async function startNativeToolMock(): Promise<NativeToolMock> {
  const requestedToolNames: string[][] = []
  const toolResults: ToolResult[] = []
  const apiKey = 'e2e-local-native-tool-fixture'
  const server: Server = createServer((req, res) => {
    void (async () => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' })
        res.end()
        return
      }
      if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
        sendJson(res, 200, { object: 'list', data: [{ id: NATIVE_MODEL_ID, object: 'model', owned_by: 'lu-native-ci' }] })
        return
      }
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/chat/completions')) {
        sendJson(res, 404, { error: { message: 'unsupported native fixture route' } })
        return
      }
      if (req.headers.authorization !== 'Bearer ' + apiKey) {
        sendJson(res, 401, { error: { message: 'invalid local mock credential' } })
        return
      }
      const data = JSON.parse(await bodyText(req)) as ChatBody
      const messages = Array.isArray(data.messages) ? data.messages : []
      if (!data.stream) {
        sendJson(res, 200, {
          id: completionId,
          object: 'chat.completion',
          model: NATIVE_MODEL_ID,
          choices: [{ index: 0, message: { role: 'assistant', content: 'Lu Native Tool Test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 },
        })
        return
      }

      requestedToolNames.push((data.tools ?? []).map(t => t.function?.name ?? ''))
      const outgoing = messages.filter(m => m.role === 'tool' && typeof m.tool_call_id === 'string')
      if (outgoing.length >= 2) {
        for (const msg of outgoing) {
          if (!toolResults.some(x => x.tool_call_id === msg.tool_call_id)) {
            toolResults.push({ tool_call_id: msg.tool_call_id!, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) })
          }
        }
        sendText(res, 'Lu native tool results received from the Windows host.')
        return
      }
      if (userText(messages).includes(NATIVE_PROBE_TRIGGER)) {
        sendNativeCalls(res)
      } else {
        sendText(res, 'Lu workspace initialized.')
      }
    })().catch(err => {
      if (!res.headersSent) sendJson(res, 500, { error: { message: String(err) } })
      else res.end()
    })
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => ok())
  })
  const addr = server.address() as AddressInfo
  return {
    baseUrl: 'http://127.0.0.1:' + addr.port + '/v1',
    modelId: NATIVE_MODEL_ID,
    apiKey,
    requestedToolNames,
    toolResults,
    close: () => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())),
  }
}
