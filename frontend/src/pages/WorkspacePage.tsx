import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { PlayIcon, FilmIcon, PencilIcon, FolderIcon } from '@heroicons/react/24/outline'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useConversation } from '../hooks/useConversation'
import ApiKeyModal from '../components/ApiKeyModal'
import WorkspaceNav, { type ExportType } from '../components/WorkspaceNav'
import { exportScriptMarkdown, exportScriptTxt, exportStoryboardJson, exportStoryboardCsv, exportAll } from '../utils/export'
import { generateImage, downloadProjectImages, uploadFile } from '../services/api'
import { loadApiKeys } from '../utils/apiKeys'
import { DEFAULTS } from '../config/defaults'
import { getSelectedStyle, getStylePromptPrefix } from '../config/wizardSteps'
import ChatPanel from '../components/ChatPanel'
import KeyElementsCardView from '../components/KeyElementsCardView'
import NarrationPanel from '../components/NarrationPanel'
import DialoguePanel from '../components/DialoguePanel'
import ImageConfirmModal from '../components/ImageConfirmModal'

interface StoryboardPanelProps {
  content?: string
  onImageClick?: (imageUrl: string, itemKey?: string) => void
  onPlayVideo?: (videoUrl: string) => void
  keyElementsImages?: Record<string, string[]>
  keyFramesImages?: Record<number, string[]>
  keyFrameVideos?: Record<string, string>
}

function getImageUrl(value: string | string[] | undefined): string | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] || null) : value
}

function splitStoryboardShots(content: string): string[] {
  const regex = /(?=^\*\*镜)/gm
  const parts = content.split(regex).filter(s => s.trim())
  if (parts.length <= 1 && !content.match(/^\*\*镜/gm)) {
    return content.split('\n\n').filter(Boolean)
  }
  // Skip the first part if it's just heading/stats (not a real shot)
  if (parts.length > 0 && !parts[0].match(/^\*\*镜/)) {
    return parts.slice(1)
  }
  return parts
}

function extractStoryboardHeader(content: string): { title: string; totalCount: string; totalDuration: string } {
  const titleMatch = content.match(/^#\s*(.+)$/m)
  const statsMatch = content.match(/\*\*总镜头数\*\*[：:]\s*(\d+)\s*\|\s*\*\*预计总时长\*\*[：:]\s*(\d+)/)
  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    totalCount: statsMatch ? statsMatch[1] : '',
    totalDuration: statsMatch ? statsMatch[2] : '',
  }
}

function StoryboardPanel({ content, onImageClick, onPlayVideo, keyElementsImages, keyFramesImages, keyFrameVideos }: StoryboardPanelProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editedSections, setEditedSections] = useState<string[]>([])

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">分镜生成中...</p>
      </div>
    )
  }

  const sections = splitStoryboardShots(content)
  const header = extractStoryboardHeader(content)

  const handleEdit = (idx: number) => {
    setEditingIndex(idx)
  }

  const handleSave = () => {
    setEditingIndex(null)
  }

  const handleChange = (idx: number, value: string) => {
    const newSections = [...sections]
    newSections[idx] = value
    setEditedSections(newSections)
  }

  const getSectionContent = (idx: number) => {
    return editedSections[idx] !== undefined ? editedSections[idx] : sections[idx]
  }

  return (
    <div className="p-4 space-y-3">
      {header.title && (
        <h1 className="text-lg font-bold text-white">{header.title}</h1>
      )}
      {(header.totalCount || header.totalDuration) && (
        <div className="text-sm text-white">
          {header.totalCount && <span className="font-bold">总镜头数：{header.totalCount}</span>}
          {header.totalCount && header.totalDuration && <span className="mx-2">|</span>}
          {header.totalDuration && <span className="font-bold">预计总时长：{header.totalDuration}秒</span>}
        </div>
      )}
      {sections.map((block, i) => {
        return (
        <div
          key={i}
          className="rounded-lg border border-white/[0.06] p-4 group relative"
          style={{ background: 'linear-gradient(135deg, #101828 0%, #0c1020 100%)' }}
        >
          <div className="absolute top-3 right-3 flex gap-1">
            <button
              onClick={() => editingIndex === i ? handleSave() : handleEdit(i)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: editingIndex === i
                  ? 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)'
                  : 'rgba(255,255,255,0.04)',
              }}
            >
              {editingIndex === i ? (
                <svg className="w-3.5 h-3.5 text-[#00aaff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <PencilIcon className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          </div>

          {editingIndex === i ? (
            <textarea
              value={getSectionContent(i)}
              onChange={(e) => handleChange(i, e.target.value)}
              className="w-full bg-transparent text-sm text-gray-200 whitespace-pre-wrap font-mono leading-relaxed focus:outline-none resize-none min-h-[100px]"
              autoFocus
            />
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
              {getSectionContent(i)}
            </div>
          )}

          {/* Keyframe images */}
          {keyFramesImages?.[i] && keyFramesImages[i].length > 0 && (
            <div className="grid grid-cols-3 gap-1 mt-2">
              {keyFramesImages[i].map((url, imgIndex) => {
                const videoKey = `${i}_${imgIndex}`
                const videoUrl = keyFrameVideos?.[videoKey]
                return (
                  <div key={imgIndex} className="flex flex-col gap-1">
                    <img
                      src={url}
                      alt={`画面${imgIndex + 1}`}
                      className="w-full h-[50px] object-cover rounded-sm border border-white/10 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onImageClick?.(url, `keyframe_${i}_${imgIndex}`)}
                    />
                    {videoUrl && (
                      <div
                        className="w-full h-[50px] relative rounded-sm border border-white/10 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
                        onClick={() => onPlayVideo?.(videoUrl)}
                      >
                        <img
                          src={url}
                          alt={`视频${imgIndex + 1}`}
                          className="w-full h-full object-cover opacity-60"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 5.84a.5.5 0 01.77-.42l7.56 4.16a.5.5 0 010 .84l-7.56 4.16a.5.5 0 01-.77-.42V5.84z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )})}
    </div>
  )
}

const boxClass = "rounded-xl border border-white/[0.06] flex flex-col overflow-hidden"

function BrowseArea({ 
  previewImageUrl, 
  previewVideoUrl,
  onClosePreview,
  modifyRequest,
  onModifyRequestChange,
  onRegenerate,
  regenerating,
  referenceImageUrl,
  onReferenceUpload,
  onClearReference,
  playingTrack,
  audioProgress,
  onTogglePlay,
}: { 
  previewImageUrl: string | null
  previewVideoUrl: string | null
  onClosePreview: () => void
  modifyRequest?: string
  onModifyRequestChange?: (value: string) => void
  onRegenerate?: () => void
  regenerating?: boolean
  referenceImageUrl?: string | null
  onReferenceUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearReference?: () => void
  playingTrack?: { id: string; character: string; waveform: number[]; color: string } | null
  audioProgress?: number
  onTogglePlay?: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
        <PlayIcon className="h-4 w-4 text-indigo-400" />
        <span className="text-sm font-medium text-gray-200">浏览区</span>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-auto">
        {previewVideoUrl ? (
          <div className="relative w-full h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center p-4">
              <button
                onClick={onClosePreview}
                className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                title="关闭预览"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <video
                src={previewVideoUrl}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-lg"
              />
            </div>
          </div>
        ) : previewImageUrl ? (
          <div className="relative w-full h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center p-4">
              <button
                onClick={onClosePreview}
                className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                title="关闭预览"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <img
                src={previewImageUrl}
                alt="Preview"
                className="max-h-full max-w-full object-contain rounded-lg"
              />
            </div>
            {onRegenerate && (
              <div className="flex gap-2 p-3 border-t border-white/[0.06]">
                <input
                  type="text"
                  value={modifyRequest || ''}
                  onChange={(e) => onModifyRequestChange?.(e.target.value)}
                  placeholder="输入修改要求，如'把衣服改成红色'"
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !regenerating && modifyRequest?.trim()) {
                      onRegenerate()
                    }
                  }}
                />
                {onReferenceUpload && (
                  <label className="px-3 py-2 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 flex items-center justify-center border border-white/10">
                    <input type="file" accept="image/*" className="hidden" onChange={onReferenceUpload} />
                    {referenceImageUrl ? (
                      <div className="relative">
                        <img src={referenceImageUrl} alt="参考图" className="w-6 h-6 rounded object-cover" />
                        {onClearReference && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClearReference() }}
                            className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-white text-[8px] flex items-center justify-center"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-lg">➕</span>
                    )}
                  </label>
                )}
                <button
                  onClick={onRegenerate}
                  disabled={regenerating || !modifyRequest?.trim()}
                  className="px-4 py-2 bg-blue-600/50 rounded-xl disabled:opacity-50 text-sm font-medium hover:bg-blue-600/70 transition-colors"
                >
                  {regenerating ? '生成中...' : '重新生成'}
                </button>
              </div>
            )}
          </div>
        ) : playingTrack ? (
          <div className="flex flex-col items-center gap-4 p-6 w-full">
            <div className="text-sm text-gray-300 font-medium">{playingTrack.character}</div>
            
            {/* Large waveform */}
            <div className="flex items-end gap-1 h-24 w-full max-w-xs">
              {playingTrack.waveform.map((amp, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-colors duration-150"
                  style={{
                    height: `${Math.max(8, amp * 100)}%`,
                    backgroundColor: i < (audioProgress || 0) * 20 ? playingTrack.color : '#374151',
                  }}
                />
              ))}
            </div>
            
            {/* Play/Pause button */}
            <button 
              onClick={onTogglePlay}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{ background: `${playingTrack.color}30`, border: `2px solid ${playingTrack.color}` }}
            >
              <span className="text-lg" style={{ color: playingTrack.color }}>
                {(audioProgress || 0) > 0 && (audioProgress || 0) < 1 ? '⏸' : '▶'}
              </span>
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            <PlayIcon className="h-12 w-12 mx-auto mb-2 text-gray-600" />
            <p className="text-sm">点击左侧图片预览</p>
          </div>
        )}
      </div>
    </>
  )
}

export default function WorkspacePage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get('projectId')
  const initialPrompt = (location.state as { prompt?: string })?.prompt

  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showImageConfirmModal, setShowImageConfirmModal] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [storyboardActive, setStoryboardActive] = useState(true)
  const [filesActive, setFilesActive] = useState(false)
  const [timelineActive, setTimelineActive] = useState(false)
  const [showDevDialog, setShowDevDialog] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const [previewItemKey, setPreviewItemKey] = useState<string | null>(null)
  const [modifyRequest, setModifyRequest] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)

  const handleConflict = useCallback(() => {
    setShowConflictDialog(true)
  }, [])

  const conversation = useConversation({ onConflict: handleConflict, initialPrompt: initialPrompt })
  const { 
    phase, messages, scriptContent, storyboardContent, 
    keyElementsContent, narrationContent, dialogueContent,
    projectId, isSaving, lastSaveTime, isConflict,
    loadProject, resolveConflict,
    setKeyElementsImages, filterSceneDescription, parseKeyElementsContent,
    selectedReferenceImages, setSelectedReferenceImage,
    voiceTracks, currentPlayingTrackId, audioProgress, playVoiceTrack,
  } = conversation

  // Get the currently playing track object
  const playingTrack = useMemo(() => {
    if (!currentPlayingTrackId) return null
    for (const charName of Object.keys(voiceTracks)) {
      const track = voiceTracks[charName].find(t => t.id === currentPlayingTrackId)
      if (track) return track
    }
    return null
  }, [voiceTracks, currentPlayingTrackId])

  useEffect(() => {
    if (projectIdParam && projectIdParam !== projectId) {
      loadProject(projectIdParam)
    }
  }, [projectIdParam, loadProject, projectId])

  useEffect(() => {
    if (messages.length === 0 && !conversation.hasApiConfig()) {
      setShowApiKeyModal(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApiKeySaved = useCallback(() => {}, [])

  const handleTogglePlay = useCallback(() => {
    if (currentPlayingTrackId) {
      playVoiceTrack(currentPlayingTrackId)
    }
  }, [currentPlayingTrackId, playVoiceTrack])

  const handleDownloadImages = useCallback(async () => {
    if (!projectId) {
      alert('项目尚未保存，无法下载图片')
      return
    }

    try {
      const result = await downloadProjectImages(projectId)
      alert(`已成功下载 ${Object.keys(result.keyElementsImages).length} 张图片到本地`)
      await loadProject(projectId)
    } catch (err) {
      alert(`下载图片失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [projectId, loadProject])

  const handleReloadProject = useCallback(async () => {
    setShowConflictDialog(false)
    if (projectId) {
      await resolveConflict()
    }
  }, [projectId, resolveConflict])

  const handleImageClick = useCallback((imageUrl: string, itemKey?: string) => {
    setPreviewImageUrl(imageUrl)
    setPreviewVideoUrl(null)
    setPreviewItemKey(itemKey || null)
  }, [])

  const handlePlayVideo = useCallback((videoUrl: string) => {
    setPreviewVideoUrl(videoUrl)
    setPreviewImageUrl(null)
  }, [])

  const handleReferenceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await uploadFile<{ file_id: string; file_path: string; filename: string }>('/upload', file)
      const filename = result.file_path.split('/').pop() || result.file_path.split('\\').pop()
      const fullUrl = `/api/files/${filename}`
      setReferenceImageUrl(fullUrl)
      console.log('📸 Reference image uploaded:', fullUrl)
    } catch (err) {
      console.error('Upload error:', err)
      alert(`上传失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
    e.target.value = ''
  }, [])

  const handleRegenerateImage = useCallback(async () => {
    console.log('🔄 Regenerate triggered', { previewItemKey, modifyRequest, hasRefImage: !!referenceImageUrl })
    if (!previewItemKey || !modifyRequest.trim()) {
      console.log('⚠️ Early return: missing previewItemKey or modifyRequest')
      return
    }

    const keys = loadApiKeys()
    const apiKey = keys.image_api_key
    const model = keys.image_model || DEFAULTS.IMAGE_MODEL
    const baseUrl = keys.image_base_url || DEFAULTS.IMAGE_BASE_URL

    if (!apiKey) {
      alert('请先在设置中配置图像 API Key')
      return
    }

    const style = getSelectedStyle()
    if (!style) {
      alert('请先在下方 Skill 列表中选择一种画风，然后重新点击生成按钮。')
      return
    }
    const stylePrefix = getStylePromptPrefix()

    const { characters, scenes } = parseKeyElementsContent(keyElementsContent)
    console.log('📋 Parsed elements', { characters: characters.length, scenes: scenes.length })
    const isChar = previewItemKey.startsWith('char_')
    const itemName = previewItemKey.replace(/^char_|^scene_/, '')

    let fullDescription = ''
    if (isChar) {
      const found = characters.find(c => c.name === itemName)
      if (found) fullDescription = found.cleanText
    } else {
      const found = scenes.find(s => s.name === itemName)
      if (found) fullDescription = found.cleanText
    }

    console.log('🔍 Found description', { itemName, hasDescription: !!fullDescription })

    if (!fullDescription) {
      alert('无法找到对应元素的描述，请重试')
      return
    }

    let prompt = ''
    if (isChar) {
      prompt = `${stylePrefix}角色概念图：${itemName}，${fullDescription}。修改要求：${modifyRequest}`
    } else {
      prompt = `${stylePrefix}环境场景图，不要包含任何人物：${itemName}，${fullDescription}。修改要求：${modifyRequest}`
    }

    console.log('🎨 Generating image with prompt:', prompt.substring(0, 100) + '...')

    setRegenerating(true)
    try {
      const data = await generateImage({
        prompt,
        api_key: apiKey,
        model,
        base_url: baseUrl,
        ref_image_url: referenceImageUrl || undefined,
      })
      console.log('✅ Image generated:', data.image_url)
      setKeyElementsImages(prev => ({
        ...prev,
        [previewItemKey]: [...(prev[previewItemKey] || []), data.image_url],
      }))
      setPreviewImageUrl(data.image_url)
      setModifyRequest('')
      setReferenceImageUrl(null)
    } catch (err) {
      console.error('❌ Image regeneration error:', err)
      alert(`图片重新生成失败：${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setRegenerating(false)
    }
  }, [previewItemKey, modifyRequest, keyElementsContent, setKeyElementsImages, parseKeyElementsContent, referenceImageUrl])

  const handleTabToggle = useCallback((tab: string) => {
    if (tab === 'docs') {
      setShowDevDialog(true)
      return
    }
    if (tab === 'storyboard') {
      setStoryboardActive((prev) => !prev)
      setTimelineActive(false)
    }
    if (tab === 'timeline') {
      setTimelineActive((prev) => !prev)
      setStoryboardActive(false)
    }
    if (tab === 'files') setFilesActive((prev) => !prev)
  }, [])

  const activeTabs = [
    ...(storyboardActive ? ['storyboard'] : []),
    ...(filesActive ? ['files'] : []),
    ...(timelineActive ? ['timeline'] : []),
  ]

  const handleExport = useCallback((type: ExportType) => {
    switch (type) {
      case 'script_md':
        if (scriptContent) exportScriptMarkdown(scriptContent)
        break
      case 'script_txt':
        if (scriptContent) exportScriptTxt(scriptContent)
        break
      case 'storyboard_json':
        if (storyboardContent) exportStoryboardJson(storyboardContent)
        break
      case 'storyboard_csv':
        if (storyboardContent) exportStoryboardCsv(storyboardContent)
        break
      case 'all_zip':
        exportAll(scriptContent || '', storyboardContent || '')
        break
    }
  }, [scriptContent, storyboardContent])

  const handleConfirmImage = () => {
    setShowImageConfirmModal(false)
    conversation.confirmImageGeneration()
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0a0a]">
      <WorkspaceNav
        activeTabs={activeTabs}
        onTabToggle={handleTabToggle}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen(!chatOpen)}
        onExport={handleExport}
        hasStoryboard={!!storyboardContent}
      />

      <div className="flex items-center justify-between px-4 py-1 text-xs text-gray-400 border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          {isSaving && (
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 border border-[#00aaff] border-t-transparent rounded-full animate-spin" />
              保存中...
            </span>
          )}
          {isConflict && (
            <span className="text-yellow-400">⚠ 数据冲突，请重新加载</span>
          )}
          {lastSaveTime && !isSaving && !isConflict && (
            <span>上次保存: {lastSaveTime.toLocaleTimeString()}</span>
          )}
          {projectId && (
            <span className="text-gray-500">项目ID: {projectId}</span>
          )}
        </div>
        {projectId && (
          <button
            onClick={handleDownloadImages}
            className="px-2 py-0.5 text-xs rounded bg-white/5 hover:bg-white/10 transition-colors"
          >
            下载图片到本地
          </button>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden overflow-x-hidden p-2 gap-2">
        {/* Left dynamic area - always w-2/3 */}
        <div
          className={`w-2/3 h-full overflow-auto rounded-xl border border-white/[0.06]`}
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          {/* State 1: storyboard + files */}
          {storyboardActive && filesActive && !timelineActive && (
            <div className="flex h-full gap-3 p-2">
              <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                  <div className="flex items-center gap-2">
                    <FilmIcon className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium text-gray-200">故事板</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {keyElementsContent && (
                    <KeyElementsCardView 
                      content={keyElementsContent} 
                      images={conversation.keyElementsImages}
                      onImageClick={handleImageClick}
                      onSelectImage={setSelectedReferenceImage}
                      selectedReferenceImages={selectedReferenceImages}
                      keyElementsProgress={conversation.keyElementsProgress}
                      voiceTracks={conversation.voiceTracks}
                      onSelectVoiceTrack={conversation.selectVoiceTrack}
                      onDeleteVoiceTrack={conversation.deleteVoiceTrack}
                      onPlayVoiceTrack={conversation.playVoiceTrack}
                      onAddVoiceTrack={conversation.generateVoiceForCharacter}
                    />
                  )}
                  <StoryboardPanel
                    content={conversation.storyboardContent || undefined}
                    onImageClick={handleImageClick}
                    keyElementsImages={conversation.keyElementsImages}
                    keyFramesImages={conversation.keyFramesImages}
                  />
                  {narrationContent && (
                    <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: 'linear-gradient(135deg, #101828 0%, #0c1020 100%)' }}>
                      <NarrationPanel content={narrationContent} onEdit={conversation.modifyNarration} />
                    </div>
                  )}
                  {dialogueContent && (
                    <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: 'linear-gradient(135deg, #101828 0%, #0c1020 100%)' }}>
                      <DialoguePanel content={dialogueContent} onEdit={conversation.modifyDialogue} />
                    </div>
                  )}
                </div>
              </div>
              <div className="w-1/2 h-full flex flex-col gap-3">
                <div className="flex-[2] flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                  <BrowseArea 
                    previewImageUrl={previewImageUrl} 
                    previewVideoUrl={previewVideoUrl}
                    onClosePreview={() => { setPreviewImageUrl(null); setPreviewVideoUrl(null) }}
                    modifyRequest={modifyRequest}
                  onModifyRequestChange={setModifyRequest}
                  onRegenerate={previewItemKey ? handleRegenerateImage : undefined}
                  regenerating={regenerating}
                  playingTrack={playingTrack}
                  audioProgress={audioProgress}
                  onTogglePlay={handleTogglePlay}
                />
                </div>
                <div className="flex-[1] flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                    <FolderIcon className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium text-gray-200">文件区</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <FolderIcon className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                      <p className="text-xs">文件区内容待开发</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* State 2: storyboard only */}
          {storyboardActive && !filesActive && !timelineActive && (
            <div className="flex h-full gap-3 p-2">
              <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                  <div className="flex items-center gap-2">
                    <FilmIcon className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium text-gray-200">故事板</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {keyElementsContent && (
                    <KeyElementsCardView 
                      content={keyElementsContent} 
                      images={conversation.keyElementsImages}
                      onImageClick={handleImageClick}
                      onSelectImage={setSelectedReferenceImage}
                      selectedReferenceImages={selectedReferenceImages}
                      keyElementsProgress={conversation.keyElementsProgress}
                      voiceTracks={conversation.voiceTracks}
                      onSelectVoiceTrack={conversation.selectVoiceTrack}
                      onDeleteVoiceTrack={conversation.deleteVoiceTrack}
                      onPlayVoiceTrack={conversation.playVoiceTrack}
                      onAddVoiceTrack={conversation.generateVoiceForCharacter}
                    />
                  )}
                  <StoryboardPanel
                    content={conversation.storyboardContent || undefined}
                    onImageClick={handleImageClick}
                    keyElementsImages={conversation.keyElementsImages}
                    keyFramesImages={conversation.keyFramesImages}
                  />
                  {narrationContent && (
                    <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: 'linear-gradient(135deg, #101828 0%, #0c1020 100%)' }}>
                      <NarrationPanel content={narrationContent} onEdit={conversation.modifyNarration} />
                    </div>
                  )}
                  {dialogueContent && (
                    <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: 'linear-gradient(135deg, #101828 0%, #0c1020 100%)' }}>
                      <DialoguePanel content={dialogueContent} onEdit={conversation.modifyDialogue} />
                    </div>
                  )}
                </div>
              </div>
              <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <BrowseArea 
                  previewImageUrl={previewImageUrl} 
                  onClosePreview={() => setPreviewImageUrl(null)}
                  modifyRequest={modifyRequest}
                  onModifyRequestChange={setModifyRequest}
                  onRegenerate={previewItemKey ? handleRegenerateImage : undefined}
                  regenerating={regenerating}
                  referenceImageUrl={referenceImageUrl}
                  onReferenceUpload={handleReferenceUpload}
                  onClearReference={() => setReferenceImageUrl(null)}
                  playingTrack={playingTrack}
                  audioProgress={audioProgress}
                  onTogglePlay={handleTogglePlay}
                />
              </div>
            </div>
          )}

          {/* State 3: timeline + files */}
          {!storyboardActive && filesActive && timelineActive && (
            <div className="flex flex-col h-full gap-3 p-2">
              <div className="flex-[2] flex gap-3">
                <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                    <FolderIcon className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium text-gray-200">文件区</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <FolderIcon className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                      <p className="text-xs">文件区内容待开发</p>
                    </div>
                </div>
              </div>
              <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <BrowseArea 
                  previewImageUrl={previewImageUrl} 
                  previewVideoUrl={previewVideoUrl}
                  onClosePreview={() => { setPreviewImageUrl(null); setPreviewVideoUrl(null) }}
                  modifyRequest={modifyRequest}
                  onModifyRequestChange={setModifyRequest}
                  onRegenerate={previewItemKey ? handleRegenerateImage : undefined}
                  regenerating={regenerating}
                  referenceImageUrl={referenceImageUrl}
                  onReferenceUpload={handleReferenceUpload}
                  onClearReference={() => setReferenceImageUrl(null)}
                  playingTrack={playingTrack}
                  audioProgress={audioProgress}
                  onTogglePlay={handleTogglePlay}
                />
                </div>
              </div>
              <div className="flex-[1] flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                  <FilmIcon className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-medium text-gray-200">时间线</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <FilmIcon className="h-12 w-12 mx-auto mb-2 text-gray-600" />
                    <p className="text-sm">时间线编辑功能开发中</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* State 4: timeline only */}
          {!storyboardActive && !filesActive && timelineActive && (
            <div className="flex flex-col h-full gap-3 p-2">
              <div className="flex-[2] flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <BrowseArea 
                  previewImageUrl={previewImageUrl} 
                  onClosePreview={() => setPreviewImageUrl(null)}
                  modifyRequest={modifyRequest}
                  onModifyRequestChange={setModifyRequest}
                  onRegenerate={previewItemKey ? handleRegenerateImage : undefined}
                  regenerating={regenerating}
                  referenceImageUrl={referenceImageUrl}
                  onReferenceUpload={handleReferenceUpload}
                  onClearReference={() => setReferenceImageUrl(null)}
                  playingTrack={playingTrack}
                  audioProgress={audioProgress}
                  onTogglePlay={handleTogglePlay}
                />
              </div>
              <div className="flex-[1] flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                  <FilmIcon className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-medium text-gray-200">时间线</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <FilmIcon className="h-12 w-12 mx-auto mb-2 text-gray-600" />
                    <p className="text-sm">时间线编辑功能开发中</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* State 5: files only */}
          {!storyboardActive && filesActive && !timelineActive && (
            <div className="flex h-full gap-3 p-2">
              <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] rounded-t-lg" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
                  <FolderIcon className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-medium text-gray-200">文件区</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <FolderIcon className="h-12 w-12 mx-auto mb-2 text-gray-600" />
                    <p className="text-sm">文件区内容待开发</p>
                  </div>
                </div>
              </div>
              <div className="w-1/2 h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <BrowseArea 
                  previewImageUrl={previewImageUrl} 
                  onClosePreview={() => setPreviewImageUrl(null)}
                  modifyRequest={modifyRequest}
                  onModifyRequestChange={setModifyRequest}
                  onRegenerate={previewItemKey ? handleRegenerateImage : undefined}
                  regenerating={regenerating}
                  referenceImageUrl={referenceImageUrl}
                  onReferenceUpload={handleReferenceUpload}
                  onClearReference={() => setReferenceImageUrl(null)}
                  playingTrack={playingTrack}
                  audioProgress={audioProgress}
                  onTogglePlay={handleTogglePlay}
                />
              </div>
            </div>
          )}

          {/* State 6: all false */}
          {!storyboardActive && !filesActive && !timelineActive && (
            <div className="h-full flex flex-col p-2">
              <div className="h-full flex flex-col rounded-lg border border-white/[0.06] bg-[#0a0e18] p-2">
                <BrowseArea 
                  previewImageUrl={previewImageUrl} 
                  onClosePreview={() => setPreviewImageUrl(null)}
                  modifyRequest={modifyRequest}
                  onModifyRequestChange={setModifyRequest}
                  onRegenerate={previewItemKey ? handleRegenerateImage : undefined}
                  regenerating={regenerating}
                  referenceImageUrl={referenceImageUrl}
                  onReferenceUpload={handleReferenceUpload}
                  onClearReference={() => setReferenceImageUrl(null)}
                  playingTrack={playingTrack}
                  audioProgress={audioProgress}
                  onTogglePlay={handleTogglePlay}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right panel - always w-1/3 */}
        <div
          className={`w-1/3 ${boxClass}`}
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <ChatPanel conversation={conversation} initialPrompt={initialPrompt} />
        </div>
      </div>

      <ApiKeyModal open={showApiKeyModal} onClose={() => setShowApiKeyModal(false)} onSaved={handleApiKeySaved} />

      <ImageConfirmModal
        open={showImageConfirmModal}
        onConfirm={handleConfirmImage}
        onCancel={() => setShowImageConfirmModal(false)}
      />

      <Dialog open={showDevDialog} onClose={() => setShowDevDialog(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <DialogPanel
            className="rounded-xl border border-white/[0.06] p-6 max-w-sm w-full"
            style={{ background: 'linear-gradient(145deg, #141418 0%, #0f0f14 100%)' }}
          >
            <DialogTitle className="text-lg font-medium text-gray-200 mb-2">功能开发中</DialogTitle>
            <p className="text-sm text-gray-400 mb-6">该功能正在开发中，敬请期待...</p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowDevDialog(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg transition-colors"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)',
                  color: '#00aaff',
                  border: '1px solid rgba(0,170,255,0.3)',
                }}
              >
                确定
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={showConflictDialog} onClose={() => setShowConflictDialog(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <DialogPanel
            className="rounded-xl border border-white/[0.06] p-6 max-w-md w-full"
            style={{ background: 'linear-gradient(145deg, #141418 0%, #0f0f14 100%)' }}
          >
            <DialogTitle className="text-lg font-medium text-gray-200 mb-2">数据冲突</DialogTitle>
            <p className="text-sm text-gray-400 mb-6">
              该项目已被其他人修改，你的更改可能丢失。请重新加载项目以获取最新版本。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConflictDialog(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReloadProject}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)',
                  color: '#00aaff',
                  border: '1px solid rgba(0,170,255,0.3)',
                }}
              >
                重新加载
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  )
}
