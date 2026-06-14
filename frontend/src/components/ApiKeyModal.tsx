import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react'
import { saveApiKeys, loadApiKeys } from '../utils/apiKeys'
import { API_PROVIDERS } from '../config/wizardSteps'
import { listModels } from '../services/api'

interface ApiKeyModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function ApiKeyModal({ open, onClose, onSaved }: ApiKeyModalProps) {
  const existing = loadApiKeys()
  const [provider, setProvider] = useState(existing.provider || 'mimo')
  const [apiKey, setApiKey] = useState(existing.text || '')
  const [baseUrl, setBaseUrl] = useState(existing.base_url || '')
  const [model, setModel] = useState(existing.model || '')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const [imageApiKey, setImageApiKey] = useState(existing.image_api_key || '')
  const [imageModel, setImageModel] = useState(existing.image_model || 'agnes-image-2.0-flash')
  const [imageBaseUrl, setImageBaseUrl] = useState(existing.image_base_url || 'https://apihub.agnes-ai.com/v1')
  const [showImageKey, setShowImageKey] = useState(false)

  // Voice model states
  const [voiceModel, setVoiceModel] = useState(existing.voice_model || 'mimo-v2.5-tts')
  const [voiceUseSame, setVoiceUseSame] = useState(existing.voice_use_same !== 'false')
  const [voiceApiKey, setVoiceApiKey] = useState(existing.voice_api_key || '')
  const [voiceBaseUrl, setVoiceBaseUrl] = useState(existing.voice_base_url || '')

  // Video model states
  const [videoModel, setVideoModel] = useState(existing.video_model || 'agnes-video-v2.0')
  const [videoUseSame, setVideoUseSame] = useState(existing.video_use_same !== 'false')
  const [videoApiKey, setVideoApiKey] = useState(existing.video_api_key || '')
  const [videoBaseUrl, setVideoBaseUrl] = useState(existing.video_base_url || '')
  const [showVideoKey, setShowVideoKey] = useState(false)

  // Model fetching states
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)

  useEffect(() => {
    if (!open) return
    const p = API_PROVIDERS.find((pr) => pr.id === provider)
    if (p && provider !== 'custom') {
      setBaseUrl(p.baseUrl)
      setModel(p.model)
    }
  }, [provider, open])

  useEffect(() => {
    if (open) {
      const keys = loadApiKeys()
      setProvider(keys.provider || 'mimo')
      setApiKey(keys.text || '')
      setBaseUrl(keys.base_url || '')
      setModel(keys.model || '')
      setSaved(false)
      setModels([])
      setModelsError('')
      setShowManualInput(false)
      setImageApiKey(keys.image_api_key || '')
      setImageModel(keys.image_model || 'agnes-image-2.0-flash')
      setImageBaseUrl(keys.image_base_url || 'https://apihub.agnes-ai.com/v1')
      setShowImageKey(false)
      setVoiceModel(keys.voice_model || 'mimo-v2.5-tts')
      setVoiceUseSame(keys.voice_use_same !== 'false')
      setVoiceApiKey(keys.voice_api_key || '')
      setVoiceBaseUrl(keys.voice_base_url || '')
      setVideoModel(keys.video_model || 'agnes-video-v2.0')
      setVideoUseSame(keys.video_use_same !== 'false')
      setVideoApiKey(keys.video_api_key || '')
      setVideoBaseUrl(keys.video_base_url || '')
      setShowVideoKey(false)
    }
  }, [open])

  const fetchModels = useCallback(async () => {
    if (!apiKey.trim() || !baseUrl.trim()) return

    setLoadingModels(true)
    setModelsError('')
    setModels([])

    try {
      const data = await listModels(apiKey, baseUrl)
      const modelIds = data.models.map(m => m.id)
      setModels(modelIds)

      if (modelIds.length === 0) {
        setModelsError('未找到可用模型')
        setShowManualInput(true)
      } else if (modelIds.length === 1) {
        // Auto-select if only one model
        setModel(modelIds[0])
      } else if (!model || !modelIds.includes(model)) {
        // If current model not in list, select first one
        setModel(modelIds[0])
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取模型列表失败'
      setModelsError(message)
      setShowManualInput(true)
      setModels([])
    } finally {
      setLoadingModels(false)
    }
  }, [apiKey, baseUrl, model])

  // Auto-fetch when both API Key and Base URL have values
  useEffect(() => {
    if (!open) return
    if (apiKey.trim() && baseUrl.trim()) {
      fetchModels()
    }
  }, [open, apiKey, baseUrl, fetchModels])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const p = API_PROVIDERS.find((pr) => pr.id === newProvider)
    if (p && newProvider !== 'custom') {
      setBaseUrl(p.baseUrl)
      setModel(p.model)
    } else if (newProvider === 'custom') {
      setBaseUrl('')
      setModel('')
    }
    setModels([])
    setModelsError('')
    setShowManualInput(false)
  }

  const handleSave = () => {
    const existing = loadApiKeys()
    saveApiKeys({
      ...existing,
      text: apiKey,
      provider,
      base_url: baseUrl,
      model: model,
      image_api_key: imageApiKey,
      image_model: imageModel,
      image_base_url: imageBaseUrl,
      voice_model: voiceModel,
      voice_use_same: String(voiceUseSame),
      voice_api_key: voiceUseSame ? '' : voiceApiKey,
      voice_base_url: voiceUseSame ? '' : voiceBaseUrl,
      video_model: videoModel,
      video_use_same: String(videoUseSame),
      video_api_key: videoUseSame ? '' : videoApiKey,
      video_base_url: videoUseSame ? '' : videoBaseUrl,
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onSaved()
      onClose()
    }, 600)
  }

  const handleRefreshModels = () => {
    fetchModels()
  }

  const handleShowManualInput = () => {
    setShowManualInput(true)
  }

  const canSave = apiKey.trim() && baseUrl.trim() && model.trim()

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="bg-[#111111] rounded-2xl border border-white/10 p-8 max-w-lg w-full shadow-2xl shadow-black/60">

          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">配置 API</h2>
            <p className="text-sm text-gray-500">选择服务商并填入你的 API Key</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">服务商</label>
              <div className="grid grid-cols-3 gap-2">
                {API_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`py-2.5 px-3 text-sm rounded-xl border transition-all ${
                      provider === p.id
                        ? 'bg-[#00aaff]/10 border-[#00aaff]/40 text-[#00aaff]'
                        : 'bg-white/[0.03] border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showKey ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Base URL
                {provider !== 'custom' && <span className="text-gray-600 normal-case ml-1">(已自动填充)</span>}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
              />
            </div>

            {/* Model Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">模型名称</label>
                <div className="flex items-center gap-2">
                  {loadingModels && (
                    <span className="text-xs text-gray-500">正在获取模型...</span>
                  )}
                  {models.length > 0 && (
                    <button
                      onClick={handleRefreshModels}
                      disabled={loadingModels}
                      className="text-xs text-[#00aaff] hover:text-[#aa88ff] transition-colors disabled:opacity-50"
                    >
                      刷新
                    </button>
                  )}
                  {!showManualInput && models.length > 0 && (
                    <button
                      onClick={handleShowManualInput}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      手动输入
                    </button>
                  )}
                </div>
              </div>

              {/* Model dropdown - show when models are available */}
              {models.length > 0 && !showManualInput && (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
                >
                  {models.map((m) => (
                    <option key={m} value={m} className="bg-[#111111] text-gray-100">
                      {m}
                    </option>
                  ))}
                </select>
              )}

              {/* Manual input - show when no models or user chooses to input manually */}
              {(showManualInput || models.length === 0) && (
                <div>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="输入模型名称..."
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                  />
                  {modelsError && (
                    <p className="text-xs text-red-400 mt-1">{modelsError}</p>
                  )}
                  {!loadingModels && models.length === 0 && apiKey.trim() && baseUrl.trim() && !modelsError && (
                    <p className="text-xs text-gray-500 mt-1">填入 API Key 和 Base URL 后将自动获取可用模型</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 pt-5 mt-5">
            <h3 className="text-sm font-medium text-white mb-4">图像生成 API</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">API Key</label>
                <div className="relative">
                  <input
                    type={showImageKey ? 'text' : 'password'}
                    value={imageApiKey}
                    onChange={(e) => setImageApiKey(e.target.value)}
                    placeholder="图像 API Key..."
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowImageKey(!showImageKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showImageKey ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Base URL</label>
                <input
                  type="text"
                  value={imageBaseUrl}
                  onChange={(e) => setImageBaseUrl(e.target.value)}
                  placeholder="https://apihub.agnes-ai.com/v1"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">模型</label>
                <input
                  type="text"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  placeholder="agnes-image-2.0-flash"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                />
              </div>
            </div>
          </div>

          {/* Voice Generation API Section */}
          <div className="border-t border-white/10 pt-5 mt-5">
            <h3 className="text-sm font-medium text-white mb-4">语音生成 API</h3>

            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={voiceUseSame}
                  onChange={(e) => setVoiceUseSame(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/[0.03] text-[#00aaff] focus:ring-[#00aaff]/40"
                />
                <span className="text-xs text-gray-400">使用与文本模型相同的配置</span>
              </label>

              {!voiceUseSame && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">API Key</label>
                    <input
                      type="password"
                      value={voiceApiKey}
                      onChange={(e) => setVoiceApiKey(e.target.value)}
                      placeholder="语音 API Key..."
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Base URL</label>
                    <input
                      type="text"
                      value={voiceBaseUrl}
                      onChange={(e) => setVoiceBaseUrl(e.target.value)}
                      placeholder="https://api.mimo.com/v1"
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">语音模型</label>
                <select
                  value={voiceModel}
                  onChange={(e) => setVoiceModel(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
                >
                  <option value="mimo-v2.5-tts" className="bg-[#111111] text-gray-100">MiMo TTS 标准版</option>
                  <option value="mimo-v2.5-tts-voicedesign" className="bg-[#111111] text-gray-100">MiMo TTS 声音设计版</option>
                  <option value="mimo-v2.5-tts-voiceclone" className="bg-[#111111] text-gray-100">MiMo TTS 声音克隆版</option>
                </select>
              </div>
            </div>
          </div>

          {/* Video Generation API Section */}
          <div className="border-t border-white/10 pt-5 mt-5">
            <h3 className="text-sm font-medium text-white mb-4">视频生成 API</h3>

            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={videoUseSame}
                  onChange={(e) => setVideoUseSame(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/[0.03] text-[#00aaff] focus:ring-[#00aaff]/40"
                />
                <span className="text-xs text-gray-400">使用与图像模型相同的配置</span>
              </label>

              {!videoUseSame && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">API Key</label>
                    <div className="relative">
                      <input
                        type={showVideoKey ? 'text' : 'password'}
                        value={videoApiKey}
                        onChange={(e) => setVideoApiKey(e.target.value)}
                        placeholder="视频 API Key..."
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowVideoKey(!showVideoKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showVideoKey ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Base URL</label>
                    <input
                      type="text"
                      value={videoBaseUrl}
                      onChange={(e) => setVideoBaseUrl(e.target.value)}
                      placeholder="https://apihub.agnes-ai.com/v1"
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">模型</label>
                <input
                  type="text"
                  value={videoModel}
                  onChange={(e) => setVideoModel(e.target.value)}
                  placeholder="agnes-video-v2.0"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 text-sm text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saved || !canSave}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm text-white bg-gradient-to-r from-[#00aaff] to-[#aa88ff] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all font-medium"
            >
              {saved ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  已保存
                </>
              ) : (
                '保存'
              )}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
