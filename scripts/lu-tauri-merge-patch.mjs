// RFC 7396 semantics for preflight of Tauri configuration overrides.
// Only a predictive check; the real Tauri CLI still owns application bundling.
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

export function jsonMergePatch(target, patch) {
  if (!plainObject(patch)) return patch
  const result = plainObject(target) ? { ...target } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key]
    else result[key] = jsonMergePatch(result[key], value)
  }
  return result
}
