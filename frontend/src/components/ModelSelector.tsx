import { useState, useEffect, useRef, useCallback } from 'react'
import { listModels } from '../services/api'
import { loadApiKeys, saveApiKeys } from '../utils/apiKeys'

const CACHE_KEY = 'mangazap-models-cache'

function loadCache(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, string[]>): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

interface ModelSelectorProps {
  open: boolean
  onClose: () => void
  onSelect: (model: string) => void
  onOpenApiKeyModal: () => void
  currentModel: string
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function ModelSelector({ open, onClose, onSelect, onOpenApiKeyModal, currentModel, triggerRef }: ModelSelectorProps) {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)

  const hasApiKey = useCallback(() => {
    const keys = loadApiKeys()
    return !!(keys.text && keys.base_url)
  }, [])

  const fetchModels = useCallback(async () => {
    const keys = loadApiKeys()
    const apiKey = keys.text || ''
    const baseUrl = keys.base_url || ''

    if (!apiKey || !baseUrl) {
      setError('no_api_key')
      return
    }

    const cache = loadCache()
    const cached = cache[baseUrl]
    if (cached && cached.length > 0) {
      setModels(cached)
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await listModels(apiKey, baseUrl)
      const ids = data.models.map((m) => m.id)
      setModels(ids)
      const updatedCache = loadCache()
      updatedCache[baseUrl] = ids
      saveCache(updatedCache)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取模型列表失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Calculate fixed position when opening
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const longestModel = models.reduce((a, b) => (a.length > b.length ? a : b), '')
      const minWidth = Math.max(200, Math.min(400, longestModel.length * 10 + 80))
      const width = Math.max(minWidth, rect.width)

      // Check if there's enough space below
      const spaceBelow = window.innerHeight - rect.bottom
      const dropdownHeight = 280

      setDropdownStyle({
        position: 'fixed',
        top: spaceBelow > dropdownHeight + 16 ? rect.bottom + 8 : rect.top - dropdownHeight - 8,
        left: rect.left,
        width,
        maxWidth: 450,
      })
    }
  }, [open, triggerRef, models])

  useEffect(() => {
    if (open) {
      if (!hasApiKey()) {
        setError('no_api_key')
        return
      }
      const keys = loadApiKeys()
      const baseUrl = keys.base_url || ''
      const cache = loadCache()
      const cached = cache[baseUrl]
      if (cached && cached.length > 0) {
        setModels(cached)
        setError('')
      } else {
        fetchModels()
      }
    }
  }, [open, fetchModels, hasApiKey])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose, triggerRef])

  const handleSelect = (model: string) => {
    const keys = loadApiKeys()
    saveApiKeys({ ...keys, model })
    onSelect(model)
    onClose()
  }

  const handleManualSubmit = () => {
    if (!manualInput.trim()) return
    handleSelect(manualInput.trim())
    setManualInput('')
    setShowManual(false)
  }

  const handleRefresh = () => {
    const keys = loadApiKeys()
    const baseUrl = keys.base_url || ''
    const cache = loadCache()
    delete cache[baseUrl]
    saveCache(cache)
    fetchModels()
  }

  const handleConfigureApi = () => {
    onClose()
    onOpenApiKeyModal()
  }

  if (!open) return null

  return (
    <div
      ref={ref}
      className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-[9999]"
      style={dropdownStyle}
    >
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">选择模型</span>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-50"
          title="刷新模型列表"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      <div className="max-h-[280px] overflow-y-auto">
        {error === 'no_api_key' && (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-gray-300 mb-1">你还没有配置 API</p>
            <p className="text-xs text-gray-500 mb-4">请先配置 API Key 后再选择模型</p>
            <button
              onClick={handleConfigureApi}
              className="px-5 py-2 bg-gradient-to-r from-[#00aaff] to-[#aa88ff] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              去配置 API
            </button>
          </div>
        )}

        {loading && models.length === 0 && error !== 'no_api_key' && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">正在获取模型列表...</div>
        )}

        {error && error !== 'no_api_key' && models.length === 0 && (
          <div className="px-4 py-4 text-center">
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button
              onClick={() => setShowManual(true)}
              className="text-xs text-[#00aaff] hover:text-[#aa88ff] transition-colors"
            >
              手动输入模型名
            </button>
          </div>
        )}

        {models.map((model) => (
          <button
            key={model}
            onClick={() => handleSelect(model)}
            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 transition-colors flex items-center justify-between ${
              model === currentModel ? 'text-[#00aaff] bg-white/[0.03]' : 'text-gray-300'
            }`}
          >
            <span className="truncate pr-4">{model}</span>
            {model === currentModel && <span className="text-xs shrink-0">✓ 当前</span>}
          </button>
        ))}

        {models.length > 0 && (
          <button
            onClick={() => setShowManual(!showManual)}
            className="w-full px-4 py-2.5 text-left text-xs text-gray-500 hover:text-white hover:bg-white/5 transition-colors border-t border-white/5"
          >
            {showManual ? '收起手动输入' : '手动输入模型名'}
          </button>
        )}

        {showManual && (
          <div className="px-4 py-3 border-t border-white/5">
            <div className="flex gap-2">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                placeholder="输入模型名称..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#00aaff]/40"
                autoFocus
              />
              <button
                onClick={handleManualSubmit}
                disabled={!manualInput.trim()}
                className="px-3 py-2 bg-[#00aaff]/20 hover:bg-[#00aaff]/30 disabled:opacity-30 text-[#00aaff] text-sm rounded-lg transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
