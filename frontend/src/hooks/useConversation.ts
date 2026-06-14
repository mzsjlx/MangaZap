import { useState, useCallback, useRef } from 'react'
import { WIZARD_STEP_IDS, DURATION_MAP, VOICE_OPTIONS, getSelectedStyle, getStylePromptPrefix } from '../config/wizardSteps'
import { chatApi, createProject, saveProjectState, getProjectDetail, generateVoice, generateVideo } from '../services/api'
import { loadApiKeys } from '../utils/apiKeys'
import { playAudio, stopAudio, isAudioPlaying } from '../utils/audioPlayer'
import type { WizardOption, Question } from '../config/wizardSteps'

function getImageUrl(value: string | string[] | undefined): string | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] || null) : value
}

// Simplify name by removing parenthetical content
function simplifyName(name: string): string {
  return name.replace(/[（(].*?[）)]/g, '').trim()
}

// Find best match in image map using fuzzy matching
function findBestMatch(
  name: string,
  imageMap: Record<string, string[]>
): string | undefined {
  if (!name) return undefined

  // 1. Exact match
  if (imageMap[name] && imageMap[name].length > 0) {
    return imageMap[name][0]
  }

  // 2. Simplified match: remove parenthetical content
  const simplified = simplifyName(name)
  if (simplified !== name) {
    if (imageMap[simplified] && imageMap[simplified].length > 0) {
      return imageMap[simplified][0]
    }
  }

  // 3. Prefix-based fuzzy match
  const keys = Object.keys(imageMap)
  const prefix = name.startsWith('char_') ? 'char_' : name.startsWith('scene_') ? 'scene_' : null
  const baseName = prefix ? name.substring(prefix.length) : name
  const simplifiedBase = simplifyName(baseName)

  for (const key of keys) {
    if (imageMap[key].length === 0) continue
    const keyBase = prefix ? key.substring(prefix.length) : key
    if (keyBase.includes(simplifiedBase) || simplifiedBase.includes(keyBase)) {
      return imageMap[key][0]
    }
  }

  return undefined
}

interface ParsedFrame {
  order: number
  title: string
  timeRange: string
  shotType: string
  angle: string
  content: string
  lighting: string
  mood: string
  description: string
  characterName: string | null
  sceneName: string | null
  embeddedImages: string[]
  referenceImageUrl: string | null
}

function extractField(block: string, fieldName: string): string {
  const regex = new RegExp(`[-*]\\s*\\*?\\*?${fieldName}\\*?\\*?[：:]\\s*([\\s\\S]*?)(?=\\n[-*]\\s*\\*?\\*?|$)`)
  const match = block.match(regex)
  return match ? match[1].trim() : ''
}

// Extract shot type from content keywords
function extractShotTypeFromContent(content: string): string {
  if (content.includes('大远景')) return '大远景'
  if (content.includes('远景')) return '远景'
  if (content.includes('全景')) return '全景'
  if (content.includes('中景')) return '中景'
  if (content.includes('近景')) return '近景'
  if (content.includes('大特写')) return '大特写'
  if (content.includes('特写')) return '特写'
  return '中景'  // default
}

// Clean content by removing shot type keywords
function cleanContent(fullContent: string): string {
  let cleaned = fullContent

  // Remove leading shot type keywords
  const shotTypeKeywords = ['大远景', '远景', '全景', '中景', '近景', '特写', '大特写']
  for (const keyword of shotTypeKeywords) {
    if (cleaned.startsWith(keyword)) {
      cleaned = cleaned.substring(keyword.length).trim()
      // Remove leading punctuation
      cleaned = cleaned.replace(/^[。.，,、]/, '').trim()
      break
    }
  }

  return cleaned
}

function getVisualDescriptions(
  characterName: string | null,
  sceneName: string | null,
  keyElementsContent: string
): { characterVisual: string; sceneVisual: string } {
  let characterVisual = ''
  let sceneVisual = ''

  if (!keyElementsContent) return { characterVisual, sceneVisual }

  // Parse character description
  if (characterName) {
    const charRegex = new RegExp(`### (?:主角|配角)[：:]\\s*${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=### (?:主角|配角)|## |$)`, 'i')
    const charMatch = keyElementsContent.match(charRegex)
    if (charMatch) {
      characterVisual = charMatch[1]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/^[\-\*]\s+/gm, '')
        .replace(/\n+/g, '，')
        .trim()
    }
  }

  // Parse scene description
  if (sceneName) {
    const sceneRegex = new RegExp(`### (?:主要场景|次要场景)[一二三四五六七八九十\\d]*[：:]\\s*${sceneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=### (?:主要场景|次要场景)|## |$)`, 'i')
    const sceneMatch = keyElementsContent.match(sceneRegex)
    if (sceneMatch) {
      sceneVisual = sceneMatch[1]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/^[\-\*]\s+/gm, '')
        .replace(/\n+/g, '，')
        .trim()
    }
  }

  return { characterVisual, sceneVisual }
}

function parseStoryboardFrames(storyboardText: string): ParsedFrame[] {
  const frames: ParsedFrame[] = []
  
  // Remove metadata headers
  const cleanText = storyboardText
    .replace(/^#\s*分镜设计.*?\n/, '')
    .replace(/^\*?\*?总镜头数\*?\*?[：:]\s*\d+.*?\n/, '')
    .replace(/^\*?\*?预计总时长\*?\*?[：:].*?\n/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  
  // Split by **镜 to get each shot block
  const blocks = cleanText.split(/(?=\*\*镜[一二三四五六七八九十\d])/g).filter(b => b.trim().startsWith('**镜'))
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const lines = block.split('\n')
    
    // Extract title from first line: **镜一 · 标题**
    const titleLine = lines[0].trim()
    let title = titleLine
      .replace(/^\*\*镜[一二三四五六七八九十\d]+\s*[·\-]\s*/, '')
      .replace(/[（(][^）)]+[）)]/, '')
      .replace(/\*\*$/, '')
      .trim()
    if (!title) title = `镜头${i + 1}`
    
    // Extract description: lines after title until character/scene tags
    let description = ''
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j].trim()
      if (line.startsWith('角色：') || line.startsWith('- **角色**') ||
          line.startsWith('场景：') || line.startsWith('- **场景**')) break
      description += line + '\n'
    }
    description = description.trim()
    
    // Extract character and scene from raw block
    const roleMatch = block.match(/[-*]\s*\*\*角色\*\*[：:]\s*(.+)/)
    const sceneMatch = block.match(/[-*]\s*\*\*场景\*\*[：:]\s*(.+)/)
    const characterName = roleMatch ? roleMatch[1].split(/[,，、]/)[0].trim() : null
    const sceneName = sceneMatch ? sceneMatch[1].trim() : null
    
    console.log(`[DEBUG] Frame ${i}: title="${title}", descLength=${description.length}`)
    
    frames.push({
      order: i,
      title: `镜头${i + 1} · ${title}`,
      timeRange: '',
      shotType: extractShotTypeFromContent(description),
      angle: '',
      content: description,
      description,
      lighting: '',
      mood: '',
      characterName,
      sceneName,
      embeddedImages: [],
      referenceImageUrl: null
    })
  }
  
  console.log(`[DEBUG] parseStoryboardFrames: parsed ${frames.length} frames`)
  return frames
}

function resolveRefImage(
  characterName: string | null,
  sceneName: string | null,
  selectedRefImages: Record<string, string>,
  keyElemImages: Record<string, string[]>
): string | undefined {
  // Handle multiple character names (e.g., "林晓，陈晨") - take first one
  const firstCharName = characterName ? characterName.split(/[,，、]/)[0].trim() : null
  const simpleCharName = firstCharName ? simplifyName(firstCharName) : null
  const simpleSceneName = sceneName ? simplifyName(sceneName) : null

  // Priority 1: User-selected reference images (exact match)
  if (firstCharName) {
    const charKey = `char_${firstCharName}`
    if (selectedRefImages[charKey]) return selectedRefImages[charKey]
    if (simpleCharName && simpleCharName !== firstCharName) {
      const simpleKey = `char_${simpleCharName}`
      if (selectedRefImages[simpleKey]) return selectedRefImages[simpleKey]
    }
  }
  if (sceneName) {
    const sceneKey = `scene_${sceneName}`
    if (selectedRefImages[sceneKey]) return selectedRefImages[sceneKey]
    if (simpleSceneName && simpleSceneName !== sceneName) {
      const simpleKey = `scene_${simpleSceneName}`
      if (selectedRefImages[simpleKey]) return selectedRefImages[simpleKey]
    }
  }

  // Priority 2: Auto-generated key element images (fuzzy match)
  if (firstCharName) {
    const charKey = `char_${firstCharName}`
    const match = findBestMatch(charKey, keyElemImages)
    if (match) return match
  }
  if (sceneName) {
    const sceneKey = `scene_${sceneName}`
    const match = findBestMatch(sceneKey, keyElemImages)
    if (match) return match
  }

  return undefined
}

// Convert Chinese character names to pinyin
function toPinyin(name: string): string {
  const map: Record<string, string> = {
    '林晓': 'Lin Xiao', '陈默': 'Chen Mo', '树声': 'Shu Sheng',
    '小禾': 'Xiao He', '无': 'character',
  }
  return map[name] || name
}

// Extract key action from content (remove camera technical descriptions)
function extractAction(content: string): string {
  return content
    .replace(/镜头从.*?开始[，,]/g, '')  // Remove "镜头从...开始"
    .replace(/采用.*?[。，]/g, '')       // Remove "采用全景"
    .replace(/音效.*$/g, '')             // Remove sound effects
    .replace(/^\s*[，,、]\s*/, '')       // Remove leading punctuation
    .trim()
    .slice(0, 80)
}

// Parse LLM response to extract 3 prompts
function parsePrompts(text: string): string[] {
  if (!text || text.length < 50) return []

  const prompts: string[] = []

  // Method 1: Split by newline, match lines starting with "cinematic"
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  for (const line of lines) {
    if (line.startsWith('cinematic') && line.length > 50) {
      prompts.push(line)
    }
  }

  // If found 3, return
  if (prompts.length >= 3) {
    return [...new Set(prompts)].slice(0, 3)
  }

  // Method 2: Match "1. cinematic..." format
  if (prompts.length === 0) {
    const numMatch = text.match(/\d+\.\s*(cinematic[^\n]+)/g)
    if (numMatch) {
      for (const m of numMatch) {
        const cleaned = m.replace(/^\d+\.\s*/, '').trim()
        if (cleaned.startsWith('cinematic') && cleaned.length > 50) {
          prompts.push(cleaned)
        }
      }
    }
  }

  // Method 3: Match "Prompt 1: cinematic..." format
  if (prompts.length === 0) {
    const promptMatch = text.match(/Prompt\s*\d+:\s*(cinematic[\s\S]*?)(?=Prompt\s*\d+:|$)/gi)
    if (promptMatch) {
      for (const m of promptMatch) {
        const cleaned = m.replace(/Prompt\s*\d+:\s*/i, '').trim()
        if (cleaned.startsWith('cinematic') && cleaned.length > 50) {
          prompts.push(cleaned)
        }
      }
    }
  }

  // Method 4: If only 1 prompt found but it's very long (>600 chars), try splitting
  if (prompts.length === 1 && prompts[0].length > 600) {
    const fullText = prompts[0]
    const parts = fullText.split(/(?=cinematic,?\s*film still)/gi).filter(p => p.trim().length > 80)
    if (parts.length >= 3) {
      return parts.slice(0, 3)
    }
  }

  // Method 5: Prompts concatenated together (no line breaks, original text)
  if (prompts.length < 3) {
    const parts = text.split(/(?=cinematic,?\s*film still)/gi).filter(p => p.trim().length > 80)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.startsWith('cinematic') && trimmed.length > 80) {
        if (!prompts.some(p => p.substring(0, 50) === trimmed.substring(0, 50))) {
          prompts.push(trimmed)
        }
      }
    }
  }

  // Deduplicate and limit to 3
  const unique = [...new Set(prompts)]
  return unique.slice(0, 3)
}

// Check if LLM response is invalid (Chinese chat, system prompt echo, etc.)
function isInvalidResponse(text: string): boolean {
  // Only detect obvious Chinese chat patterns
  const chatPatterns = [
    /请问/, /已为您/, /很动人/, /温馨/, /需要继续/, /下一个/,
    /好的/, /明白/, /收到/, /没问题/, /请问需要/,
  ]

  // If it's English and long enough, it's valid
  const hasChinese = /[\u4e00-\u9fa5]/.test(text)
  const isLongEnough = text.length > 200

  // If no Chinese and long enough, definitely valid
  if (!hasChinese && isLongEnough) {
    return false
  }

  // Otherwise check for chat patterns
  return chatPatterns.some(p => p.test(text)) || text.length < 100
}

// Build intelligent fallback with 3 distinct perspectives
function buildFallback(frame: ParsedFrame): string[] {
  const prefix = 'cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field'
  const char = toPinyin(frame.characterName || 'character')
  const scene = frame.sceneName || 'abandoned space'

  // Extract key action (remove camera technical descriptions)
  const action = extractAction(frame.content || '')

  return [
    // Scene 1: Wide shot / Environment - character in scene + environment
    `${prefix}, wide shot eye-level, ${char} ${action}, ${scene} environment with dust floating in warm sunbeam, cracked wooden surfaces and scattered objects, warm golden afternoon side light casting long geometric shadows, nostalgic melancholic atmosphere`,

    // Scene 2: Close-up / Detail - focusing on specific detail from the action
    `${prefix}, extreme close-up macro, ${char}'s hands or face during ${action}, weathered texture and dust motes dancing in focused light beam, soft diffused golden window light shallow depth of field blurring background, intimate bittersweet feeling`,

    // Scene 3: Medium shot / Relationship - environment reaction (NO duplication of action)
    `${prefix}, medium shot over-shoulder, ${scene} environment with warm afternoon light, secondary character or ambient reaction visible, lens flare and soft bokeh circles, gentle protective mood of unspoken understanding`
  ]
}

function validateOutput(rawText: string): { valid: boolean; reason?: string; data?: string[] } {
  const blacklist = [
    '类型', '时长', '基调', '梗概', '人物设定', '场景分幕',
    '第一幕', '第二幕', '第三幕', '第四幕', '冲突', '主题', '隐喻',
    '象征着', '这一幕', '性格', '背景故事', '心理', '他是一个', '内心独白',
    '📜', 'Scene', 'Act', 'Profile', 'Introduction', '角色', '外貌'
  ]

  for (const word of blacklist) {
    if (rawText.includes(word)) {
      return { valid: false, reason: `检测到禁用词"${word}"` }
    }
  }

  const lines = rawText.split('\n').filter(l => l.trim())

  if (lines.length !== 3) {
    return { valid: false, reason: `必须输出3行，实际${lines.length}行` }
  }

  for (let i = 0; i < 3; i++) {
    if (!lines[i].trim().startsWith(`Prompt ${i + 1}:`)) {
      return { valid: false, reason: `第${i + 1}行必须以"Prompt ${i + 1}:"开头` }
    }
  }

  // Check for 5 required tags
  const requiredTags = ['[shot:', '[subject:', '[details:', '[lighting:', '[mood:']
  for (const tag of requiredTags) {
    if (!rawText.includes(tag)) {
      return { valid: false, reason: `缺少标签${tag}` }
    }
  }

  const prompts = lines.map(line =>
    line.replace(/^Prompt\s*[123]:\s*/, '').trim()
  )

  return { valid: true, data: prompts }
}

import type { ScriptDraftData } from '../components/ScriptDraft'

export type OnConflictCallback = () => void

export interface UseConversationOptions {
  onConflict?: OnConflictCallback
  initialPrompt?: string
}

export type ConvPhase =
  | 'idle'
  | 'wizard'
  | 'generating_script'
  | 'script_review'
  | 'modifying'
  | 'selecting_mod_category'
  | 'regenerating_script'
  | 'generating_storyboard'
  | 'generating_key_elements'
  | 'generating_narration'
  | 'generating_dialogue'
  | 'key_elements_review'
  | 'narration_review'
  | 'dialogue_review'
  | 'storyboard_review'
  | 'confirming_image'
  | 'voice_selection'
  | 'video_ready'
  | 'generating_video'
  | 'video_done'
  | 'done'

export type SubPhase =
  | 'none'
  | 'key_elements'
  | 'narration'
  | 'dialogue'
  | 'storyboard'
  | 'image_confirm'

export interface ConvMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  status: 'sending' | 'generating' | 'done' | 'error'
  options?: WizardOption[]
  allowCustom?: boolean
  customPlaceholder?: string
  scriptDraft?: ScriptDraftData | null
  storyboardContent?: string | null
  keyElementsContent?: string | null
  narrationContent?: string | null
  dialogueContent?: string | null
  optimizedPromptsContent?: string | null
  showModCategories?: boolean
  selectedCategory?: string | null
  retryable?: boolean
  voiceOptions?: WizardOption[]
  actions?: Array<{ id: string; label: string; description: string }>
}

const CUSTOM_OPTION: WizardOption = { id: '__custom__', label: 'AI助手', description: '让AI帮你推荐', icon: '🤖' }
const FREE_INPUT_OPTION: WizardOption = { id: '__free_input__', label: '自由输入', description: '自己输入想法', icon: '✏️' }
const CONFIRM_OPTION: WizardOption = { id: '__confirm__', label: '确认', description: '确认进入下一步' }

export function useConversation(options: UseConversationOptions = {}) {
  const { onConflict, initialPrompt } = options

  const [phase, setPhase] = useState<ConvPhase>('idle')
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<ConvMessage[]>([])
  const [scriptContent, setScriptContent] = useState<string>('')
  const [storyboardContent, setStoryboardContent] = useState<string>('')
  const [keyElementsContent, setKeyElementsContent] = useState<string>('')
  const [narrationContent, setNarrationContent] = useState<string>('')
  const [dialogueContent, setDialogueContent] = useState<string>('')
  const [optimizedPrompts, setOptimizedPrompts] = useState<string>('')
  const [editOptimizedPrompts, setEditOptimizedPrompts] = useState<boolean>(false)
  const [currentSubPhase, setCurrentSubPhase] = useState<SubPhase>('none')
  const [keyElementsImages, setKeyElementsImages] = useState<Record<string, string[]>>({})
  const [generatingKeyElementsImages, setGeneratingKeyElementsImages] = useState(false)
  const [keyElementsImageProgress, setKeyElementsImageProgress] = useState('')
  const [keyElementsProgress, setKeyElementsProgress] = useState<Record<string, number>>({})
  const [keyFramesImages, setKeyFramesImages] = useState<Record<number, string[]>>({})
  const [generatingKeyFrames, setGeneratingKeyFrames] = useState(false)
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<Record<string, string>>({})
  const [awaitingReferenceSelection, setAwaitingReferenceSelection] = useState(false)
  const [awaitingScriptDecision, setAwaitingScriptDecision] = useState(false)
  
  // Voice track states
  const [voiceTracks, setVoiceTracks] = useState<Record<string, Array<{
    id: string
    version: number
    character: string
    voice: string
    audioUrl: string
    waveform: number[]
    color: string
    isSelected: boolean
  }>>>({})
  const [generatingVoice, setGeneratingVoice] = useState(false)
  const [currentPlayingTrackId, setCurrentPlayingTrackId] = useState<string | null>(null)
  const [audioProgress, setAudioProgress] = useState(0)
  
  // Video generation states
  const [keyFrameVideos, setKeyFrameVideos] = useState<Record<string, string>>({})
  const [generatingVideo, setGeneratingVideo] = useState(false)

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [session, setSession] = useState<Record<string, string | null>>({})

  const lastActionRef = useRef<{ action: string; data: Record<string, unknown> } | null>(null)
  const isConfirmingScript = useRef(false)

  // Project management states
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null)
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<string | null>(null)
  const [isConflict, setIsConflict] = useState(false)
  const saveRetryCount = useRef(0)
  const MAX_RETRY = 3

  const addMessage = useCallback((msg: Omit<ConvMessage, 'id' | 'timestamp'>) => {
    const newMsg: ConvMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, newMsg])
    return newMsg.id
  }, [])

  const updateMessage = useCallback((id: string, updates: Partial<ConvMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)))
  }, [])

  const setSelectedReferenceImage = useCallback((key: string, imageUrl: string) => {
    setSelectedReferenceImages(prev => ({ ...prev, [key]: imageUrl }))
  }, [])

  const getApiConfig = useCallback(() => {
    const keys = loadApiKeys()
    return {
      key: keys.text || '',
      base_url: keys.base_url || 'https://api.mimo.com/v1',
      model: keys.model || 'mimo-v2.5',
    }
  }, [])

  const hasApiConfig = useCallback(() => {
    const config = getApiConfig()
    return !!config.key
  }, [getApiConfig])

  // ===== Project Management Functions =====

  const createNewProject = useCallback(async (idea: string) => {
    try {
      const result = await createProject({ idea })
      setProjectId(result.id)
      setProjectUpdatedAt(result.updated_at)
      return result.id
    } catch (error) {
      console.error('Failed to create project:', error)
      return null
    }
  }, [])

  const saveProject = useCallback(async (retryCount = 0) => {
    if (!projectId || isSaving || isConflict) return

    setIsSaving(true)
    try {
      const state = {
        phase,
        currentSubPhase,
        scriptContent,
        storyboardContent,
        keyElementsContent,
        narrationContent,
        dialogueContent,
        optimizedPrompts,
        keyElementsImages,
        keyFramesImages,
        keyFrameVideos,
        selectedReferenceImages,
        awaitingReferenceSelection,
        voiceTracks,
        session,
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          status: msg.status,
          options: msg.options,
          allowCustom: msg.allowCustom,
          customPlaceholder: msg.customPlaceholder,
          scriptDraft: msg.scriptDraft,
          storyboardContent: msg.storyboardContent,
          keyElementsContent: msg.keyElementsContent,
          narrationContent: msg.narrationContent,
          dialogueContent: msg.dialogueContent,
          optimizedPromptsContent: msg.optimizedPromptsContent,
          showModCategories: msg.showModCategories,
          selectedCategory: msg.selectedCategory,
          retryable: msg.retryable,
          voiceOptions: msg.voiceOptions,
          actions: msg.actions,
        })),
        questions,
        currentQuestionIndex,
      }

      await saveProjectState(projectId, state as any)
      setLastSaveTime(new Date())
      setProjectUpdatedAt(new Date().toISOString())
      saveRetryCount.current = 0
    } catch (error: any) {
      console.error('Failed to save project:', error)

      if (error.message?.includes('409') || error.message?.includes('CONFLICT')) {
        setIsConflict(true)
        if (onConflict) onConflict()
        return
      }

      if (retryCount < MAX_RETRY) {
        const delay = Math.pow(2, retryCount) * 1000
        setTimeout(() => {
          saveProject(retryCount + 1)
        }, delay)
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    projectId, isSaving, isConflict, phase, currentSubPhase,
    scriptContent, storyboardContent, keyElementsContent,
    narrationContent, dialogueContent, optimizedPrompts,
    keyElementsImages, keyFramesImages, keyFrameVideos, selectedReferenceImages, voiceTracks, session, messages,
    questions, currentQuestionIndex, onConflict
  ])

  const initWorkspaceWithScriptPrompt = useCallback(() => {
    setAwaitingScriptDecision(true)
    addMessage({
      role: 'assistant',
      content: '欢迎来到漫剧创作工作室！请问你有现成的剧本吗？',
      status: 'done',
      options: [
        { id: '__has_script__', label: '📄 我有剧本', description: '上传或粘贴已有剧本' },
        { id: '__no_script__', label: '✍️ 我没有剧本', description: '通过向导引导创作' },
      ],
    })
  }, [addMessage])

  const startWizard = useCallback(
    async (userTopic: string) => {
      setSession({ topic: userTopic })
      setPhase('wizard')
      setCurrentSubPhase('none')
      addMessage({ role: 'user', content: userTopic, status: 'done' })
      const msgId = addMessage({ role: 'assistant', content: '', status: 'generating' })
      try {
        const result = await chatApi({
          action: 'generate_questions',
          api_config: getApiConfig(),
          topic: userTopic,
        })
        const fetchedQuestions: Question[] = (result.questions || []).map((q) => ({
          id: q.id,
          text: q.text,
          options: q.options.map((o, i) => ({
            id: o.label === '自由输入' ? '__free_input__' : o.label === 'AI推荐' ? '__ai_recommend__' : `${q.id}_${i}`,
            label: o.label,
            description: o.description,
          })),
        }))
        if (fetchedQuestions.length > 0) {
          setQuestions(fetchedQuestions)
          setCurrentQuestionIndex(0)
          updateMessage(msgId, {
            content: result.greeting || '好的，让我问你几个问题来明确创作方向。',
            status: 'done',
          })
          const firstQ = fetchedQuestions[0]
          addMessage({
            role: 'assistant',
            content: firstQ.text,
            status: 'done',
            options: firstQ.options,
            allowCustom: true,
            customPlaceholder: '请输入你想要的...',
          })
        } else {
          updateMessage(msgId, { content: '获取问题失败，请重试。', status: 'error', retryable: true })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        updateMessage(msgId, { content: `获取问题失败：${errorMsg}`, status: 'error', retryable: true })
      }
    },
    [addMessage, updateMessage, getApiConfig]
  )

  const confirmHasScript = useCallback(async (hasScript: boolean, scriptText?: string) => {
    if (!hasScript) {
      setAwaitingScriptDecision(false)
      addMessage({ role: 'user', content: '我没有剧本', status: 'done' })
      addMessage({
        role: 'assistant',
        content: '好的，请告诉我你想创作的主题（例如：校园恋爱、悬疑推理、古风仙侠等）。',
        status: 'done',
      })
      setPhase('wizard')
      return
    }

    if (scriptText && scriptText.trim().length > 0) {
      setAwaitingScriptDecision(false)
      addMessage({
        role: 'user',
        content: scriptText.length > 500 ? scriptText.slice(0, 500) + '...' : scriptText,
        status: 'done',
      })
      setScriptContent(scriptText)
      setPhase('script_review')
      setCurrentSubPhase('none')
      let draft = parseScriptDraft(scriptText)
      if (!draft.synopsis && draft.characters.length === 0 && draft.scenes.length === 0) {
        draft = { ...draft, synopsis: scriptText }
      }
      addMessage({
        role: 'assistant',
        content: '剧本已接收，请查看下方预览。确认后点击"同意，开始制作"。',
        status: 'done',
        scriptDraft: draft,
      })
      if (!projectId) {
        await createNewProject(scriptText.slice(0, 30))
      }
      await saveProject()
      return
    }

    // hasScript but no content yet — awaitingScriptDecision stays true
    addMessage({ role: 'user', content: '我有剧本', status: 'done' })
    addMessage({
      role: 'assistant',
      content: '请直接粘贴你的剧本内容，或点击输入框旁的「+」按钮上传 .txt 文件。',
      status: 'done',
    })
  }, [addMessage, setScriptContent, setPhase, createNewProject, saveProject, projectId])

  const loadProject = useCallback(async (id: string) => {
    try {
      const project = await getProjectDetail(id)
      if (!project) return false

      setProjectId(project.id)
      setProjectUpdatedAt(project.updated_at)
      setIsConflict(false)

      if (project.conversation_state) {
        const state = project.conversation_state
        setPhase(state.phase || 'idle')
        setCurrentSubPhase(state.currentSubPhase || 'none')
        setScriptContent(state.scriptContent || '')
        setStoryboardContent(state.storyboardContent || '')
        setKeyElementsContent(state.keyElementsContent || '')
        setNarrationContent(state.narrationContent || '')
        setDialogueContent(state.dialogueContent || '')
        setOptimizedPrompts(state.optimizedPrompts || '')
        // Backward compat: convert old Record<string,string> to Record<string,string[]>
        const rawImages = state.keyElementsImages || {}
        const normalizedImages: Record<string, string[]> = {}
        for (const [key, val] of Object.entries(rawImages)) {
          normalizedImages[key] = Array.isArray(val) ? val : [val as string]
        }
        setKeyElementsImages(normalizedImages)
        // Backward compat: migrate old shotImages to keyFramesImages
        if (state.keyFramesImages) {
          setKeyFramesImages(state.keyFramesImages)
        } else if (state.shotImages) {
          const migrated: Record<number, string[]> = {}
          for (const [k, v] of Object.entries(state.shotImages)) {
            migrated[parseInt(k)] = [v as string]
          }
          setKeyFramesImages(migrated)
        }
        setSelectedReferenceImages(state.selectedReferenceImages || {})
        setKeyFrameVideos(state.keyFrameVideos || {})
        setVoiceTracks(state.voiceTracks || {})
        setAwaitingReferenceSelection(state.awaitingReferenceSelection || false)
        setSession(state.session || {})
        setQuestions(state.questions || [])
        setCurrentQuestionIndex(state.currentQuestionIndex || 0)

        const restoredMessages = (state.messages || []).map((msg: any) => {
          if (msg.scriptDraft === undefined && msg.content && msg.role === 'assistant') {
            const hasScriptContent = msg.content.includes('📜') ||
                                    msg.content.includes('类型') ||
                                    msg.content.includes('场景')
            if (hasScriptContent) {
              return { ...msg, scriptDraft: parseScriptDraft(msg.content) }
            }
          }
          return msg
        })
        setMessages(restoredMessages)
      }

      return true
    } catch (error) {
      console.error('Failed to load project:', error)
      return false
    }
  }, [])

  const resolveConflict = useCallback(async () => {
    if (projectId) {
      await loadProject(projectId)
    }
  }, [projectId, loadProject])

  const fetchNextStep = useCallback(
    async (stepIndex: number, currentChoices: Record<string, string>) => {
      const stepId = WIZARD_STEP_IDS[stepIndex]
      if (!stepId) return
      const topic = currentChoices.topic || ''
      const msgId = addMessage({ role: 'assistant', content: '', status: 'generating' })
      try {
        const result = await chatApi({
          action: 'next_step',
          api_config: getApiConfig(),
          step_id: stepId,
          topic,
          choices: currentChoices,
        })
        const aiOptions = (result.options || []).filter(
          (opt) => !opt.label.includes('其他') && !opt.label.includes('AI助手') && opt.id !== '__custom__' && opt.id !== '__free_input__'
        )
        const optionsWithExtra = [...aiOptions, FREE_INPUT_OPTION, CUSTOM_OPTION]
        updateMessage(msgId, {
          content: result.content || `请选择${stepId}：`,
          status: 'done',
          options: optionsWithExtra,
          allowCustom: true,
          customPlaceholder: '请输入你想要的...',
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        updateMessage(msgId, {
          content: `获取选项失败：${errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    },
    [addMessage, updateMessage, getApiConfig]
  )

  const generateScript = useCallback(
    async (allChoices: Record<string, string | null>) => {
      setPhase('generating_script')
      setCurrentSubPhase('none')
      const msgId = addMessage({ role: 'assistant', content: '正在为你生成剧本...', status: 'generating' })
      const apiConfig = getApiConfig()
      lastActionRef.current = { action: 'generate_script', data: { session: allChoices } }
      try {
        const result = await chatApi({
          action: 'generate_script',
          api_config: apiConfig,
          session: allChoices,
        })
        setScriptContent(result.content)
        setPhase('script_review')
        updateMessage(msgId, {
          content: '剧本已生成，请查看：',
          status: 'done',
          scriptDraft: parseScriptDraft(result.content),
        })
        if (!projectId) {
          const idea = allChoices.topic || allChoices.genre || '未命名项目'
          await createNewProject(idea)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('idle')
        setCurrentSubPhase('none')
        updateMessage(msgId, {
          content: `剧本生成失败：${errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    },
    [addMessage, updateMessage, getApiConfig, projectId, createNewProject]
  )

  const selectOption = useCallback(
    async (questionId: string, value: string, label?: string) => {
      const displayValue = label || value
      addMessage({ role: 'user', content: displayValue, status: 'done' })
      const newSession = { ...session, [questionId]: value }
      setSession(newSession)
      const nextIndex = currentQuestionIndex + 1
      if (nextIndex < questions.length) {
        setCurrentQuestionIndex(nextIndex)
        const nextQ = questions[nextIndex]
        addMessage({
          role: 'assistant',
          content: nextQ.text,
          status: 'done',
          options: nextQ.options,
          allowCustom: true,
          customPlaceholder: '请输入你想要的...',
        })
      } else {
        await generateScript(newSession)
      }
    },
    [session, currentQuestionIndex, questions, addMessage, generateScript]
  )

  const aiRecommend = useCallback(
    async (fieldId: string) => {
      const msgId = addMessage({ role: 'assistant', content: 'AI 正在为你推荐...', status: 'generating' })
      try {
        const result = await chatApi({
          action: 'ai_recommend',
          api_config: getApiConfig(),
          topic: session.topic || '',
          field_id: fieldId,
          session,
        })
        const recommendLabel = result.label || 'AI推荐'
        const recommendDesc = result.description || ''
        updateMessage(msgId, {
          content: `AI推荐：${recommendLabel} — ${recommendDesc}`,
          status: 'done',
        })
        await selectOption(fieldId, recommendLabel, recommendLabel)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        updateMessage(msgId, { content: `AI推荐失败：${errorMsg}`, status: 'error' })
      }
    },
    [session, addMessage, updateMessage, getApiConfig, selectOption]
  )

  const confirmScript = useCallback(async () => {
    if (isConfirmingScript.current) return
    isConfirmingScript.current = true

    try {
      addMessage({ role: 'user', content: '同意，开始制作', status: 'done' })
      setCurrentSubPhase('none')

      setPhase('generating_key_elements')
      const msgId = addMessage({ role: 'assistant', content: '正在生成关键视觉元素...', status: 'generating' })
      lastActionRef.current = { action: 'generate_key_elements', data: {} }

      try {
        const apiConfig = getApiConfig()
        const result = await chatApi({
          action: 'generate_key_elements',
          api_config: apiConfig,
          script_content: scriptContent,
        })
        setKeyElementsContent(result.content)
        setPhase('key_elements_review')
        setCurrentSubPhase('key_elements')
        updateMessage(msgId, {
          content: `**关键视觉元素**\n\n${result.content}\n\n---\n请确认或输入修改意见（如"把主角改成红色头发"）`,
          status: 'done',
          keyElementsContent: result.content,
          options: [CONFIRM_OPTION],
        })
        await saveProject()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('idle')
        setCurrentSubPhase('none')
        updateMessage(msgId, {
          content: `关键元素生成失败：${errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    } finally {
      isConfirmingScript.current = false
    }
  }, [scriptContent, addMessage, updateMessage, getApiConfig, saveProject])

  const confirmKeyElements = useCallback(async () => {
    addMessage({ role: 'user', content: '确认', status: 'done' })

    setPhase('generating_narration')
    const msgId = addMessage({ role: 'assistant', content: '正在生成旁白和音乐提示...', status: 'generating' })
    lastActionRef.current = { action: 'generate_narration', data: {} }

    try {
      const apiConfig = getApiConfig()
      const dialogueType = (session.dialogue as string) || '有对白'
      const result = await chatApi({
        action: 'generate_narration',
        api_config: apiConfig,
        script_content: scriptContent,
        dialogue_type: dialogueType,
      })
      setNarrationContent(result.content)
      setPhase('narration_review')
      setCurrentSubPhase('narration')
      updateMessage(msgId, {
        content: `**旁白与音乐**\n\n${result.content}\n\n---\n请确认或输入修改意见`,
        status: 'done',
        narrationContent: result.content,
        options: [CONFIRM_OPTION],
        })
        await saveProject()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('key_elements_review')
        setCurrentSubPhase('key_elements')
        updateMessage(msgId, {
          content: `旁白生成失败：${errorMsg}`,
        status: 'error',
        retryable: true,
      })
    }
  }, [scriptContent, session, addMessage, updateMessage, getApiConfig, saveProject])

  const _generateStoryboardDirect = useCallback(async () => {
    setPhase('generating_storyboard')
    const msgId = addMessage({ role: 'assistant', content: '正在生成分镜设计...', status: 'generating' })
    const apiConfig = getApiConfig()
    const durationStr = (session.duration as string) || '1_2min'
    const targetDuration = DURATION_MAP[durationStr] || 0
    lastActionRef.current = { action: 'generate_storyboard', data: { script_content: scriptContent, target_duration: targetDuration, duration_str: durationStr } }

    try {
      const result = await chatApi({
        action: 'generate_storyboard',
        api_config: apiConfig,
        script_content: scriptContent,
        target_duration: targetDuration,
        duration_str: durationStr,
      })
      const sbContent = result.content || '# 分镜设计\n\n**总镜头数**：4 | **预计总时长**：' + targetDuration + '秒'
      setStoryboardContent(sbContent)
      setPhase('storyboard_review')
      setCurrentSubPhase('storyboard')
      updateMessage(msgId, {
        content: `**分镜设计**\n\n${sbContent}\n\n---\n请确认或输入修改意见`,
        status: 'done',
        storyboardContent: sbContent,
        options: [CONFIRM_OPTION],
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setPhase('dialogue_review')
      setCurrentSubPhase('dialogue')
      updateMessage(msgId, {
        content: `分镜生成失败：${errorMsg}`,
        status: 'error',
        retryable: true,
      })
    }
  }, [scriptContent, session, addMessage, updateMessage, getApiConfig])

  const confirmNarration = useCallback(async () => {
    addMessage({ role: 'user', content: '确认', status: 'done' })

    const dialogueType = (session.dialogue as string) || '有对白'
    if (dialogueType === '有对白' || dialogueType === '人物之间的对白') {
      setPhase('generating_dialogue')
      const msgId = addMessage({ role: 'assistant', content: '正在生成角色对话...', status: 'generating' })
      lastActionRef.current = { action: 'generate_dialogue', data: {} }

      try {
        const apiConfig = getApiConfig()
        const result = await chatApi({
          action: 'generate_dialogue',
          api_config: apiConfig,
          script_content: scriptContent,
        })
        setDialogueContent(result.content)
        setPhase('dialogue_review')
        setCurrentSubPhase('dialogue')
        updateMessage(msgId, {
          content: `**角色对话**\n\n${result.content}\n\n---\n请确认或输入修改意见`,
          status: 'done',
          dialogueContent: result.content,
          options: [CONFIRM_OPTION],
        })
        await saveProject()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('narration_review')
        setCurrentSubPhase('narration')
        updateMessage(msgId, {
          content: `对话生成失败：${errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    } else {
      await _generateStoryboardDirect()
    }
  }, [scriptContent, session, addMessage, updateMessage, getApiConfig, _generateStoryboardDirect, saveProject])

  const confirmDialogue = useCallback(async () => {
    addMessage({ role: 'user', content: '确认', status: 'done' })
    await _generateStoryboardDirect()
    await saveProject()
  }, [addMessage, _generateStoryboardDirect, saveProject])

  const modifyKeyElements = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '正在修改关键元素...', status: 'generating' })
    lastActionRef.current = { action: 'modify_key_elements', data: { original_content: keyElementsContent, modification_request: modificationRequest } }

    try {
      const apiConfig = getApiConfig()
      const result = await chatApi({
        action: 'modify_key_elements',
        api_config: apiConfig,
        original_content: keyElementsContent,
        modification_request: modificationRequest,
      })
      setKeyElementsContent(result.content)
      setPhase('key_elements_review')
      updateMessage(msgId, {
        content: `**关键视觉元素（已修改）**\n\n${result.content}\n\n---\n请确认或继续修改`,
        status: 'done',
        keyElementsContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `修改失败：${errorMsg}`, status: 'error', retryable: true })
    }
  }, [keyElementsContent, addMessage, updateMessage, getApiConfig, saveProject])

  const modifyNarration = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '正在修改旁白...', status: 'generating' })
    lastActionRef.current = { action: 'modify_narration', data: { original_content: narrationContent, modification_request: modificationRequest } }

    try {
      const apiConfig = getApiConfig()
      const result = await chatApi({
        action: 'modify_narration',
        api_config: apiConfig,
        original_content: narrationContent,
        modification_request: modificationRequest,
      })
      setNarrationContent(result.content)
      setPhase('narration_review')
      updateMessage(msgId, {
        content: `**旁白与音乐（已修改）**\n\n${result.content}\n\n---\n请确认或继续修改`,
        status: 'done',
        narrationContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `修改失败：${errorMsg}`, status: 'error', retryable: true })
    }
  }, [narrationContent, addMessage, updateMessage, getApiConfig, saveProject])

  const modifyDialogue = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '正在修改对话...', status: 'generating' })
    lastActionRef.current = { action: 'modify_dialogue', data: { original_content: dialogueContent, modification_request: modificationRequest } }

    try {
      const apiConfig = getApiConfig()
      const result = await chatApi({
        action: 'modify_dialogue',
        api_config: apiConfig,
        original_content: dialogueContent,
        modification_request: modificationRequest,
      })
      setDialogueContent(result.content)
      setPhase('dialogue_review')
      updateMessage(msgId, {
        content: `**角色对话（已修改）**\n\n${result.content}\n\n---\n请确认或继续修改`,
        status: 'done',
        dialogueContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `修改失败：${errorMsg}`, status: 'error', retryable: true })
    }
  }, [dialogueContent, addMessage, updateMessage, getApiConfig, saveProject])

  const modifyStoryboard = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '正在修改分镜...', status: 'generating' })
    lastActionRef.current = { action: 'modify_storyboard', data: { original_content: storyboardContent, modification_request: modificationRequest } }

    try {
      const apiConfig = getApiConfig()
      const result = await chatApi({
        action: 'modify_storyboard',
        api_config: apiConfig,
        original_content: storyboardContent,
        modification_request: modificationRequest,
      })
      setStoryboardContent(result.content)
      setPhase('storyboard_review')
      updateMessage(msgId, {
        content: `**分镜设计（已修改）**\n\n${result.content}\n\n---\n请确认或继续修改`,
        status: 'done',
        storyboardContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `修改失败：${errorMsg}`, status: 'error', retryable: true })
    }
  }, [storyboardContent, addMessage, updateMessage, getApiConfig, saveProject])

  const requestModification = useCallback(() => {
    setPhase('selecting_mod_category')
    const lastScriptMsg = [...messages].reverse().find((m) => m.scriptDraft)
    if (lastScriptMsg) {
      updateMessage(lastScriptMsg.id, { showModCategories: true })
    }
  }, [messages, updateMessage])

  const selectModCategory = useCallback(
    (categoryId: string) => {
      const lastScriptMsg = [...messages].reverse().find((m) => m.scriptDraft)
      if (lastScriptMsg) {
        updateMessage(lastScriptMsg.id, { selectedCategory: categoryId })
      }
    },
    [messages, updateMessage]
  )

  const selectModSubOption = useCallback(
    async (categoryId: string, subOption: string) => {
      setPhase('regenerating_script')
      addMessage({ role: 'user', content: `修改${categoryId}：${subOption}`, status: 'done' })
      const msgId = addMessage({ role: 'assistant', content: `正在根据「${subOption}」修改剧本...`, status: 'generating' })
      const apiConfig = getApiConfig()
      lastActionRef.current = { action: 'modify_script', data: { category: categoryId, sub_option: subOption } }

      try {
        const result = await chatApi({
          action: 'modify_script',
          api_config: apiConfig,
          modification_category: categoryId,
          sub_option: subOption,
          original_script: scriptContent,
        })
        setScriptContent(result.content)
        setPhase('script_review')
        updateMessage(msgId, {
          content: '剧本已修改，请查看：',
          status: 'done',
          scriptDraft: parseScriptDraft(result.content),
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('script_review')
        updateMessage(msgId, {
          content: `修改失败：${errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    },
    [scriptContent, addMessage, updateMessage, getApiConfig]
  )

  const modifyScript = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    setPhase('regenerating_script')
    const msgId = addMessage({ role: 'assistant', content: '正在修改剧本...', status: 'generating' })
    lastActionRef.current = { action: 'modify_script_free', data: { original_script: scriptContent, modification_request: modificationRequest } }

    try {
      const apiConfig = getApiConfig()
      const result = await chatApi({
        action: 'modify_script_free',
        api_config: apiConfig,
        original_script: scriptContent,
        modification_request: modificationRequest,
      })
      setScriptContent(result.content)
      setPhase('script_review')
      updateMessage(msgId, {
        content: '剧本已修改，请查看：',
        status: 'done',
        scriptDraft: parseScriptDraft(result.content),
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setPhase('script_review')
      updateMessage(msgId, {
        content: `修改失败：${errorMsg}`,
        status: 'error',
        retryable: true,
      })
    }
  }, [scriptContent, addMessage, updateMessage, getApiConfig])

  const generateKeyFrames = useCallback(async () => {
    console.log('🔥🔥🔥 GENERATE KEYFRAMES STARTED 🔥🔥🔥')
    console.log('[DEBUG] storyboardContent exists?', !!storyboardContent)
    console.log('[DEBUG] storyboardContent length:', storyboardContent?.length || 0)

    if (!storyboardContent) {
      console.log('[DEBUG] Early return: storyboardContent empty')
      return
    }

    setGeneratingKeyFrames(true)

    const { generateImage, chatApi } = await import('../services/api')
    const keys = loadApiKeys()
    const frames = parseStoryboardFrames(storyboardContent)

    console.log('[DEBUG] frames.length:', frames.length)

    if (frames.length === 0) {
      console.log('[DEBUG] No frames found')
      addMessage({
        role: 'assistant',
        content: '⚠️ 未能从分镜中提取镜头信息，请检查分镜格式。',
        status: 'done',
      })
      setGeneratingKeyFrames(false)
      return
    }

    const progressMsgId = addMessage({
      role: 'assistant',
      content: `正在为 ${frames.length} 个镜头生成起始帧图片...`,
      status: 'generating',
    })

    // Clear previous results
    setKeyFramesImages({})

    // System prompt for LLM
    const systemPrompt = `You are a professional cinematic storyboard prompt engineer.

CRITICAL: Output EXACTLY 3 separate prompts, each on its OWN LINE.

Prompt 1 (wide shot): cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, [environment + character position]
Prompt 2 (close-up): cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, [detail + emotion]
Prompt 3 (medium shot): cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, [relationship + atmosphere]

Use English ONLY. Character names in pinyin. NO Chinese. NO explanations.

Example:
cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, wide shot eye-level, Lin Xiao entering abandoned classroom through creaking door, dust particles floating in warm sunbeam, cracked wooden floor with geometric light patterns, warm golden afternoon side light, nostalgic melancholic atmosphere
cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, extreme close-up macro, Lin Xiao weathered fingers touching rusted iron box on windowsill, dust motes dancing in focused light beam, green patina on metal surface, soft diffused golden window light, intimate bittersweet feeling of rediscovered memory
cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, medium shot over-shoulder, Chen Mo softly watching from doorway, warm afternoon light creating lens flare and soft bokeh, vintage camera leather strap visible, gentle protective mood of unspoken understanding

Now generate 3 prompts for this shot:`

    // Iterate each frame until the last one
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      console.log(`\n=== Frame ${i + 1}/${frames.length}: ${frame.title} ===`)

      updateMessage(progressMsgId, {
        content: `正在处理镜头 ${i + 1}/${frames.length}：「${frame.title}」`,
      })

      // Get reference image (character priority)
      let refImageUrl: string | undefined
      if (frame.characterName) {
        const charKey = `char_${frame.characterName}`
        refImageUrl = selectedReferenceImages[charKey] || findBestMatch(charKey, keyElementsImages)
      }
      if (!refImageUrl && frame.sceneName) {
        const sceneKey = `scene_${frame.sceneName}`
        refImageUrl = selectedReferenceImages[sceneKey] || findBestMatch(sceneKey, keyElementsImages)
      }

      // Use title as fallback if content is empty
      if (!frame.content || frame.content.length < 10) {
        console.warn(`[KeyFrames] Frame ${i} content is short, using title as fallback`)
        frame.content = frame.title
      }

      // Build user prompt with extracted action
      const charPinyin = toPinyin(frame.characterName || 'character')
      const coreAction = extractAction(frame.content || frame.title)
      const userPrompt = `Generate 3 prompts for this shot.

【Core Action】${coreAction}
【Character】${charPinyin}
【Scene】${frame.sceneName || 'unspecified'}

Rules:
- MUST translate the Chinese action description into English
- NEVER copy Chinese text into the prompt
- Each prompt must describe a DIFFERENT aspect of the scene
- Prompt 1: wide shot showing environment and character position
- Prompt 2: close-up showing specific detail (hands, face, prop)
- Prompt 3: medium shot showing relationship or atmosphere
- All descriptions must be in English, character names in pinyin

Format:
cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, [shot], [English action description], [details], [lighting], [mood]
cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, [shot], [English action description], [details], [lighting], [mood]
cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field, [shot], [English action description], [details], [lighting], [mood]

Remember: ONLY output the 3 prompts. No other text.`

      // Call LLM with direct_llm action (messages mode)
      let rawResponse = ''
      try {
        const result = await chatApi({
          action: 'direct_llm',
          api_config: {
            key: keys.text || '',
            base_url: keys.base_url || '',
            model: keys.model || 'mimo-v2.5',
          },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })
        rawResponse = result.content || ''
        console.log(`[LLM] Response (${rawResponse.length} chars): ${rawResponse.slice(0, 300)}`)
      } catch (err) {
        console.error(`[LLM] Failed:`, err)
      }

      // Parse 3 prompts
      let keywords = parsePrompts(rawResponse)

      // If invalid response, use fallback
      if (keywords.length < 3 || isInvalidResponse(rawResponse)) {
        console.warn(`[Frame ${i + 1}] Invalid response, using fallback`)
        keywords = buildFallback(frame)
      }

      // Show complete prompts in chat (no truncation)
      addMessage({
        role: 'assistant',
        content: `镜头 ${i + 1}「${frame.title}」\n\n${keywords.map((k, idx) => `画面${idx + 1}：${k}`).join('\n\n')}`,
        status: 'done',
      })

      // Generate 3 images immediately
      const shotImages: string[] = []
      for (let idx = 0; idx < 3; idx++) {
        console.log(`[Image] Generating ${idx + 1}/3 for frame ${i + 1}, prompt length: ${keywords[idx]?.length}`)

        try {
          const data = await generateImage({
            prompt: keywords[idx],
            api_key: keys.image_api_key,
            model: keys.image_model || 'agnes-image-2.0-flash',
            base_url: keys.image_base_url || 'https://apihub.agnes-ai.com/v1',
            size: '1792x1024',
            ref_image_url: refImageUrl,
          })
          shotImages.push(data.image_url)
          // Real-time update left panel
          setKeyFramesImages(prev => ({
            ...prev,
            [i]: [...(prev[i] || []), data.image_url]
          }))
          console.log(`[Image] Frame ${i + 1} img ${idx + 1} success`)
        } catch (err) {
          console.error(`[Image] Frame ${i + 1} img ${idx + 1} failed:`, err)
          // If ref_image failed, retry without it
          if (refImageUrl) {
            try {
              const data = await generateImage({
                prompt: keywords[idx],
                api_key: keys.image_api_key,
                model: keys.image_model || 'agnes-image-2.0-flash',
                base_url: keys.image_base_url || 'https://apihub.agnes-ai.com/v1',
                size: '1792x1024',
              })
              shotImages.push(data.image_url)
              setKeyFramesImages(prev => ({
                ...prev,
                [i]: [...(prev[i] || []), data.image_url]
              }))
            } catch (err2) {
              console.error(`[Image] Retry without ref_image also failed:`, err2)
            }
          }
        }
      }

      console.log(`[Frame ${i + 1}] Complete: ${shotImages.length}/3 images`)
    }

    updateMessage(progressMsgId, {
      content: `✅ 已为 ${frames.length} 个镜头生成起始帧图片`,
      status: 'done',
    })
    
    addMessage({
      role: 'assistant',
      content: '\u2705 \u6240\u6709\u5173\u952e\u5e27\u5df2\u751f\u6210\uff01' + (frames.length * 3) + '\u5f20\u56fe\u7247\uff0c' + frames.length + '\u4e2a\u955c\u5934\u5c31\u7eea\u3002',
      status: 'done',
      actions: [
        { id: 'generate_voice', label: '\uD83C\uDFA4 \u751f\u6210', description: '\u89d2\u8272\u8bed\u97f3\u97f3\u8272' },
      ],
    })
    
    setGeneratingKeyFrames(false)
    await saveProject()
  }, [storyboardContent, selectedReferenceImages, keyElementsImages, addMessage, updateMessage, saveProject])

  const confirmImageGeneration = useCallback(async () => {
    setPhase('confirming_image')
    setCurrentSubPhase('none')
    addMessage({ role: 'user', content: '生成起始帧图片', status: 'done' })
    await generateKeyFrames()
  }, [generateKeyFrames, addMessage])

  const acceptOptimizedPrompts = useCallback((finalPrompts: string) => {
    setOptimizedPrompts(finalPrompts)
    setPhase('done')
    setEditOptimizedPrompts(false)
    addMessage({ role: 'user', content: '确认使用提示词', status: 'done' })
    addMessage({ role: 'assistant', content: '提示词已确认！后续将使用这些提示词生成图片。', status: 'done' })
    saveProject()
  }, [addMessage, saveProject])

  const startEditOptimizedPrompts = useCallback(() => {
    setEditOptimizedPrompts(true)
  }, [])

  const saveEditOptimizedPrompts = useCallback((newContent: string) => {
    setOptimizedPrompts(newContent)
    setEditOptimizedPrompts(false)
  }, [])

  const filterSceneDescription = useCallback((raw: string): string => {
    const personPatterns = [
      /^[\-\*]\s*\*{0,2}人物\*{0,2}[：:]/im,
      /^[\-\*]\s*\*{0,2}角色\*{0,2}[：:]/im,
      /人物[：:]/,
      /角色[：:]/,
      /人物动作/,
      /人物表情/,
      /动作习惯/,
      /表情描写/,
      /动作描写/,
      /对白/,
      /台词/,
      /主角/,
      /配角/,
      /\b他\b/,
      /\b她\b/,
      /\b他们\b/,
      /\b她们\b/,
      /角色动作/,
      /角色表情/,
      /人物形象/,
      /角色形象/,
    ]

    return raw
      .split('\n')
      .filter(line => !personPatterns.some(p => p.test(line)))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }, [])

  /** 解析 keyElementsContent 为角色和场景的完整描述（不截断） */
  const parseKeyElementsContent = useCallback((content: string) => {
    const characters: Array<{ name: string; role: string; fullText: string; cleanText: string }> = []
    const scenes: Array<{ name: string; type: string; fullText: string; cleanText: string }> = []

    if (!content) return { characters, scenes }

    const sections = content.split(/(?=^## )/m)
    for (const section of sections) {
      const headingMatch = section.match(/^## (.+)$/m)
      if (!headingMatch) continue
      const heading = headingMatch[1]

      if (heading.includes('角色形象')) {
        const subSections = section.split(/(?=^### )/m)
        for (const sub of subSections) {
          const subMatch = sub.match(/^### (主角|配角)[：:](.+)$/m)
          if (!subMatch) continue
          const role = subMatch[1]
          const name = subMatch[2].trim()
          const fullText = sub.split('\n').slice(1).filter(l => l.trim()).join('\n').trim()
          const cleanText = fullText
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/^[\-\*]\s+/gm, '')
            .replace(/\n+/g, '，')
            .trim()
          characters.push({ name, role, fullText, cleanText })
        }
      } else if (heading.includes('场景')) {
        const subSections = section.split(/(?=^### )/m)
        for (const sub of subSections) {
          const subMatch = sub.match(/^### (主要场景|次要场景)[一二三四五六七八九十\d]*[：:]\s*(.+)$/m)
          if (!subMatch) continue
          const type = subMatch[1]
          const name = subMatch[2].trim()
          const fullText = sub.split('\n').slice(1).filter(l => l.trim()).join('\n').trim()
          const cleanText = filterSceneDescription(fullText)
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/^[\-\*]\s+/gm, '')
            .replace(/\n+/g, '，')
            .trim()
          scenes.push({ name, type, fullText, cleanText })
        }
      }
    }

    return { characters, scenes }
  }, [filterSceneDescription])

  const getRequiredReferenceKeys = useCallback(() => {
    const { characters, scenes } = parseKeyElementsContent(keyElementsContent)
    const keys: string[] = []
    for (const c of characters) {
      if (c.role === '主角') keys.push(`char_${c.name}`)
    }
    for (const s of scenes) {
      if (s.type === '主要场景') keys.push(`scene_${s.name}`)
    }
    return keys
  }, [keyElementsContent, parseKeyElementsContent])

  const getMissingReferences = useCallback(() => {
    const required = getRequiredReferenceKeys()
    return required.filter(key => !selectedReferenceImages[key])
  }, [getRequiredReferenceKeys, selectedReferenceImages])

  const skipReferenceSelection = useCallback(() => {
    const missing = getMissingReferences()
    const updates: Record<string, string> = {}
    for (const key of missing) {
      const imgs = keyElementsImages[key]
      if (imgs && imgs.length > 0) {
        updates[key] = imgs[0]
      }
    }
    if (Object.keys(updates).length > 0) {
      setSelectedReferenceImages(prev => ({ ...prev, ...updates }))
    }
    setAwaitingReferenceSelection(false)
  }, [getMissingReferences, keyElementsImages])

  const confirmStoryboard = useCallback(() => {
    addMessage({ role: 'user', content: '确认', status: 'done' })
    setCurrentSubPhase('image_confirm')
    addMessage({
      role: 'assistant',
      content: '所有文本已准备就绪！\n\n请先选择画风（点击底部 Skill 按钮），然后点击下方按钮开始生成角色/场景图片：',
      status: 'done',
      options: [
        { id: '__confirm__', label: '🎨 开始生成角色/场景图片', description: '生成关键视觉元素的概念图' },
      ],
    })
    saveProject()
  }, [addMessage, saveProject])

  const generateKeyElementsImages = useCallback(async () => {
    if (!keyElementsContent) return

    setGeneratingKeyElementsImages(true)
    setKeyElementsImageProgress('正在解析关键元素...')

    const keys = loadApiKeys()
    const apiKey = keys.image_api_key
    const model = keys.image_model || 'agnes-image-2.0-flash'
    const baseUrl = keys.image_base_url || 'https://apihub.agnes-ai.com/v1'

    if (!apiKey) {
      alert('请先在设置中配置图像 API Key')
      setGeneratingKeyElementsImages(false)
      return
    }

    const style = getSelectedStyle()
    if (!style) {
      addMessage({
        role: 'assistant',
        content: '请先在下方 Skill 列表中选择一种画风，然后重新点击生成按钮。',
        status: 'done',
      })
      setGeneratingKeyElementsImages(false)
      return
    }
    const stylePrefix = getStylePromptPrefix()

    const { generateImage } = await import('../services/api')

    const { characters, scenes } = parseKeyElementsContent(keyElementsContent)

    const totalItems = characters.length + scenes.length
    if (totalItems === 0) {
      alert('未找到可生成图片的角色或场景')
      setGeneratingKeyElementsImages(false)
      return
    }

    const progressMsgId = addMessage({
      role: 'assistant', content: `正在生成视觉元素图片 0/${totalItems}...`, status: 'generating'
    })

    let completed = 0

    for (const char of characters) {
      const charKey = `char_${char.name}`
      setKeyElementsProgress(prev => ({ ...prev, [charKey]: 0 }))
      setKeyElementsImageProgress(`正在生成角色图 ${completed + 1}/${totalItems}: ${char.name}`)
      updateMessage(progressMsgId, { content: `正在生成角色图 ${completed + 1}/${totalItems}: ${char.name}` })
      try {
        const prompt = `${stylePrefix}角色正面全身照：${char.name}，${char.cleanText}。画面要求：纯白色背景，电影感柔和光影，超写实质感。人物正面站立，双手自然下垂，面部正对镜头，全身完整入镜，无透视畸变。8K，超高质量。`
        const existingImage = keyElementsImages[charKey]?.[0]
        const data = await generateImage({ prompt, api_key: apiKey, model, base_url: baseUrl, ref_image_url: existingImage })
        setKeyElementsImages(prev => ({
          ...prev,
          [charKey]: [...(prev[charKey] || []), data.image_url]
        }))
        setKeyElementsProgress(prev => ({ ...prev, [charKey]: 100 }))
      } catch (err) {
        console.error(`Failed to generate image for ${char.name}:`, err)
        setKeyElementsProgress(prev => ({ ...prev, [charKey]: -1 }))
      }
      completed++
      if (completed === totalItems) {
        setGeneratingKeyElementsImages(false)
        setKeyElementsImageProgress('')
        setKeyElementsProgress({})
        const missing = getMissingReferences()
        if (missing.length > 0) {
          setAwaitingReferenceSelection(true)
          const missingList = missing.map(k => {
            const prefix = k.startsWith('char_') ? '角色' : '场景'
            const name = k.replace(/^char_|^scene_/, '')
            return `• ${prefix}：${name}`
          }).join('\n')
          updateMessage(progressMsgId, {
            content: `✅ 已生成 ${totalItems} 张图片。\n\n以下角色/场景尚未选择主参考图：\n${missingList}\n\n请点击左侧卡片中的图片，双击选择"作为主图"。满意后点击下方按钮：`,
            status: 'done',
            options: [
              { id: '__satisfied__', label: '✅ 满意，继续下一步', description: '检查主图后生成分镜图片' },
              { id: '__regenerate__', label: '🔄 重新生成全部', description: '追加生成更多图片' },
            ],
          })
        } else {
          updateMessage(progressMsgId, {
            content: `✅ 已生成 ${totalItems} 张图片。所有主参考图已选择！`,
            status: 'done',
            options: [
              { id: '__confirm__', label: '✅ 生成分镜图片', description: '进入分镜图片生成' },
              { id: '__regenerate__', label: '🔄 重新生成全部', description: '追加生成更多图片' },
            ],
          })
        }
      }
    }

    for (const scene of scenes) {
      const sceneKey = `scene_${scene.name}`
      setKeyElementsProgress(prev => ({ ...prev, [sceneKey]: 0 }))
      setKeyElementsImageProgress(`正在生成场景图 ${completed + 1}/${totalItems}: ${scene.name}`)
      updateMessage(progressMsgId, { content: `正在生成场景图 ${completed + 1}/${totalItems}: ${scene.name}` })
      try {
        const prompt = `${stylePrefix}环境场景图，不要包含任何人物：${scene.name}，${scene.cleanText}，detailed environment, atmospheric lighting, high quality, no people, no characters, empty scene, environment only`
        const data = await generateImage({ prompt, api_key: apiKey, model, base_url: baseUrl })
        setKeyElementsImages(prev => ({
          ...prev,
          [sceneKey]: [...(prev[sceneKey] || []), data.image_url]
        }))
        setKeyElementsProgress(prev => ({ ...prev, [sceneKey]: 100 }))
      } catch (err) {
        console.error(`Failed to generate image for ${scene.name}:`, err)
        setKeyElementsProgress(prev => ({ ...prev, [sceneKey]: -1 }))
      }
      completed++
      if (completed === totalItems) {
        setGeneratingKeyElementsImages(false)
        setKeyElementsImageProgress('')
        setKeyElementsProgress({})
        const missing = getMissingReferences()
        if (missing.length > 0) {
          setAwaitingReferenceSelection(true)
          const missingList = missing.map(k => {
            const prefix = k.startsWith('char_') ? '角色' : '场景'
            const name = k.replace(/^char_|^scene_/, '')
            return `• ${prefix}：${name}`
          }).join('\n')
          updateMessage(progressMsgId, {
            content: `✅ 已生成 ${totalItems} 张图片。\n\n以下角色/场景尚未选择主参考图：\n${missingList}\n\n请点击左侧卡片中的图片，双击选择"作为主图"。满意后点击下方按钮：`,
            status: 'done',
            options: [
              { id: '__satisfied__', label: '✅ 满意，继续下一步', description: '检查主图后生成分镜图片' },
              { id: '__regenerate__', label: '🔄 重新生成全部', description: '追加生成更多图片' },
            ],
          })
        } else {
          updateMessage(progressMsgId, {
            content: `✅ 已生成 ${totalItems} 张图片。所有主参考图已选择！`,
            status: 'done',
            options: [
              { id: '__confirm__', label: '✅ 生成分镜图片', description: '进入分镜图片生成' },
              { id: '__regenerate__', label: '🔄 重新生成全部', description: '追加生成更多图片' },
            ],
          })
        }
      }
    }
  }, [keyElementsContent, addMessage, updateMessage, parseKeyElementsContent, getMissingReferences])

  const regenerateAllKeyElements = useCallback(async () => {
    addMessage({ role: 'user', content: '重新生成更多图片', status: 'done' })
    await generateKeyElementsImages()
  }, [generateKeyElementsImages, addMessage])

  const confirmSatisfied = useCallback(() => {
    addMessage({ role: 'user', content: '满意，继续下一步', status: 'done' })
    const missing = getMissingReferences()
    if (missing.length > 0) {
      setAwaitingReferenceSelection(true)
      const missingList = missing.map(k => {
        const prefix = k.startsWith('char_') ? '角色' : '场景'
        const name = k.replace(/^char_|^scene_/, '')
        return `• ${prefix}：${name}`
      }).join('\n')
      addMessage({
        role: 'assistant',
        content: `以下角色/场景尚未选择主参考图：\n\n${missingList}\n\n请点击左侧卡片中的图片，双击选择"作为主图"。`,
        status: 'done',
        options: [
          { id: '__confirm__', label: '✅ 所有主图已选好，生成分镜图片', description: '开始生成分镜图片' },
          { id: '__skip__', label: '⏭️ 使用默认图片，继续生成', description: '跳过选择，使用第一张图片作为参考' },
        ],
      })
    } else {
      setAwaitingReferenceSelection(false)
      addMessage({
        role: 'assistant',
        content: '所有主参考图已选择！点击下方按钮生成起始帧图片：',
        status: 'done',
        options: [
          { id: '__confirm__', label: '🎬 生成起始帧图片', description: '为前3个镜头生成电影级起始帧' },
        ],
      })
    }
    saveProject()
  }, [addMessage, saveProject, getMissingReferences])

  const selectVoice = useCallback(
    (optionId: string) => {
      const option = VOICE_OPTIONS.find((o) => o.id === optionId)
      addMessage({ role: 'user', content: option?.label || optionId, status: 'done' })
      if (optionId === 'skip') {
        addMessage({ role: 'assistant', content: '已跳过语音，分镜已就绪。你可以在左侧面板查看分镜详情。', status: 'done' })
      } else {
        addMessage({ role: 'assistant', content: '\u5df2\u9009\u62e9\u300c' + (option?.label || '') + '\u300d\uff0c\u8bed\u97f3\u751f\u6210\u529f\u80fd\u5373\u5c06\u4e0a\u7ebf\u3002\u5206\u955c\u5df2\u5c31\u7eea\u3002', status: 'done' })
      }
      setPhase('done')
    },
    [addMessage]
  )

  // Voice generation constants
  const CHARACTER_COLORS = ['#00aaff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#f06595']
  const VOICE_POOLS = {
    male: ['白桦', '苏打'],
    female: ['冰糖', '茉莉'],
  }
  
  const getCharacterGender = useCallback((characterName: string): 'male' | 'female' => {
    if (!keyElementsContent) return 'female'
    
    const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `### (主角|配角)[：:]\\s*${escapedName}[\\s\\S]*?(?=### |$)`,
      'i'
    )
    const match = keyElementsContent.match(regex)
    if (!match) return 'female'
    
    const section = match[0]
    
    const maleKeywords = /男|男生|男性|男孩|少年|男子|青年|男士|帅哥|大叔|爷爷|父亲|爸爸|哥哥|弟弟|先生|男主/
    const femaleKeywords = /女|女生|女性|女孩|少女|女子|姑娘|女士|美女|阿姨|奶奶|母亲|妈妈|姐姐|妹妹|小姐|女主/
    
    if (maleKeywords.test(section)) return 'male'
    if (femaleKeywords.test(section)) return 'female'
    
    const roleMatch = section.match(/### (主角|配角)/)
    return roleMatch && roleMatch[1] === '主角' ? 'male' : 'female'
  }, [keyElementsContent])
  
  const getVoiceForCharacter = useCallback((characterName: string, isRegenerate = false): string => {
    const gender = getCharacterGender(characterName)
    const pool = VOICE_POOLS[gender]
    const used = voiceTracks[characterName]?.map(t => t.voice) || []
    
    if (isRegenerate) {
      const unused = pool.filter(v => !used.includes(v))
      if (unused.length > 0) {
        return unused[Math.floor(Math.random() * unused.length)]
      }
      return pool[Math.floor(Math.random() * pool.length)]
    }
    
    return pool.find(v => !used.includes(v)) || pool[0]
  }, [getCharacterGender, voiceTracks])
  
  const extractFirstDialogue = useCallback((characterName: string): string => {
    if (!dialogueContent) return characterName + '\uff0c\u4f60\u597d\u3002'
    
    const lines = dialogueContent.split('\n')
    for (const line of lines) {
      const match = line.match(/^[（(]?([^）)]+)[）)]?\s*[：:]\s*(.+)/)
      if (match) {
        const speaker = match[1].trim()
        if (speaker.includes(characterName) || characterName.includes(speaker)) {
          return match[2].trim()
        }
      }
    }
    return characterName + '\uff0c\u4f60\u597d\u3002'
  }, [dialogueContent])

  const generateVoiceForCharacter = useCallback(async (characterName: string, isRegenerate = false) => {
    const keys = loadApiKeys()
    const voiceModel = keys.voice_model || 'mimo-v2.5-tts'
    const useSame = keys.voice_use_same !== 'false'
    
    const apiKey = useSame ? keys.text : (keys.voice_api_key || keys.text)
    const baseUrl = useSame ? keys.base_url : (keys.voice_base_url || keys.base_url)
    
    if (!apiKey) {
      addMessage({ role: 'assistant', content: '请先配置 API Key。', status: 'error' })
      return
    }
    
    const text = extractFirstDialogue(characterName)
    setGeneratingVoice(true)
    
    const progressMsgId = addMessage({
      role: 'assistant',
      content: '\u6b63\u5728\u4e3a ' + characterName + ' \u751f\u6210\u97f3\u8272...',
      status: 'generating',
    })
    
    try {
      const voice = getVoiceForCharacter(characterName, isRegenerate)
      const result = await generateVoice({
        text,
        model: voiceModel,
        voice,
        api_key: apiKey,
        base_url: baseUrl,
      })
      
      let newVersion = 1
      setVoiceTracks(prev => {
        const existingTracks = prev[characterName] || []
        newVersion = existingTracks.length + 1
        const colorIndex = Object.keys(prev).length % CHARACTER_COLORS.length
        
        const newTrack = {
          id: 'voice_' + characterName + '_' + Date.now(),
          version: newVersion,
          character: characterName,
          voice,
          audioUrl: result.audio_url,
          waveform: result.waveform,
          color: CHARACTER_COLORS[colorIndex],
          isSelected: true,
        }
        
        return {
          ...prev,
          [characterName]: [
            ...existingTracks.map(t => ({ ...t, isSelected: false })),
            newTrack,
          ],
        }
      })
      
      updateMessage(progressMsgId, {
        content: '\u2705 ' + characterName + ' \u7684\u97f3\u8272\u5df2\u751f\u6210\uff01',
        status: 'done',
      })
      
      addMessage({
        role: 'assistant',
        content: '\u97f3\u8272 v' + newVersion + ' \u5df2\u5c31\u7eea\uff0c\u53ef\u4ee5\u8bd5\u542c\u3002',
        status: 'done',
        actions: [
          { id: 'regenerate_' + characterName, label: '\uD83D\uDD04', description: '\u91cd\u65b0\u751f\u6210' },
          { id: 'confirm_voice', label: '\u2705', description: '\u6ee1\u610f\u7ee7\u7eed' },
        ],
      })
      
      await saveProject()
    } catch (err) {
      console.error('[Voice] Generation failed:', err)
      updateMessage(progressMsgId, {
        content: '\u274C ' + characterName + ' \u97f3\u8272\u751f\u6210\u5931\u8d25\uff1a' + (err instanceof Error ? err.message : '\u672a\u77e5\u9519\u8bef'),
        status: 'error',
      })
    } finally {
      setGeneratingVoice(false)
    }
  }, [extractFirstDialogue, addMessage, updateMessage, saveProject, getVoiceForCharacter])

  const generateAllVoiceTracks = useCallback(async () => {
    if (!keyElementsContent) {
      addMessage({ role: 'assistant', content: '没有关键元素内容，无法提取角色。', status: 'error' })
      return
    }
    
    const sections = keyElementsContent.split(/(?=^## )/m)
    const characterNames: string[] = []
    
    for (const section of sections) {
      const headingMatch = section.match(/^## (.+)$/m)
      if (!headingMatch || !headingMatch[1].includes('角色形象')) continue
      
      const subSections = section.split(/(?=^### )/m)
      for (const sub of subSections) {
        const subMatch = sub.match(/^### (主角|配角)[：:](.+)$/m)
        if (subMatch) {
          characterNames.push(subMatch[2].trim())
        }
      }
    }
    
    if (characterNames.length === 0) {
      addMessage({ role: 'assistant', content: '未找到角色信息。', status: 'error' })
      return
    }
    
    addMessage({ role: 'user', content: '\u751f\u6210\u89d2\u8272\u8bed\u97f3\u97f3\u8272', status: 'done' })
    addMessage({
      role: 'assistant',
      content: '\u627e\u5230 ' + characterNames.length + ' \u4e2a\u89d2\u8272\uff1a' + characterNames.join('\u3001') + '\u3002\u5f00\u59cb\u751f\u6210\u97f3\u8272...',
      status: 'done',
    })
    
    for (const name of characterNames) {
      await generateVoiceForCharacter(name)
    }
  }, [keyElementsContent, addMessage, generateVoiceForCharacter])

  const generateAllVideos = useCallback(async () => {
    const frames = parseStoryboardFrames(storyboardContent)
    if (frames.length === 0) {
      addMessage({ role: 'assistant', content: '没有镜头数据，无法生成视频。', status: 'error' })
      return
    }

    setGeneratingVideo(true)
    setPhase('generating_video')

    const keys = loadApiKeys()
    const videoApiKey = keys.video_api_key || keys.image_api_key || keys.text
    const videoModel = keys.video_model || 'agnes-video-v2.0'
    const videoBaseUrl = keys.video_base_url || keys.image_base_url || 'https://apihub.agnes-ai.com/v1'

    // 计算总图片数
    let totalImages = 0
    for (let i = 0; i < frames.length; i++) {
      const frameImages = keyFramesImages[i]
      if (frameImages) totalImages += frameImages.length
    }

    const progressMsgId = addMessage({
      role: 'assistant',
      content: `正在为 ${frames.length} 个镜头的 ${totalImages} 张图片生成视频...`,
      status: 'generating',
    })

    let completedCount = 0

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const frameImages = keyFramesImages[i]
      
      if (!frameImages || frameImages.length === 0) {
        console.warn(`[Video] Frame ${i + 1} has no images, skipping`)
        continue
      }

      // 遍历每张图片生成视频
      for (let imgIdx = 0; imgIdx < frameImages.length; imgIdx++) {
        const imageUrl = frameImages[imgIdx]
        const key = `${i}_${imgIdx}`

        updateMessage(progressMsgId, {
          content: `正在为镜头 ${i + 1}/${frames.length} 图片 ${imgIdx + 1}/${frameImages.length} 生成视频... (${completedCount + 1}/${totalImages})`,
        })

        try {
          const charPinyin = toPinyin(frame.characterName || 'character')
          const coreAction = extractAction(frame.content || frame.title)
          const videoPrompt = `cinematic film still with subtle breathing motion, ${charPinyin} ${coreAction}, ${frame.sceneName || 'scene'} environment, dramatic lighting, moody atmosphere, shallow depth of field, smooth animation`

          const result = await generateVideo({
            image_url: imageUrl,
            prompt: videoPrompt,
            api_key: videoApiKey,
            model: videoModel,
            base_url: videoBaseUrl,
          })

          setKeyFrameVideos(prev => ({ ...prev, [key]: result.video_url }))
          console.log(`[Video] Frame ${i + 1} img ${imgIdx + 1} success`)
        } catch (err) {
          console.error(`[Video] Frame ${i + 1} img ${imgIdx + 1} failed:`, err)
        }

        completedCount++
      }
    }

    updateMessage(progressMsgId, {
      content: `✅ 视频生成完成！共 ${totalImages} 个视频`,
      status: 'done',
    })

    addMessage({
      role: 'assistant',
      content: `🎬 所有 ${totalImages} 个视频已生成！`,
      status: 'done',
    })

    setGeneratingVideo(false)
    setPhase('video_done')
    await saveProject()
  }, [storyboardContent, keyFramesImages, addMessage, updateMessage, saveProject])

  const executeAction = useCallback((actionId: string) => {
    console.log('[executeAction] actionId:', actionId)
    if (actionId === 'generate_voice') {
      generateAllVoiceTracks()
    } else if (actionId.startsWith('regenerate_')) {
      const character = actionId.replace('regenerate_', '')
      generateVoiceForCharacter(character, true)
    } else if (actionId === 'confirm_voice') {
      console.log('[executeAction] confirm_voice triggered')
      setPhase('video_ready')
      addMessage({
        role: 'assistant',
        content: '音色已确认！现在可以开始生成视频了。点击下方按钮开始：',
        status: 'done',
        actions: [
          { id: 'generate_video', label: '🎬 开始生成视频', description: '为每个镜头生成动态视频' },
        ],
      })
      saveProject()
    } else if (actionId === 'generate_video') {
      console.log('[executeAction] generate_video triggered')
      generateAllVideos()
    }
  }, [generateAllVoiceTracks, generateVoiceForCharacter, addMessage, setPhase, saveProject, generateAllVideos])

  const selectVoiceTrack = useCallback((trackId: string) => {
    setVoiceTracks(prev => {
      const updated = { ...prev }
      for (const charName of Object.keys(updated)) {
        updated[charName] = updated[charName].map(t => ({
          ...t,
          isSelected: t.id === trackId,
        }))
      }
      return updated
    })
  }, [])

  const deleteVoiceTrack = useCallback((trackId: string) => {
    setVoiceTracks(prev => {
      const updated = { ...prev }
      for (const charName of Object.keys(updated)) {
        const filtered = updated[charName].filter(t => t.id !== trackId)
        if (filtered.length !== updated[charName].length) {
          if (filtered.length > 0 && !filtered.some(t => t.isSelected)) {
            filtered[filtered.length - 1].isSelected = true
          }
          updated[charName] = filtered
        }
      }
      return updated
    })
    saveProject()
  }, [saveProject])

  const playVoiceTrack = useCallback((trackId: string) => {
    let track: { audioUrl: string; character: string } | null = null
    for (const charName of Object.keys(voiceTracks)) {
      const found = voiceTracks[charName].find(t => t.id === trackId)
      if (found) {
        track = found
        break
      }
    }
    
    if (!track) return
    
    if (currentPlayingTrackId === trackId && isAudioPlaying()) {
      stopAudio()
      setCurrentPlayingTrackId(null)
      setAudioProgress(0)
    } else {
      setCurrentPlayingTrackId(trackId)
      playAudio(
        track.audioUrl,
        () => {
          setCurrentPlayingTrackId(null)
          setAudioProgress(0)
        },
        (progress) => {
          setAudioProgress(progress)
        }
      )
    }
  }, [voiceTracks, currentPlayingTrackId])

  const retry = useCallback(async () => {
    const lastAction = lastActionRef.current
    if (!lastAction) return

    if (lastAction.action === 'generate_script') {
      const data = lastAction.data as { session?: Record<string, string | null>; choices?: Record<string, string> }
      await generateScript(data.session || data.choices || {})
    } else if (lastAction.action === 'modify_script') {
      await selectModSubOption(
        (lastAction.data as { category: string }).category,
        (lastAction.data as { sub_option: string }).sub_option
      )
    } else if (lastAction.action === 'modify_script_free') {
      const data = lastAction.data as { original_script: string; modification_request: string }
      setScriptContent(data.original_script)
      await modifyScript(data.modification_request)
    } else if (lastAction.action === 'generate_storyboard') {
      await _generateStoryboardDirect()
    } else if (lastAction.action === 'generate_key_elements') {
      await confirmScript()
    } else if (lastAction.action === 'generate_narration') {
      await confirmKeyElements()
    } else if (lastAction.action === 'generate_dialogue') {
      await confirmNarration()
    } else if (lastAction.action === 'modify_key_elements') {
      const data = lastAction.data as { original_content: string; modification_request: string }
      setKeyElementsContent(data.original_content)
      await modifyKeyElements(data.modification_request)
    } else if (lastAction.action === 'modify_narration') {
      const data = lastAction.data as { original_content: string; modification_request: string }
      setNarrationContent(data.original_content)
      await modifyNarration(data.modification_request)
    } else if (lastAction.action === 'modify_dialogue') {
      const data = lastAction.data as { original_content: string; modification_request: string }
      setDialogueContent(data.original_content)
      await modifyDialogue(data.modification_request)
    } else if (lastAction.action === 'modify_storyboard') {
      const data = lastAction.data as { original_content: string; modification_request: string }
      setStoryboardContent(data.original_content)
      await modifyStoryboard(data.modification_request)
    }
  }, [
    generateScript, selectModSubOption, modifyScript, confirmScript, confirmKeyElements, confirmNarration,
    _generateStoryboardDirect, modifyKeyElements, modifyNarration, modifyDialogue, modifyStoryboard,
  ])

  return {
    phase,
    messages,
    setMessages,
    choices,
    questions,
    currentQuestionIndex,
    session,
    scriptContent,
    storyboardContent,
    keyElementsContent,
    narrationContent,
    dialogueContent,
    optimizedPrompts,
    editOptimizedPrompts,
    currentSubPhase,
    hasApiConfig,
    startWizard,
    selectOption,
    aiRecommend,
    confirmScript,
    confirmKeyElements,
    confirmNarration,
    confirmDialogue,
    confirmStoryboard,
    modifyKeyElements,
    modifyNarration,
    modifyDialogue,
    modifyStoryboard,
    modifyScript,
    requestModification,
    selectModCategory,
    selectModSubOption,
    confirmImageGeneration,
    acceptOptimizedPrompts,
    startEditOptimizedPrompts,
    saveEditOptimizedPrompts,
    selectVoice,
    executeAction,
    voiceTracks,
    generatingVoice,
    currentPlayingTrackId,
    audioProgress,
    generateVoiceForCharacter,
    generateAllVoiceTracks,
    selectVoiceTrack,
    deleteVoiceTrack,
    playVoiceTrack,
    retry,
    keyElementsImages,
    setKeyElementsImages,
    generatingKeyElementsImages,
    keyElementsImageProgress,
    keyElementsProgress,
    generateKeyElementsImages,
    regenerateAllKeyElements,
    confirmSatisfied,
    keyFramesImages,
    setKeyFramesImages,
    generatingKeyFrames,
    generateKeyFrames,
    filterSceneDescription,
    parseKeyElementsContent,
    selectedReferenceImages,
    setSelectedReferenceImage,
    awaitingReferenceSelection,
    setAwaitingReferenceSelection,
    awaitingScriptDecision,
    initWorkspaceWithScriptPrompt,
    confirmHasScript,
    getMissingReferences,
    skipReferenceSelection,
    projectId,
    isSaving,
    lastSaveTime,
    projectUpdatedAt,
    isConflict,
    saveProject,
    loadProject,
    resolveConflict,
    createNewProject,
    addMessage,
    generateAllVideos,
    keyFrameVideos,
    generatingVideo,
  }
}

function parseScriptDraft(content: string): ScriptDraftData {
  const defaultDraft: ScriptDraftData = {
    title: '未命名剧本',
    type: '剧情短片',
    duration: '1-2分钟',
    tone: '中性',
    characters: [],
    scenes: [],
    synopsis: '',
  }

  try {
    const titleMatch = content.match(/📜\s*\*?\*?([^*\n]+)/)
    if (titleMatch) defaultDraft.title = titleMatch[1].trim()

    const typeMatch = content.match(/类型[：:]\s*(.+)/)
    if (typeMatch) defaultDraft.type = typeMatch[1].trim()

    const durationMatch = content.match(/时长[：:]\s*(.+)/)
    if (durationMatch) defaultDraft.duration = durationMatch[1].trim()

    const toneMatch = content.match(/基调[：:]\s*(.+)/)
    if (toneMatch) defaultDraft.tone = toneMatch[1].trim()

    const synopsisMatch = content.match(/故事梗概[：:]\s*([\s\S]*?)(?=\n---|\n人物|$)/)
    if (synopsisMatch) defaultDraft.synopsis = synopsisMatch[1].trim().slice(0, 200)

    const characterRegex = /👤\s*\*?\*?([^*—]+)\*?\*?\s*[—–-]\s*(.+)/g
    let charMatch
    while ((charMatch = characterRegex.exec(content)) !== null) {
      defaultDraft.characters.push({
        name: charMatch[1].trim(),
        identity: charMatch[2].trim(),
        personality: '',
      })
    }

    const sceneRegex = /\*\*第[一二三四五六七八九十\d]+幕[：:]\s*(.+?)\*\*\s*\n([\s\S]*?)(?=\*\*第[一二三四五六七八九十\d]+幕|\*\*关键转折|\*\*结局|$)/g
    let sceneMatch
    let actNum = 1
    while ((sceneMatch = sceneRegex.exec(content)) !== null) {
      const title = sceneMatch[1].trim()
      const body = sceneMatch[2].trim()
      const sceneMatch2 = body.match(/场景[：:]\s*([\s\S]*?)(?=人物[：:]|事件[：:]|冲突[：:]|预计时长|$)/)
      const characterMatch = body.match(/人物[：:]\s*([\s\S]*?)(?=事件[：:]|冲突[：:]|预计时长|$)/)
      const eventMatch = body.match(/事件[：:]\s*([\s\S]*?)(?=冲突[：:]|预计时长|$)/)
      const conflictMatch = body.match(/冲突[：:]\s*([\s\S]*?)(?=预计时长|$)/)
      const durationMatch2 = body.match(/预计时长[：:]\s*(.+)/)
      const sceneContent = [
        sceneMatch2 ? '\u573a\u666f\uff1a' + sceneMatch2[1].trim() : '',
        characterMatch ? '\u4eba\u7269\uff1a' + characterMatch[1].trim() : '',
        eventMatch ? '\u4e8b\u4ef6\uff1a' + eventMatch[1].trim() : '',
        conflictMatch ? '\u51b2\u7a81\uff1a' + conflictMatch[1].trim() : '',
      ].filter(Boolean).join('\n')
      defaultDraft.scenes.push({
        act: actNum++,
        title: title,
        content: sceneContent || body,
        duration_estimate: durationMatch2 ? durationMatch2[1].trim() : '',
      })
    }

    if (defaultDraft.scenes.length === 0) {
      const simpleRegex = /第[一二三四五六七八九十\d]+幕[：:]\s*(.+?)(?:\n|$)/g
      let simpleMatch
      let simpleNum = 1
      while ((simpleMatch = simpleRegex.exec(content)) !== null) {
        const title = simpleMatch[1].trim()
        const nextLineIndex = content.indexOf(simpleMatch[0]) + simpleMatch[0].length
        const remaining = content.slice(nextLineIndex)
        const bodyMatch = remaining.match(/([\s\S]*?)(?=第[一二三四五六七八九十\d]+幕[：:]|关键转折|结局|$)/)
        const body = bodyMatch ? bodyMatch[1].trim() : ''
        defaultDraft.scenes.push({
          act: simpleNum++,
          title: title,
          content: body || '',
        })
      }
    }

    if (defaultDraft.scenes.length === 0) {
      const shotRegex = /^\*\*镜([一二三四五六七八九十\d]+)\s*[·\-]?\s*([^（]*)\s*（([^）]*)）\*\*/gm
      let shotMatch
      let shotNum = 1
      while ((shotMatch = shotRegex.exec(content)) !== null) {
        defaultDraft.scenes.push({
          act: shotNum++,
          title: shotMatch[2].trim() || '\u955c\u5934' + (shotNum - 1),
          content: '',
          duration_estimate: shotMatch[3].trim(),
        })
      }
    }
  } catch {
    // parsing failed, return default
  }

  return defaultDraft
}
