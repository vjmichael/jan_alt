import { describe, expect, it } from 'vitest'
import { explainLuNativeFailure } from '../luNativeError'

describe('Lu native first-run recovery classification', () => {
  it.each([
    ['GGUF model not found', 'GGUF'],
    ['Vulkan backend unavailable', 'compute backend'],
    ['SHA256 checksum mismatch', 'verify'],
    ['failed to spawn engine process', 'start'],
    ['out of memory allocation failed', 'memory'],
    ['request cancelled', 'cancelled'],
    ['permission denied: C:\\\\Users\\\\secret', 'denied'],
    ['Invalid Lu native turn result: token=secret', 'Invalid Lu native turn result.'],
  ])('shows recovery guidance for %s', (input, expected) => {
    expect(explainLuNativeFailure(input)).toContain(expected)
  })
  it('does not leak host paths or secret fragments in visible errors', () => {
    const input = 'C:\\Users\\secret-person\\AppData\\Roaming\\Lu\\api_key=shhh engine launch failed'
    const result = explainLuNativeFailure(input)
    expect(result).not.toMatch(/secret-person|api_key|AppData|shhh/)
  })
  it('uses generic guidance for unknown exceptions', () => {
    expect(explainLuNativeFailure({ toString: () => 'token=private' })).not.toContain('private')
  })
})
