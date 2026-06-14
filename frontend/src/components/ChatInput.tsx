import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ModelSelector from './ModelSelector'
import ApiKeyModal from './ApiKeyModal'
import FileUploader from './FileUploader'
import { loadApiKeys } from '../utils/apiKeys'

interface ChatInputProps {
  externalValue?: string
  onValueChange?: (value: string) => void
}

interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
}

export default function ChatInput({ externalValue, onValueChange }: ChatInputProps) {
  const navigate = useNavigate()
  const [internalValue, setInternalValue] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState('')
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const uploadBtnRef = useRef<HTMLButtonElement>(null)

  const value = externalValue !== undefined ? externalValue : internalValue
  const setValue = (v: string) => {
    if (onValueChange) onValueChange(v)
    setInternalValue(v)
  }

  useEffect(() => {
    const keys = loadApiKeys()
    setCurrentModel(keys.model || '')
  }, [])

  const hasApiKey = () => {
    const keys = loadApiKeys()
    return !!(keys.text && keys.base_url)
  }

  const handleSend = () => {
    if (!value.trim()) return
    if (!hasApiKey()) {
      setApiKeyModalOpen(true)
      return
    }
    navigate('/workspace', { state: { prompt: value.trim() } })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleModelClick = () => {
    setModelOpen(!modelOpen)
  }

  const handleModelSelect = (model: string) => {
    setCurrentModel(model)
    setModelOpen(false)
  }

  const handleApiKeySaved = () => {
    const keys = loadApiKeys()
    setCurrentModel(keys.model || '')
  }

  const handleFileUpload = (file: UploadedFile) => {
    setUploadedFiles((prev) => [...prev, file])
  }

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const getModelDisplayName = () => {
    if (!currentModel) return '模型'
    if (currentModel.length > 15) {
      const parts = currentModel.split('/')
      return parts[parts.length - 1]
    }
    return currentModel
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  const typeIcons: Record<string, string> = {
    image: '🖼️',
    audio: '🎵',
    video: '🎬',
    text: '📄',
  }

  return (
    <>
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl overflow-hidden focus-within:border-[#00aaff]/30 transition-colors">
          {/* Uploaded files preview */}
          {uploadedFiles.length > 0 && (
            <div className="px-5 pt-3 flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5 text-xs"
                >
                  <span>{typeIcons[file.type] || '📎'}</span>
                  <span className="text-gray-300 max-w-[120px] truncate">{file.name}</span>
                  <span className="text-gray-600">{formatFileSize(file.size)}</span>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="text-gray-500 hover:text-red-400 ml-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="从一个想法或故事开始..."
            className="w-full bg-transparent px-5 pt-4 pb-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none resize-none"
          />

          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-2">
              <FileUploader
                onUpload={handleFileUpload}
                triggerRef={uploadBtnRef}
              />

              <div className="relative">
                <button
                  ref={modelBtnRef}
                  onClick={handleModelClick}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                    currentModel
                      ? 'bg-[#00aaff]/10 text-[#00aaff] hover:bg-[#00aaff]/20'
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {getModelDisplayName()}
                </button>
                <ModelSelector
                  open={modelOpen}
                  onClose={() => setModelOpen(false)}
                  onSelect={handleModelSelect}
                  onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
                  currentModel={currentModel}
                  triggerRef={modelBtnRef}
                />
              </div>

              <button className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition-colors font-medium">
                Skill
              </button>
              <button className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition-colors font-medium">
                元素
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!value.trim()}
              className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#00aaff] to-[#aa88ff] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ApiKeyModal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onSaved={handleApiKeySaved}
      />
    </>
  )
}
