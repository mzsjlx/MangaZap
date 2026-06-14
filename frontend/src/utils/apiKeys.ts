const STORAGE_KEY = 'mangazap-api-keys'
const XOR_KEY = 'mangazap-v2'

function xorEncode(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length))
  }
  return btoa(result)
}

function xorDecode(encoded: string): string {
  try {
    const text = atob(encoded)
    let result = ''
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length))
    }
    return result
  } catch {
    return ''
  }
}

export function saveApiKeys(keys: Record<string, string>): void {
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(keys)) {
    if (v && v.trim()) filtered[k] = v.trim()
  }
  const encoded: Record<string, string> = {}
  for (const [k, v] of Object.entries(filtered)) {
    encoded[k] = xorEncode(v)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(encoded))
}

export function loadApiKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const encoded = JSON.parse(raw)
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(encoded)) {
      if (typeof v === 'string') {
        result[k] = xorDecode(v)
      }
    }
    return result
  } catch {
    return {}
  }
}

export function hasApiKey(type: string): boolean {
  const keys = loadApiKeys()
  return !!(keys[type] && keys[type].trim())
}

export function clearApiKeys(): void {
  localStorage.removeItem(STORAGE_KEY)
}
