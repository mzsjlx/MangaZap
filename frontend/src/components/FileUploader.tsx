import { useState, useRef, useEffect } from 'react'

const FILE_TYPES = [
  {
    id: 'image',
    label: '图片',
    icon: '🖼️',
    accept: '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
    formats: 'JPG / PNG / GIF / WebP / BMP / SVG',
    maxSize: '20MB',
  },
  {
    id: 'audio',
    label: '音频',
    icon: '🎵',
    accept: '.mp3,.wav,.ogg,.aac,.flac,.m4a,.wma',
    formats: 'MP3 / WAV / OGG / AAC / FLAC / M4A / WMA',
    maxSize: '50MB',
  },
  {
    id: 'video',
    label: '视频',
    icon: '🎬',
    accept: '.mp4,.webm,.avi,.mov,.mkv,.flv,.wmv',
    formats: 'MP4 / WebM / AVI / MOV / MKV / FLV / WMV',
    maxSize: '200MB',
  },
  {
    id: 'text',
    label: '文本',
    icon: '📄',
    accept: '.txt,.pdf,.docx,.doc,.md,.json,.csv,.srt,.ass',
    formats: 'TXT / PDF / DOCX / DOC / MD / JSON / CSV / SRT / ASS',
    maxSize: '10MB',
  },
]

interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
}

interface FileUploaderProps {
  onUpload: (file: UploadedFile) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onTextFileContent?: (content: string) => void
}

export default function FileUploader({ onUpload, triggerRef, onTextFileContent }: FileUploaderProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropdownHeight = 260
      setDropdownStyle({
        position: 'fixed',
        top: spaceBelow > dropdownHeight + 16 ? rect.bottom + 8 : rect.top - dropdownHeight - 8,
        left: rect.left,
        width: 340,
      })
    }
    setOpen(!open)
    setError('')
  }

  const handleTypeClick = (typeId: string) => {
    if (fileInputRef.current) {
      const ft = FILE_TYPES.find((t) => t.id === typeId)
      if (ft) {
        fileInputRef.current.accept = ft.accept
        fileInputRef.current.click()
      }
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Local text file reading for script upload
    if (onTextFileContent && (file.name.endsWith('.txt') || file.type === 'text/plain')) {
      setOpen(false)
      try {
        const content = await file.text()
        onTextFileContent(content)
      } catch (err) {
        setError('文件读取失败')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      return
    }

    setUploading(true)
    setError('')
    setOpen(false)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || '上传失败')
      }

      const result = await response.json()
      onUpload({
        id: result.file_id,
        name: result.filename,
        type: result.file_type,
        size: result.size,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, triggerRef])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        disabled={uploading}
        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors text-sm font-bold disabled:opacity-50"
        title="上传文件"
      >
        {uploading ? '...' : '+'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
      />

      {open && (
        <div
          ref={dropdownRef}
          className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-[9999]"
          style={dropdownStyle}
        >
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-xs font-semibold text-gray-400">上传文件</span>
          </div>

          <div className="p-2">
            {FILE_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => handleTypeClick(type.id)}
                className="w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-xl mt-0.5 shrink-0">{type.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-200">{type.label}</span>
                    <span className="text-[10px] text-gray-600">最大 {type.maxSize}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{type.formats}</p>
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div className="px-4 py-2 border-t border-white/5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
