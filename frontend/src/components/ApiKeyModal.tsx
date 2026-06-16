import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react'
import { saveApiKeys, loadApiKeys } from '../utils/apiKeys'
import { API_PROVIDERS } from '../config/wizardSteps'
import { listModels } from '../services/api'
import { DEFAULTS } from '../config/defaults'

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
  const [imageModel, setImageModel] = useState(existing.image_model || DEFAULTS.IMAGE_MODEL)
  const [imageBaseUrl, setImageBaseUrl] = useState(existing.image_base_url || DEFAULTS.IMAGE_BASE_URL)
  const [showImageKey, setShowImageKey] = useState(false)

  const [voiceModel, setVoiceModel] = useState(existing.voice_model || DEFAULTS.TTS_MODEL)
  const [voiceUseSame, setVoiceUseSame] = useState(existing.voice_use_same !== 'false')
  const [voiceApiKey, setVoiceApiKey] = useState(existing.voice_api_key || '')
  const [voiceBaseUrl, setVoiceBaseUrl] = useState(existing.voice_base_url || '')

  const [videoModel, setVideoModel] = useState(existing.video_model || DEFAULTS.VIDEO_MODEL)
  const [videoUseSame, setVideoUseSame] = useState(existing.video_use_same !== 'false')
  const [videoApiKey, setVideoApiKey] = useState(existing.video_api_key || '')
  const [videoBaseUrl, setVideoBaseUrl] = useState(existing.video_base_url || '')
  const [showVideoKey, setShowVideoKey] = useState(false)

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
      setImageModel(keys.image_model || DEFAULTS.IMAGE_MODEL)
      setImageBaseUrl(keys.image_base_url || DEFAULTS.IMAGE_BASE_URL)
      setShowImageKey(false)
      setVoiceModel(keys.voice_model || DEFAULTS.TTS_MODEL)
      setVoiceUseSame(keys.voice_use_same !== 'false')
      setVoiceApiKey(keys.voice_api_key || '')
      setVoiceBaseUrl(keys.voice_base_url || '')
      setVideoModel(keys.video_model || DEFAULTS.VIDEO_MODEL)
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
        setModelsError('鏈壘鍒板彲鐢ㄦā鍨?)
        setShowManualInput(true)
      } else if (modelIds.length === 1) {
        setModel(modelIds[0])
      } else if (!model || !modelIds.includes(model)) {
        setModel(modelIds[0])
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '鑾峰彇妯″瀷鍒楄〃澶辫触'
      setModelsError(message)
      setShowManualInput(true)
      setModels([])
    } finally {
      setLoadingModels(false)
    }
  }, [apiKey, baseUrl, model])

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
      video_api_key: videoUseSame ? imageApiKey : videoApiKey,
      video_base_url: videoUseSame ? imageBaseUrl : videoBaseUrl,
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onSaved()
      onClose()
    }, 600)
  }

  const canSave = apiKey.trim() || imageApiKey.trim() || voiceApiKey.trim() || videoApiKey.trim()

  const eyeIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
  const eyeOffIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
    </svg>
  )

  const KeyInput = ({ label, value, onChange, show, onToggle, placeholder, mono }: {
    label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder: string; mono?: boolean
  }) => (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 pr-9 text-xs text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors ${mono ? 'font-mono' : ''}`}
        />
        <button type="button" onClick={onToggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors">
          {show ? eyeOffIcon : eyeIcon}
        </button>
      </div>
    </div>
  )

  const TextInput = ({ label, value, onChange, placeholder }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string
  }) => (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
      />
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="bg-[#111111] rounded-2xl border border-white/10 shadow-2xl shadow-black/60 w-full max-w-4xl max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">API 閰嶇疆</h2>
                <p className="text-xs text-gray-500">閰嶇疆鏂囨湰銆佸浘鍍忋€佽闊炽€佽棰?API</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                鍙栨秷
              </button>
              <button
                onClick={handleSave}
                disabled={saved || !canSave}
                className="flex items-center gap-1.5 px-5 py-2 text-xs text-white bg-gradient-to-r from-[#00aaff] to-[#aa88ff] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all font-medium"
              >
                {saved ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    宸蹭繚瀛?                  </>
                ) : '淇濆瓨'}
              </button>
            </div>
          </div>

          {/* Body - 2 column grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-4">

              {/* Left column: Text API */}
              <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-4 space-y-3">
                <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00aaff]"></span>
                  鏂囨湰鐢熸垚 API
                </h3>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">鏈嶅姟鍟?/label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {API_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleProviderChange(p.id)}
                        className={`py-1.5 px-2 text-xs rounded-lg border transition-all ${
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
                <KeyInput label="API Key" value={apiKey} onChange={setApiKey} show={showKey} onToggle={() => setShowKey(!showKey)} placeholder="sk-..." />
                <TextInput label={`Base URL ${provider !== 'custom' ? '(鑷姩)' : ''}`} value={baseUrl} onChange={setBaseUrl} placeholder="https://api.example.com/v1" />
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider">妯″瀷</label>
                    <div className="flex items-center gap-2">
                      {loadingModels && <span className="text-[10px] text-gray-600">鑾峰彇涓?..</span>}
                      {models.length > 0 && (
                        <button onClick={fetchModels} disabled={loadingModels} className="text-[10px] text-[#00aaff] hover:text-[#aa88ff] transition-colors disabled:opacity-50">鍒锋柊</button>
                      )}
                      {!showManualInput && models.length > 0 && (
                        <button onClick={() => setShowManualInput(true)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">鎵嬪姩</button>
                      )}
                    </div>
                  </div>
                  {models.length > 0 && !showManualInput ? (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                    >
                      {models.map((m) => <option key={m} value={m} className="bg-[#111111] text-gray-100">{m}</option>)}
                    </select>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="杈撳叆妯″瀷鍚嶇О..."
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors font-mono"
                      />
                      {modelsError && <p className="text-[10px] text-red-400 mt-1">{modelsError}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Right column: Image + Voice + Video stacked */}
              <div className="space-y-4">

                {/* Image API */}
                <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b6b]"></span>
                    鍥惧儚鐢熸垚 API
                  </h3>
                  <KeyInput label="API Key" value={imageApiKey} onChange={setImageApiKey} show={showImageKey} onToggle={() => setShowImageKey(!showImageKey)} placeholder="鍥惧儚 API Key..." />
                  <TextInput label="Base URL" value={imageBaseUrl} onChange={setImageBaseUrl} placeholder={DEFAULTS.IMAGE_BASE_URL} />
                  <TextInput label="妯″瀷" value={imageModel} onChange={setImageModel} placeholder={DEFAULTS.IMAGE_MODEL} />
                </div>

                {/* Voice API */}
                <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#51cf66]"></span>
                    璇煶鐢熸垚 API
                  </h3>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={voiceUseSame} onChange={(e) => setVoiceUseSame(e.target.checked)} className="w-3.5 h-3.5 rounded border-white/20 bg-white/[0.03] text-[#00aaff] focus:ring-[#00aaff]/40" />
                    <span className="text-[10px] text-gray-400">涓庢枃鏈ā鍨嬪叡鐢?/span>
                  </label>
                  {!voiceUseSame && (
                    <>
                      <KeyInput label="API Key" value={voiceApiKey} onChange={setVoiceApiKey} show={false} onToggle={() => {}} placeholder="璇煶 API Key..." />
                      <TextInput label="Base URL" value={voiceBaseUrl} onChange={setVoiceBaseUrl} placeholder={DEFAULTS.TTS_BASE_URL} />
                    </>
                  )}
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">璇煶妯″瀷</label>
                    <select
                      value={voiceModel}
                      onChange={(e) => setVoiceModel(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#00aaff]/40 transition-colors appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                    >
                      <option value="mimo-v2.5-tts" className="bg-[#111111] text-gray-100">MiMo TTS 鏍囧噯鐗?/option>
                      <option value="mimo-v2.5-tts-voicedesign" className="bg-[#111111] text-gray-100">MiMo TTS 澹伴煶璁捐鐗?/option>
                      <option value="mimo-v2.5-tts-voiceclone" className="bg-[#111111] text-gray-100">MiMo TTS 澹伴煶鍏嬮殕鐗?/option>
                    </select>
                  </div>
                </div>

                {/* Video API */}
                <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffd43b]"></span>
                    瑙嗛鐢熸垚 API
                  </h3>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={videoUseSame} onChange={(e) => setVideoUseSame(e.target.checked)} className="w-3.5 h-3.5 rounded border-white/20 bg-white/[0.03] text-[#00aaff] focus:ring-[#00aaff]/40" />
                    <span className="text-[10px] text-gray-400">涓庡浘鍍忔ā鍨嬪叡鐢?/span>
                  </label>
                  {!videoUseSame && (
                    <>
                      <KeyInput label="API Key" value={videoApiKey} onChange={setVideoApiKey} show={showVideoKey} onToggle={() => setShowVideoKey(!showVideoKey)} placeholder="瑙嗛 API Key..." />
                      <TextInput label="Base URL" value={videoBaseUrl} onChange={setVideoBaseUrl} placeholder={DEFAULTS.VIDEO_BASE_URL} />
                    </>
                  )}
                  <TextInput label="妯″瀷" value={videoModel} onChange={setVideoModel} placeholder={DEFAULTS.VIDEO_MODEL} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer - sticky save button */}
          <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              鍙栨秷
            </button>
            <button
              onClick={handleSave}
              disabled={saved || !canSave}
              className="flex items-center gap-1.5 px-6 py-2 text-xs text-white bg-gradient-to-r from-[#00aaff] to-[#aa88ff] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all font-medium"
            >
              {saved ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  宸蹭繚瀛?                </>
              ) : '淇濆瓨'}
            </button>
          </div>

        </DialogPanel>
      </div>
    </Dialog>
  )
}

