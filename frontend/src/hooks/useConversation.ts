import { useState, useCallback, useRef } from 'react'
import { WIZARD_STEP_IDS, DURATION_MAP, VOICE_OPTIONS, getSelectedStyle, getStylePromptPrefix } from '../config/wizardSteps'
import { chatApi, createProject, saveProjectState, getProjectDetail, generateVoice, generateVideo } from '../services/api'
import { loadApiKeys } from '../utils/apiKeys'
import { playAudio, stopAudio, isAudioPlaying } from '../utils/audioPlayer'
import { DEFAULTS } from '../config/defaults'
import type { WizardOption, Question } from '../config/wizardSteps'

function getImageUrl(value: string | string[] | undefined): string | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] || null) : value
}

// Simplify name by removing parenthetical content
function simplifyName(name: string): string {
  return name.replace(/[锛?].*?[锛?]/g, '').trim()
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
  const regex = new RegExp(`[-*]\\s*\\*?\\*?${fieldName}\\*?\\*?[锛?]\\s*([\\s\\S]*?)(?=\\n[-*]\\s*\\*?\\*?|$)`)
  const match = block.match(regex)
  return match ? match[1].trim() : ''
}

// Extract shot type from content keywords
function extractShotTypeFromContent(content: string): string {
  if (content.includes('澶ц繙鏅?)) return '澶ц繙鏅?
  if (content.includes('杩滄櫙')) return '杩滄櫙'
  if (content.includes('鍏ㄦ櫙')) return '鍏ㄦ櫙'
  if (content.includes('涓櫙')) return '涓櫙'
  if (content.includes('杩戞櫙')) return '杩戞櫙'
  if (content.includes('澶х壒鍐?)) return '澶х壒鍐?
  if (content.includes('鐗瑰啓')) return '鐗瑰啓'
  return '涓櫙'  // default
}

// Clean content by removing shot type keywords
function cleanContent(fullContent: string): string {
  let cleaned = fullContent

  // Remove leading shot type keywords
  const shotTypeKeywords = ['澶ц繙鏅?, '杩滄櫙', '鍏ㄦ櫙', '涓櫙', '杩戞櫙', '鐗瑰啓', '澶х壒鍐?]
  for (const keyword of shotTypeKeywords) {
    if (cleaned.startsWith(keyword)) {
      cleaned = cleaned.substring(keyword.length).trim()
      // Remove leading punctuation
      cleaned = cleaned.replace(/^[銆?锛?銆乚/, '').trim()
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
    const charRegex = new RegExp(`### (?:涓昏|閰嶈)[锛?]\\s*${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=### (?:涓昏|閰嶈)|## |$)`, 'i')
    const charMatch = keyElementsContent.match(charRegex)
    if (charMatch) {
      characterVisual = charMatch[1]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/^[\-\*]\s+/gm, '')
        .replace(/\n+/g, '锛?)
        .trim()
    }
  }

  // Parse scene description
  if (sceneName) {
    const sceneRegex = new RegExp(`### (?:涓昏鍦烘櫙|娆¤鍦烘櫙)[涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗\d]*[锛?]\\s*${sceneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=### (?:涓昏鍦烘櫙|娆¤鍦烘櫙)|## |$)`, 'i')
    const sceneMatch = keyElementsContent.match(sceneRegex)
    if (sceneMatch) {
      sceneVisual = sceneMatch[1]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/^[\-\*]\s+/gm, '')
        .replace(/\n+/g, '锛?)
        .trim()
    }
  }

  return { characterVisual, sceneVisual }
}

function parseStoryboardFrames(storyboardText: string): ParsedFrame[] {
  const frames: ParsedFrame[] = []
  
  // Remove metadata headers
  const cleanText = storyboardText
    .replace(/^#\s*鍒嗛暅璁捐.*?\n/, '')
    .replace(/^\*?\*?鎬婚暅澶存暟\*?\*?[锛?]\s*\d+.*?\n/, '')
    .replace(/^\*?\*?棰勮鎬绘椂闀縗*?\*?[锛?].*?\n/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  
  // Split by **闀?to get each shot block
  const blocks = cleanText.split(/(?=\*\*闀淸涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d])/g).filter(b => b.trim().startsWith('**闀?))
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const lines = block.split('\n')
    
    // Extract title from first line: **闀滀竴 路 鏍囬**
    const titleLine = lines[0].trim()
    let title = titleLine
      .replace(/^\*\*闀淸涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+\s*[路\-]\s*/, '')
      .replace(/[锛?][^锛?]+[锛?]/, '')
      .replace(/\*\*$/, '')
      .trim()
    if (!title) title = `闀滃ご${i + 1}`
    
    // Extract description: lines after title until character/scene tags
    let description = ''
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j].trim()
      if (line.startsWith('瑙掕壊锛?) || line.startsWith('- **瑙掕壊**') ||
          line.startsWith('鍦烘櫙锛?) || line.startsWith('- **鍦烘櫙**')) break
      description += line + '\n'
    }
    description = description.trim()
    
    // Extract character and scene from raw block
    const roleMatch = block.match(/[-*]\s*\*\*瑙掕壊\*\*[锛?]\s*(.+)/)
    const sceneMatch = block.match(/[-*]\s*\*\*鍦烘櫙\*\*[锛?]\s*(.+)/)
    const characterName = roleMatch ? roleMatch[1].split(/[,锛屻€乚/)[0].trim() : null
    const sceneName = sceneMatch ? sceneMatch[1].trim() : null
    
    console.log(`[DEBUG] Frame ${i}: title="${title}", descLength=${description.length}`)
    
    frames.push({
      order: i,
      title: `闀滃ご${i + 1} 路 ${title}`,
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
  // Handle multiple character names (e.g., "鏋楁檽锛岄檲鏅?) - take first one
  const firstCharName = characterName ? characterName.split(/[,锛屻€乚/)[0].trim() : null
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
    '鏋楁檽': 'Lin Xiao', '闄堥粯': 'Chen Mo', '鏍戝０': 'Shu Sheng',
    '灏忕': 'Xiao He', '鏃?: 'character',
  }
  return map[name] || name
}

// Extract key action from content (remove camera technical descriptions)
function extractAction(content: string): string {
  return content
    .replace(/闀滃ご浠?*?寮€濮媅锛?]/g, '')  // Remove "闀滃ご浠?..寮€濮?
    .replace(/閲囩敤.*?[銆傦紝]/g, '')       // Remove "閲囩敤鍏ㄦ櫙"
    .replace(/闊虫晥.*$/g, '')             // Remove sound effects
    .replace(/^\s*[锛?銆乚\s*/, '')       // Remove leading punctuation
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
    /璇烽棶/, /宸蹭负鎮?, /寰堝姩浜?, /娓╅Θ/, /闇€瑕佺户缁?, /涓嬩竴涓?,
    /濂界殑/, /鏄庣櫧/, /鏀跺埌/, /娌￠棶棰?, /璇烽棶闇€瑕?,
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
    '绫诲瀷', '鏃堕暱', '鍩鸿皟', '姊楁', '浜虹墿璁惧畾', '鍦烘櫙鍒嗗箷',
    '绗竴骞?, '绗簩骞?, '绗笁骞?, '绗洓骞?, '鍐茬獊', '涓婚', '闅愬柣',
    '璞″緛鐫€', '杩欎竴骞?, '鎬ф牸', '鑳屾櫙鏁呬簨', '蹇冪悊', '浠栨槸涓€涓?, '鍐呭績鐙櫧',
    '馃摐', 'Scene', 'Act', 'Profile', 'Introduction', '瑙掕壊', '澶栬矊'
  ]

  for (const word of blacklist) {
    if (rawText.includes(word)) {
      return { valid: false, reason: `妫€娴嬪埌绂佺敤璇?${word}"` }
    }
  }

  const lines = rawText.split('\n').filter(l => l.trim())

  if (lines.length !== 3) {
    return { valid: false, reason: `蹇呴』杈撳嚭3琛岋紝瀹為檯${lines.length}琛宍 }
  }

  for (let i = 0; i < 3; i++) {
    if (!lines[i].trim().startsWith(`Prompt ${i + 1}:`)) {
      return { valid: false, reason: `绗?{i + 1}琛屽繀椤讳互"Prompt ${i + 1}:"寮€澶碻 }
    }
  }

  // Check for 5 required tags
  const requiredTags = ['[shot:', '[subject:', '[details:', '[lighting:', '[mood:']
  for (const tag of requiredTags) {
    if (!rawText.includes(tag)) {
      return { valid: false, reason: `缂哄皯鏍囩${tag}` }
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

const CUSTOM_OPTION: WizardOption = { id: '__custom__', label: 'AI鍔╂墜', description: '璁〢I甯綘鎺ㄨ崘', icon: '馃' }
const FREE_INPUT_OPTION: WizardOption = { id: '__free_input__', label: '鑷敱杈撳叆', description: '鑷繁杈撳叆鎯虫硶', icon: '鉁忥笍' }
const CONFIRM_OPTION: WizardOption = { id: '__confirm__', label: '纭', description: '纭杩涘叆涓嬩竴姝? }

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
      base_url: keys.base_url || DEFAULTS.CHAT_BASE_URL,
      model: keys.model || DEFAULTS.CHAT_MODEL,
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
      content: '娆㈣繋鏉ュ埌婕墽鍒涗綔宸ヤ綔瀹わ紒璇烽棶浣犳湁鐜版垚鐨勫墽鏈悧锛?,
      status: 'done',
      options: [
        { id: '__has_script__', label: '馃搫 鎴戞湁鍓ф湰', description: '涓婁紶鎴栫矘璐村凡鏈夊墽鏈? },
        { id: '__no_script__', label: '鉁嶏笍 鎴戞病鏈夊墽鏈?, description: '閫氳繃鍚戝寮曞鍒涗綔' },
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
            id: o.label === '鑷敱杈撳叆' ? '__free_input__' : o.label === 'AI鎺ㄨ崘' ? '__ai_recommend__' : `${q.id}_${i}`,
            label: o.label,
            description: o.description,
          })),
        }))
        if (fetchedQuestions.length > 0) {
          setQuestions(fetchedQuestions)
          setCurrentQuestionIndex(0)
          updateMessage(msgId, {
            content: result.greeting || '濂界殑锛岃鎴戦棶浣犲嚑涓棶棰樻潵鏄庣‘鍒涗綔鏂瑰悜銆?,
            status: 'done',
          })
          const firstQ = fetchedQuestions[0]
          addMessage({
            role: 'assistant',
            content: firstQ.text,
            status: 'done',
            options: firstQ.options,
            allowCustom: true,
            customPlaceholder: '璇疯緭鍏ヤ綘鎯宠鐨?..',
          })
        } else {
          updateMessage(msgId, { content: '鑾峰彇闂澶辫触锛岃閲嶈瘯銆?, status: 'error', retryable: true })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        updateMessage(msgId, { content: `鑾峰彇闂澶辫触锛?{errorMsg}`, status: 'error', retryable: true })
      }
    },
    [addMessage, updateMessage, getApiConfig]
  )

  const confirmHasScript = useCallback(async (hasScript: boolean, scriptText?: string) => {
    if (!hasScript) {
      setAwaitingScriptDecision(false)
      addMessage({ role: 'user', content: '鎴戞病鏈夊墽鏈?, status: 'done' })
      addMessage({
        role: 'assistant',
        content: '濂界殑锛岃鍛婅瘔鎴戜綘鎯冲垱浣滅殑涓婚锛堜緥濡傦細鏍″洯鎭嬬埍銆佹偓鐤戞帹鐞嗐€佸彜椋庝粰渚犵瓑锛夈€?,
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
        content: '鍓ф湰宸叉帴鏀讹紝璇锋煡鐪嬩笅鏂归瑙堛€傜‘璁ゅ悗鐐瑰嚮"鍚屾剰锛屽紑濮嬪埗浣?銆?,
        status: 'done',
        scriptDraft: draft,
      })
      if (!projectId) {
        await createNewProject(scriptText.slice(0, 30))
      }
      await saveProject()
      return
    }

    // hasScript but no content yet 鈥?awaitingScriptDecision stays true
    addMessage({ role: 'user', content: '鎴戞湁鍓ф湰', status: 'done' })
    addMessage({
      role: 'assistant',
      content: '璇风洿鎺ョ矘璐翠綘鐨勫墽鏈唴瀹癸紝鎴栫偣鍑昏緭鍏ユ鏃佺殑銆?銆嶆寜閽笂浼?.txt 鏂囦欢銆?,
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
            const hasScriptContent = msg.content.includes('馃摐') ||
                                    msg.content.includes('绫诲瀷') ||
                                    msg.content.includes('鍦烘櫙')
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
          (opt) => !opt.label.includes('鍏朵粬') && !opt.label.includes('AI鍔╂墜') && opt.id !== '__custom__' && opt.id !== '__free_input__'
        )
        const optionsWithExtra = [...aiOptions, FREE_INPUT_OPTION, CUSTOM_OPTION]
        updateMessage(msgId, {
          content: result.content || `璇烽€夋嫨${stepId}锛歚,
          status: 'done',
          options: optionsWithExtra,
          allowCustom: true,
          customPlaceholder: '璇疯緭鍏ヤ綘鎯宠鐨?..',
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        updateMessage(msgId, {
          content: `鑾峰彇閫夐」澶辫触锛?{errorMsg}`,
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
      const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪涓轰綘鐢熸垚鍓ф湰...', status: 'generating' })
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
          content: '鍓ф湰宸茬敓鎴愶紝璇锋煡鐪嬶細',
          status: 'done',
          scriptDraft: parseScriptDraft(result.content),
        })
        if (!projectId) {
          const idea = allChoices.topic || allChoices.genre || '鏈懡鍚嶉」鐩?
          await createNewProject(idea)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('idle')
        setCurrentSubPhase('none')
        updateMessage(msgId, {
          content: `鍓ф湰鐢熸垚澶辫触锛?{errorMsg}`,
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
          customPlaceholder: '璇疯緭鍏ヤ綘鎯宠鐨?..',
        })
      } else {
        await generateScript(newSession)
      }
    },
    [session, currentQuestionIndex, questions, addMessage, generateScript]
  )

  const aiRecommend = useCallback(
    async (fieldId: string) => {
      const msgId = addMessage({ role: 'assistant', content: 'AI 姝ｅ湪涓轰綘鎺ㄨ崘...', status: 'generating' })
      try {
        const result = await chatApi({
          action: 'ai_recommend',
          api_config: getApiConfig(),
          topic: session.topic || '',
          field_id: fieldId,
          session,
        })
        const recommendLabel = result.label || 'AI鎺ㄨ崘'
        const recommendDesc = result.description || ''
        updateMessage(msgId, {
          content: `AI鎺ㄨ崘锛?{recommendLabel} 鈥?${recommendDesc}`,
          status: 'done',
        })
        await selectOption(fieldId, recommendLabel, recommendLabel)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        updateMessage(msgId, { content: `AI鎺ㄨ崘澶辫触锛?{errorMsg}`, status: 'error' })
      }
    },
    [session, addMessage, updateMessage, getApiConfig, selectOption]
  )

  const confirmScript = useCallback(async () => {
    if (isConfirmingScript.current) return
    isConfirmingScript.current = true

    try {
      addMessage({ role: 'user', content: '鍚屾剰锛屽紑濮嬪埗浣?, status: 'done' })
      setCurrentSubPhase('none')

      setPhase('generating_key_elements')
      const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪鐢熸垚鍏抽敭瑙嗚鍏冪礌...', status: 'generating' })
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
          content: `**鍏抽敭瑙嗚鍏冪礌**\n\n${result.content}\n\n---\n璇风‘璁ゆ垨杈撳叆淇敼鎰忚锛堝"鎶婁富瑙掓敼鎴愮孩鑹插ご鍙?锛塦,
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
          content: `鍏抽敭鍏冪礌鐢熸垚澶辫触锛?{errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    } finally {
      isConfirmingScript.current = false
    }
  }, [scriptContent, addMessage, updateMessage, getApiConfig, saveProject])

  const confirmKeyElements = useCallback(async () => {
    addMessage({ role: 'user', content: '纭', status: 'done' })

    setPhase('generating_narration')
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪鐢熸垚鏃佺櫧鍜岄煶涔愭彁绀?..', status: 'generating' })
    lastActionRef.current = { action: 'generate_narration', data: {} }

    try {
      const apiConfig = getApiConfig()
      const dialogueType = (session.dialogue as string) || '鏈夊鐧?
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
        content: `**鏃佺櫧涓庨煶涔?*\n\n${result.content}\n\n---\n璇风‘璁ゆ垨杈撳叆淇敼鎰忚`,
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
          content: `鏃佺櫧鐢熸垚澶辫触锛?{errorMsg}`,
        status: 'error',
        retryable: true,
      })
    }
  }, [scriptContent, session, addMessage, updateMessage, getApiConfig, saveProject])

  const _generateStoryboardDirect = useCallback(async () => {
    setPhase('generating_storyboard')
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪鐢熸垚鍒嗛暅璁捐...', status: 'generating' })
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
      const sbContent = result.content || '# 鍒嗛暅璁捐\n\n**鎬婚暅澶存暟**锛? | **棰勮鎬绘椂闀?*锛? + targetDuration + '绉?
      setStoryboardContent(sbContent)
      setPhase('storyboard_review')
      setCurrentSubPhase('storyboard')
      updateMessage(msgId, {
        content: `**鍒嗛暅璁捐**\n\n${sbContent}\n\n---\n璇风‘璁ゆ垨杈撳叆淇敼鎰忚`,
        status: 'done',
        storyboardContent: sbContent,
        options: [CONFIRM_OPTION],
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setPhase('dialogue_review')
      setCurrentSubPhase('dialogue')
      updateMessage(msgId, {
        content: `鍒嗛暅鐢熸垚澶辫触锛?{errorMsg}`,
        status: 'error',
        retryable: true,
      })
    }
  }, [scriptContent, session, addMessage, updateMessage, getApiConfig])

  const confirmNarration = useCallback(async () => {
    addMessage({ role: 'user', content: '纭', status: 'done' })

    const dialogueType = (session.dialogue as string) || '鏈夊鐧?
    if (dialogueType === '鏈夊鐧? || dialogueType === '浜虹墿涔嬮棿鐨勫鐧?) {
      setPhase('generating_dialogue')
      const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪鐢熸垚瑙掕壊瀵硅瘽...', status: 'generating' })
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
          content: `**瑙掕壊瀵硅瘽**\n\n${result.content}\n\n---\n璇风‘璁ゆ垨杈撳叆淇敼鎰忚`,
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
          content: `瀵硅瘽鐢熸垚澶辫触锛?{errorMsg}`,
          status: 'error',
          retryable: true,
        })
      }
    } else {
      await _generateStoryboardDirect()
    }
  }, [scriptContent, session, addMessage, updateMessage, getApiConfig, _generateStoryboardDirect, saveProject])

  const confirmDialogue = useCallback(async () => {
    addMessage({ role: 'user', content: '纭', status: 'done' })
    await _generateStoryboardDirect()
    await saveProject()
  }, [addMessage, _generateStoryboardDirect, saveProject])

  const modifyKeyElements = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪淇敼鍏抽敭鍏冪礌...', status: 'generating' })
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
        content: `**鍏抽敭瑙嗚鍏冪礌锛堝凡淇敼锛?*\n\n${result.content}\n\n---\n璇风‘璁ゆ垨缁х画淇敼`,
        status: 'done',
        keyElementsContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `淇敼澶辫触锛?{errorMsg}`, status: 'error', retryable: true })
    }
  }, [keyElementsContent, addMessage, updateMessage, getApiConfig, saveProject])

  const modifyNarration = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪淇敼鏃佺櫧...', status: 'generating' })
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
        content: `**鏃佺櫧涓庨煶涔愶紙宸蹭慨鏀癸級**\n\n${result.content}\n\n---\n璇风‘璁ゆ垨缁х画淇敼`,
        status: 'done',
        narrationContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `淇敼澶辫触锛?{errorMsg}`, status: 'error', retryable: true })
    }
  }, [narrationContent, addMessage, updateMessage, getApiConfig, saveProject])

  const modifyDialogue = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪淇敼瀵硅瘽...', status: 'generating' })
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
        content: `**瑙掕壊瀵硅瘽锛堝凡淇敼锛?*\n\n${result.content}\n\n---\n璇风‘璁ゆ垨缁х画淇敼`,
        status: 'done',
        dialogueContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `淇敼澶辫触锛?{errorMsg}`, status: 'error', retryable: true })
    }
  }, [dialogueContent, addMessage, updateMessage, getApiConfig, saveProject])

  const modifyStoryboard = useCallback(async (modificationRequest: string) => {
    addMessage({ role: 'user', content: modificationRequest, status: 'done' })
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪淇敼鍒嗛暅...', status: 'generating' })
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
        content: `**鍒嗛暅璁捐锛堝凡淇敼锛?*\n\n${result.content}\n\n---\n璇风‘璁ゆ垨缁х画淇敼`,
        status: 'done',
        storyboardContent: result.content,
        options: [CONFIRM_OPTION],
      })
      await saveProject()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      updateMessage(msgId, { content: `淇敼澶辫触锛?{errorMsg}`, status: 'error', retryable: true })
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
      addMessage({ role: 'user', content: `淇敼${categoryId}锛?{subOption}`, status: 'done' })
      const msgId = addMessage({ role: 'assistant', content: `姝ｅ湪鏍规嵁銆?{subOption}銆嶄慨鏀瑰墽鏈?..`, status: 'generating' })
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
          content: '鍓ф湰宸蹭慨鏀癸紝璇锋煡鐪嬶細',
          status: 'done',
          scriptDraft: parseScriptDraft(result.content),
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setPhase('script_review')
        updateMessage(msgId, {
          content: `淇敼澶辫触锛?{errorMsg}`,
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
    const msgId = addMessage({ role: 'assistant', content: '姝ｅ湪淇敼鍓ф湰...', status: 'generating' })
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
        content: '鍓ф湰宸蹭慨鏀癸紝璇锋煡鐪嬶細',
        status: 'done',
        scriptDraft: parseScriptDraft(result.content),
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setPhase('script_review')
      updateMessage(msgId, {
        content: `淇敼澶辫触锛?{errorMsg}`,
        status: 'error',
        retryable: true,
      })
    }
  }, [scriptContent, addMessage, updateMessage, getApiConfig])

  const generateKeyFrames = useCallback(async () => {
    console.log('馃敟馃敟馃敟 GENERATE KEYFRAMES STARTED 馃敟馃敟馃敟')
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
        content: '鈿狅笍 鏈兘浠庡垎闀滀腑鎻愬彇闀滃ご淇℃伅锛岃妫€鏌ュ垎闀滄牸寮忋€?,
        status: 'done',
      })
      setGeneratingKeyFrames(false)
      return
    }

    const progressMsgId = addMessage({
      role: 'assistant',
      content: `姝ｅ湪涓?${frames.length} 涓暅澶寸敓鎴愯捣濮嬪抚鍥剧墖...`,
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
        content: `姝ｅ湪澶勭悊闀滃ご ${i + 1}/${frames.length}锛氥€?{frame.title}銆峘,
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

銆怌ore Action銆?{coreAction}
銆怌haracter銆?{charPinyin}
銆怱cene銆?{frame.sceneName || 'unspecified'}

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
        content: `闀滃ご ${i + 1}銆?{frame.title}銆峔n\n${keywords.map((k, idx) => `鐢婚潰${idx + 1}锛?{k}`).join('\n\n')}`,
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
            model: keys.image_model || DEFAULTS.IMAGE_MODEL,
            base_url: keys.image_base_url || DEFAULTS.IMAGE_BASE_URL,
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
                model: keys.image_model || DEFAULTS.IMAGE_MODEL,
                base_url: keys.image_base_url || DEFAULTS.IMAGE_BASE_URL,
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
      content: `鉁?宸蹭负 ${frames.length} 涓暅澶寸敓鎴愯捣濮嬪抚鍥剧墖`,
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
    addMessage({ role: 'user', content: '鐢熸垚璧峰甯у浘鐗?, status: 'done' })
    await generateKeyFrames()
  }, [generateKeyFrames, addMessage])

  const acceptOptimizedPrompts = useCallback((finalPrompts: string) => {
    setOptimizedPrompts(finalPrompts)
    setPhase('done')
    setEditOptimizedPrompts(false)
    addMessage({ role: 'user', content: '纭浣跨敤鎻愮ず璇?, status: 'done' })
    addMessage({ role: 'assistant', content: '鎻愮ず璇嶅凡纭锛佸悗缁皢浣跨敤杩欎簺鎻愮ず璇嶇敓鎴愬浘鐗囥€?, status: 'done' })
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
      /^[\-\*]\s*\*{0,2}浜虹墿\*{0,2}[锛?]/im,
      /^[\-\*]\s*\*{0,2}瑙掕壊\*{0,2}[锛?]/im,
      /浜虹墿[锛?]/,
      /瑙掕壊[锛?]/,
      /浜虹墿鍔ㄤ綔/,
      /浜虹墿琛ㄦ儏/,
      /鍔ㄤ綔涔犳儻/,
      /琛ㄦ儏鎻忓啓/,
      /鍔ㄤ綔鎻忓啓/,
      /瀵圭櫧/,
      /鍙拌瘝/,
      /涓昏/,
      /閰嶈/,
      /\b浠朶b/,
      /\b濂筡b/,
      /\b浠栦滑\b/,
      /\b濂逛滑\b/,
      /瑙掕壊鍔ㄤ綔/,
      /瑙掕壊琛ㄦ儏/,
      /浜虹墿褰㈣薄/,
      /瑙掕壊褰㈣薄/,
    ]

    return raw
      .split('\n')
      .filter(line => !personPatterns.some(p => p.test(line)))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }, [])

  /** 瑙ｆ瀽 keyElementsContent 涓鸿鑹插拰鍦烘櫙鐨勫畬鏁存弿杩帮紙涓嶆埅鏂級 */
  const parseKeyElementsContent = useCallback((content: string) => {
    const characters: Array<{ name: string; role: string; fullText: string; cleanText: string }> = []
    const scenes: Array<{ name: string; type: string; fullText: string; cleanText: string }> = []

    if (!content) return { characters, scenes }

    const sections = content.split(/(?=^## )/m)
    for (const section of sections) {
      const headingMatch = section.match(/^## (.+)$/m)
      if (!headingMatch) continue
      const heading = headingMatch[1]

      if (heading.includes('瑙掕壊褰㈣薄')) {
        const subSections = section.split(/(?=^### )/m)
        for (const sub of subSections) {
          const subMatch = sub.match(/^### (涓昏|閰嶈)[锛?](.+)$/m)
          if (!subMatch) continue
          const role = subMatch[1]
          const name = subMatch[2].trim()
          const fullText = sub.split('\n').slice(1).filter(l => l.trim()).join('\n').trim()
          const cleanText = fullText
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/^[\-\*]\s+/gm, '')
            .replace(/\n+/g, '锛?)
            .trim()
          characters.push({ name, role, fullText, cleanText })
        }
      } else if (heading.includes('鍦烘櫙')) {
        const subSections = section.split(/(?=^### )/m)
        for (const sub of subSections) {
          const subMatch = sub.match(/^### (涓昏鍦烘櫙|娆¤鍦烘櫙)[涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]*[锛?]\s*(.+)$/m)
          if (!subMatch) continue
          const type = subMatch[1]
          const name = subMatch[2].trim()
          const fullText = sub.split('\n').slice(1).filter(l => l.trim()).join('\n').trim()
          const cleanText = filterSceneDescription(fullText)
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/^[\-\*]\s+/gm, '')
            .replace(/\n+/g, '锛?)
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
      if (c.role === '涓昏') keys.push(`char_${c.name}`)
    }
    for (const s of scenes) {
      if (s.type === '涓昏鍦烘櫙') keys.push(`scene_${s.name}`)
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
    addMessage({ role: 'user', content: '纭', status: 'done' })
    setCurrentSubPhase('image_confirm')
    addMessage({
      role: 'assistant',
      content: '鎵€鏈夋枃鏈凡鍑嗗灏辩华锛乗n\n璇峰厛閫夋嫨鐢婚锛堢偣鍑诲簳閮?Skill 鎸夐挳锛夛紝鐒跺悗鐐瑰嚮涓嬫柟鎸夐挳寮€濮嬬敓鎴愯鑹?鍦烘櫙鍥剧墖锛?,
      status: 'done',
      options: [
        { id: '__confirm__', label: '馃帹 寮€濮嬬敓鎴愯鑹?鍦烘櫙鍥剧墖', description: '鐢熸垚鍏抽敭瑙嗚鍏冪礌鐨勬蹇靛浘' },
      ],
    })
    saveProject()
  }, [addMessage, saveProject])

  const generateKeyElementsImages = useCallback(async () => {
    if (!keyElementsContent) return

    setGeneratingKeyElementsImages(true)
    setKeyElementsImageProgress('姝ｅ湪瑙ｆ瀽鍏抽敭鍏冪礌...')

    const keys = loadApiKeys()
    const apiKey = keys.image_api_key
    const model = keys.image_model || DEFAULTS.IMAGE_MODEL
    const baseUrl = keys.image_base_url || DEFAULTS.IMAGE_BASE_URL

    if (!apiKey) {
      alert('璇峰厛鍦ㄨ缃腑閰嶇疆鍥惧儚 API Key')
      setGeneratingKeyElementsImages(false)
      return
    }

    const style = getSelectedStyle()
    if (!style) {
      addMessage({
        role: 'assistant',
        content: '璇峰厛鍦ㄤ笅鏂?Skill 鍒楄〃涓€夋嫨涓€绉嶇敾椋庯紝鐒跺悗閲嶆柊鐐瑰嚮鐢熸垚鎸夐挳銆?,
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
      alert('鏈壘鍒板彲鐢熸垚鍥剧墖鐨勮鑹叉垨鍦烘櫙')
      setGeneratingKeyElementsImages(false)
      return
    }

    const progressMsgId = addMessage({
      role: 'assistant', content: `姝ｅ湪鐢熸垚瑙嗚鍏冪礌鍥剧墖 0/${totalItems}...`, status: 'generating'
    })

    let completed = 0

    for (const char of characters) {
      const charKey = `char_${char.name}`
      setKeyElementsProgress(prev => ({ ...prev, [charKey]: 0 }))
      setKeyElementsImageProgress(`姝ｅ湪鐢熸垚瑙掕壊鍥?${completed + 1}/${totalItems}: ${char.name}`)
      updateMessage(progressMsgId, { content: `姝ｅ湪鐢熸垚瑙掕壊鍥?${completed + 1}/${totalItems}: ${char.name}` })
      try {
        const prompt = `${stylePrefix}瑙掕壊姝ｉ潰鍏ㄨ韩鐓э細${char.name}锛?{char.cleanText}銆傜敾闈㈣姹傦細绾櫧鑹茶儗鏅紝鐢靛奖鎰熸煍鍜屽厜褰憋紝瓒呭啓瀹炶川鎰熴€備汉鐗╂闈㈢珯绔嬶紝鍙屾墜鑷劧涓嬪瀭锛岄潰閮ㄦ瀵归暅澶达紝鍏ㄨ韩瀹屾暣鍏ラ暅锛屾棤閫忚鐣稿彉銆?K锛岃秴楂樿川閲忋€俙
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
            const prefix = k.startsWith('char_') ? '瑙掕壊' : '鍦烘櫙'
            const name = k.replace(/^char_|^scene_/, '')
            return `鈥?${prefix}锛?{name}`
          }).join('\n')
          updateMessage(progressMsgId, {
            content: `鉁?宸茬敓鎴?${totalItems} 寮犲浘鐗囥€俓n\n浠ヤ笅瑙掕壊/鍦烘櫙灏氭湭閫夋嫨涓诲弬鑰冨浘锛歕n${missingList}\n\n璇风偣鍑诲乏渚у崱鐗囦腑鐨勫浘鐗囷紝鍙屽嚮閫夋嫨"浣滀负涓诲浘"銆傛弧鎰忓悗鐐瑰嚮涓嬫柟鎸夐挳锛歚,
            status: 'done',
            options: [
              { id: '__satisfied__', label: '鉁?婊℃剰锛岀户缁笅涓€姝?, description: '妫€鏌ヤ富鍥惧悗鐢熸垚鍒嗛暅鍥剧墖' },
              { id: '__regenerate__', label: '馃攧 閲嶆柊鐢熸垚鍏ㄩ儴', description: '杩藉姞鐢熸垚鏇村鍥剧墖' },
            ],
          })
        } else {
          updateMessage(progressMsgId, {
            content: `鉁?宸茬敓鎴?${totalItems} 寮犲浘鐗囥€傛墍鏈変富鍙傝€冨浘宸查€夋嫨锛乣,
            status: 'done',
            options: [
              { id: '__confirm__', label: '鉁?鐢熸垚鍒嗛暅鍥剧墖', description: '杩涘叆鍒嗛暅鍥剧墖鐢熸垚' },
              { id: '__regenerate__', label: '馃攧 閲嶆柊鐢熸垚鍏ㄩ儴', description: '杩藉姞鐢熸垚鏇村鍥剧墖' },
            ],
          })
        }
      }
    }

    for (const scene of scenes) {
      const sceneKey = `scene_${scene.name}`
      setKeyElementsProgress(prev => ({ ...prev, [sceneKey]: 0 }))
      setKeyElementsImageProgress(`姝ｅ湪鐢熸垚鍦烘櫙鍥?${completed + 1}/${totalItems}: ${scene.name}`)
      updateMessage(progressMsgId, { content: `姝ｅ湪鐢熸垚鍦烘櫙鍥?${completed + 1}/${totalItems}: ${scene.name}` })
      try {
        const prompt = `${stylePrefix}鐜鍦烘櫙鍥撅紝涓嶈鍖呭惈浠讳綍浜虹墿锛?{scene.name}锛?{scene.cleanText}锛宒etailed environment, atmospheric lighting, high quality, no people, no characters, empty scene, environment only`
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
            const prefix = k.startsWith('char_') ? '瑙掕壊' : '鍦烘櫙'
            const name = k.replace(/^char_|^scene_/, '')
            return `鈥?${prefix}锛?{name}`
          }).join('\n')
          updateMessage(progressMsgId, {
            content: `鉁?宸茬敓鎴?${totalItems} 寮犲浘鐗囥€俓n\n浠ヤ笅瑙掕壊/鍦烘櫙灏氭湭閫夋嫨涓诲弬鑰冨浘锛歕n${missingList}\n\n璇风偣鍑诲乏渚у崱鐗囦腑鐨勫浘鐗囷紝鍙屽嚮閫夋嫨"浣滀负涓诲浘"銆傛弧鎰忓悗鐐瑰嚮涓嬫柟鎸夐挳锛歚,
            status: 'done',
            options: [
              { id: '__satisfied__', label: '鉁?婊℃剰锛岀户缁笅涓€姝?, description: '妫€鏌ヤ富鍥惧悗鐢熸垚鍒嗛暅鍥剧墖' },
              { id: '__regenerate__', label: '馃攧 閲嶆柊鐢熸垚鍏ㄩ儴', description: '杩藉姞鐢熸垚鏇村鍥剧墖' },
            ],
          })
        } else {
          updateMessage(progressMsgId, {
            content: `鉁?宸茬敓鎴?${totalItems} 寮犲浘鐗囥€傛墍鏈変富鍙傝€冨浘宸查€夋嫨锛乣,
            status: 'done',
            options: [
              { id: '__confirm__', label: '鉁?鐢熸垚鍒嗛暅鍥剧墖', description: '杩涘叆鍒嗛暅鍥剧墖鐢熸垚' },
              { id: '__regenerate__', label: '馃攧 閲嶆柊鐢熸垚鍏ㄩ儴', description: '杩藉姞鐢熸垚鏇村鍥剧墖' },
            ],
          })
        }
      }
    }
  }, [keyElementsContent, addMessage, updateMessage, parseKeyElementsContent, getMissingReferences])

  const regenerateAllKeyElements = useCallback(async () => {
    addMessage({ role: 'user', content: '閲嶆柊鐢熸垚鏇村鍥剧墖', status: 'done' })
    await generateKeyElementsImages()
  }, [generateKeyElementsImages, addMessage])

  const confirmSatisfied = useCallback(() => {
    addMessage({ role: 'user', content: '婊℃剰锛岀户缁笅涓€姝?, status: 'done' })
    const missing = getMissingReferences()
    if (missing.length > 0) {
      setAwaitingReferenceSelection(true)
      const missingList = missing.map(k => {
        const prefix = k.startsWith('char_') ? '瑙掕壊' : '鍦烘櫙'
        const name = k.replace(/^char_|^scene_/, '')
        return `鈥?${prefix}锛?{name}`
      }).join('\n')
      addMessage({
        role: 'assistant',
        content: `浠ヤ笅瑙掕壊/鍦烘櫙灏氭湭閫夋嫨涓诲弬鑰冨浘锛歕n\n${missingList}\n\n璇风偣鍑诲乏渚у崱鐗囦腑鐨勫浘鐗囷紝鍙屽嚮閫夋嫨"浣滀负涓诲浘"銆俙,
        status: 'done',
        options: [
          { id: '__confirm__', label: '鉁?鎵€鏈変富鍥惧凡閫夊ソ锛岀敓鎴愬垎闀滃浘鐗?, description: '寮€濮嬬敓鎴愬垎闀滃浘鐗? },
          { id: '__skip__', label: '鈴笍 浣跨敤榛樿鍥剧墖锛岀户缁敓鎴?, description: '璺宠繃閫夋嫨锛屼娇鐢ㄧ涓€寮犲浘鐗囦綔涓哄弬鑰? },
        ],
      })
    } else {
      setAwaitingReferenceSelection(false)
      addMessage({
        role: 'assistant',
        content: '鎵€鏈変富鍙傝€冨浘宸查€夋嫨锛佺偣鍑讳笅鏂规寜閽敓鎴愯捣濮嬪抚鍥剧墖锛?,
        status: 'done',
        options: [
          { id: '__confirm__', label: '馃幀 鐢熸垚璧峰甯у浘鐗?, description: '涓哄墠3涓暅澶寸敓鎴愮數褰辩骇璧峰甯? },
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
        addMessage({ role: 'assistant', content: '宸茶烦杩囪闊筹紝鍒嗛暅宸插氨缁€備綘鍙互鍦ㄥ乏渚ч潰鏉挎煡鐪嬪垎闀滆鎯呫€?, status: 'done' })
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
    male: ['鐧芥ˇ', '鑻忔墦'],
    female: ['鍐扮硸', '鑼夎帀'],
  }
  
  const getCharacterGender = useCallback((characterName: string): 'male' | 'female' => {
    if (!keyElementsContent) return 'female'
    
    const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `### (涓昏|閰嶈)[锛?]\\s*${escapedName}[\\s\\S]*?(?=### |$)`,
      'i'
    )
    const match = keyElementsContent.match(regex)
    if (!match) return 'female'
    
    const section = match[0]
    
    const maleKeywords = /鐢穦鐢风敓|鐢锋€鐢峰|灏戝勾|鐢峰瓙|闈掑勾|鐢峰＋|甯呭摜|澶у彅|鐖风埛|鐖朵翰|鐖哥埜|鍝ュ摜|寮熷紵|鍏堢敓|鐢蜂富/
    const femaleKeywords = /濂硘濂崇敓|濂虫€濂冲|灏戝コ|濂冲瓙|濮戝|濂冲＋|缇庡コ|闃垮Ж|濂跺ザ|姣嶄翰|濡堝|濮愬|濡瑰|灏忓|濂充富/
    
    if (maleKeywords.test(section)) return 'male'
    if (femaleKeywords.test(section)) return 'female'
    
    const roleMatch = section.match(/### (涓昏|閰嶈)/)
    return roleMatch && roleMatch[1] === '涓昏' ? 'male' : 'female'
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
      const match = line.match(/^[锛?]?([^锛?]+)[锛?]?\s*[锛?]\s*(.+)/)
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
    const voiceModel = keys.voice_model || DEFAULTS.TTS_MODEL
    const useSame = keys.voice_use_same !== 'false'
    
    const apiKey = useSame ? keys.text : (keys.voice_api_key || keys.text)
    const baseUrl = useSame ? keys.base_url : (keys.voice_base_url || keys.base_url)
    
    if (!apiKey) {
      addMessage({ role: 'assistant', content: '璇峰厛閰嶇疆 API Key銆?, status: 'error' })
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
      addMessage({ role: 'assistant', content: '娌℃湁鍏抽敭鍏冪礌鍐呭锛屾棤娉曟彁鍙栬鑹层€?, status: 'error' })
      return
    }
    
    const sections = keyElementsContent.split(/(?=^## )/m)
    const characterNames: string[] = []
    
    for (const section of sections) {
      const headingMatch = section.match(/^## (.+)$/m)
      if (!headingMatch || !headingMatch[1].includes('瑙掕壊褰㈣薄')) continue
      
      const subSections = section.split(/(?=^### )/m)
      for (const sub of subSections) {
        const subMatch = sub.match(/^### (涓昏|閰嶈)[锛?](.+)$/m)
        if (subMatch) {
          characterNames.push(subMatch[2].trim())
        }
      }
    }
    
    if (characterNames.length === 0) {
      addMessage({ role: 'assistant', content: '鏈壘鍒拌鑹蹭俊鎭€?, status: 'error' })
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
      addMessage({ role: 'assistant', content: '娌℃湁闀滃ご鏁版嵁锛屾棤娉曠敓鎴愯棰戙€?, status: 'error' })
      return
    }

    setGeneratingVideo(true)
    setPhase('generating_video')

    const keys = loadApiKeys()
    const videoApiKey = keys.video_api_key || keys.image_api_key || keys.text
    const videoModel = keys.video_model || DEFAULTS.VIDEO_MODEL
    const videoBaseUrl = keys.video_base_url || keys.image_base_url || DEFAULTS.VIDEO_BASE_URL

    // Debug: log video generation parameters
    console.log('[Video] Config:', {
      video_api_key: keys.video_api_key ? 'SET' : 'EMPTY',
      image_api_key: keys.image_api_key ? 'SET' : 'EMPTY',
      text_key: keys.text ? 'SET' : 'EMPTY',
      videoApiKey: videoApiKey ? 'SET' : 'EMPTY',
      videoModel,
      videoBaseUrl,
    })

    if (!videoApiKey) {
      addMessage({ 
        role: 'assistant', 
        content: '⚠️ 未配置视频API密钥！请在设置中配置视频API Key（或图像API Key）。', 
        status: 'error' 
      })
      setGeneratingVideo(false)
      return
    }

    // 璁＄畻鎬诲浘鐗囨暟
    let totalImages = 0
    for (let i = 0; i < frames.length; i++) {
      const frameImages = keyFramesImages[i]
      if (frameImages) totalImages += frameImages.length
    }

    const progressMsgId = addMessage({
      role: 'assistant',
      content: `姝ｅ湪涓?${frames.length} 涓暅澶寸殑 ${totalImages} 寮犲浘鐗囩敓鎴愯棰?..`,
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

      // 閬嶅巻姣忓紶鍥剧墖鐢熸垚瑙嗛
      for (let imgIdx = 0; imgIdx < frameImages.length; imgIdx++) {
        const imageUrl = frameImages[imgIdx]
        const key = `${i}_${imgIdx}`

        updateMessage(progressMsgId, {
          content: `姝ｅ湪涓洪暅澶?${i + 1}/${frames.length} 鍥剧墖 ${imgIdx + 1}/${frameImages.length} 鐢熸垚瑙嗛... (${completedCount + 1}/${totalImages})`,
        })

        try {
          const charPinyin = toPinyin(frame.characterName || 'character')
          const coreAction = extractAction(frame.content || frame.title)
          const videoPrompt = `cinematic film still with subtle breathing motion, ${charPinyin} ${coreAction}, ${frame.sceneName || 'scene'} environment, dramatic lighting, moody atmosphere, shallow depth of field, smooth animation`

          console.log(`[Video] Generating for frame ${i + 1} img ${imgIdx + 1}:`, {
            image_url: imageUrl?.substring(0, 80) + '...',
            videoApiKey: videoApiKey ? 'SET' : 'EMPTY',
            videoBaseUrl,
            videoModel,
          })

          console.log([Video] Generating for frame  img :, {
            image_url: imageUrl?.substring(0, 80) + '...',
            videoApiKey: videoApiKey ? 'SET' : 'EMPTY',
            videoBaseUrl,
            videoModel,
          })

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
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error(`[Video] Frame ${i + 1} img ${imgIdx + 1} failed:`, errMsg)
          updateMessage(progressMsgId, {
            content: `❌ 镜头 ${i + 1} 图片 ${imgIdx + 1} 失败: ${errMsg}`,
            status: 'error',
          })
        }

        completedCount++
      }
    }

    updateMessage(progressMsgId, {
      content: `鉁?瑙嗛鐢熸垚瀹屾垚锛佸叡 ${totalImages} 涓棰慲,
      status: 'done',
    })

    addMessage({
      role: 'assistant',
      content: `馃幀 鎵€鏈?${totalImages} 涓棰戝凡鐢熸垚锛乣,
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
        content: '闊宠壊宸茬‘璁わ紒鐜板湪鍙互寮€濮嬬敓鎴愯棰戜簡銆傜偣鍑讳笅鏂规寜閽紑濮嬶細',
        status: 'done',
        actions: [
          { id: 'generate_video', label: '馃幀 寮€濮嬬敓鎴愯棰?, description: '涓烘瘡涓暅澶寸敓鎴愬姩鎬佽棰? },
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
    title: '鏈懡鍚嶅墽鏈?,
    type: '鍓ф儏鐭墖',
    duration: '1-2鍒嗛挓',
    tone: '涓€?,
    characters: [],
    scenes: [],
    synopsis: '',
  }

  try {
    const titleMatch = content.match(/馃摐\s*\*?\*?([^*\n]+)/)
    if (titleMatch) defaultDraft.title = titleMatch[1].trim()

    const typeMatch = content.match(/绫诲瀷[锛?]\s*(.+)/)
    if (typeMatch) defaultDraft.type = typeMatch[1].trim()

    const durationMatch = content.match(/鏃堕暱[锛?]\s*(.+)/)
    if (durationMatch) defaultDraft.duration = durationMatch[1].trim()

    const toneMatch = content.match(/鍩鸿皟[锛?]\s*(.+)/)
    if (toneMatch) defaultDraft.tone = toneMatch[1].trim()

    const synopsisMatch = content.match(/鏁呬簨姊楁[锛?]\s*([\s\S]*?)(?=\n---|\n浜虹墿|$)/)
    if (synopsisMatch) defaultDraft.synopsis = synopsisMatch[1].trim().slice(0, 200)

    const characterRegex = /馃懁\s*\*?\*?([^*鈥擼+)\*?\*?\s*[鈥斺€?]\s*(.+)/g
    let charMatch
    while ((charMatch = characterRegex.exec(content)) !== null) {
      defaultDraft.characters.push({
        name: charMatch[1].trim(),
        identity: charMatch[2].trim(),
        personality: '',
      })
    }

    const sceneRegex = /\*\*绗琜涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+骞昜锛?]\s*(.+?)\*\*\s*\n([\s\S]*?)(?=\*\*绗琜涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+骞晐\*\*鍏抽敭杞姌|\*\*缁撳眬|$)/g
    let sceneMatch
    let actNum = 1
    while ((sceneMatch = sceneRegex.exec(content)) !== null) {
      const title = sceneMatch[1].trim()
      const body = sceneMatch[2].trim()
      const sceneMatch2 = body.match(/鍦烘櫙[锛?]\s*([\s\S]*?)(?=浜虹墿[锛?]|浜嬩欢[锛?]|鍐茬獊[锛?]|棰勮鏃堕暱|$)/)
      const characterMatch = body.match(/浜虹墿[锛?]\s*([\s\S]*?)(?=浜嬩欢[锛?]|鍐茬獊[锛?]|棰勮鏃堕暱|$)/)
      const eventMatch = body.match(/浜嬩欢[锛?]\s*([\s\S]*?)(?=鍐茬獊[锛?]|棰勮鏃堕暱|$)/)
      const conflictMatch = body.match(/鍐茬獊[锛?]\s*([\s\S]*?)(?=棰勮鏃堕暱|$)/)
      const durationMatch2 = body.match(/棰勮鏃堕暱[锛?]\s*(.+)/)
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
      const simpleRegex = /绗琜涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+骞昜锛?]\s*(.+?)(?:\n|$)/g
      let simpleMatch
      let simpleNum = 1
      while ((simpleMatch = simpleRegex.exec(content)) !== null) {
        const title = simpleMatch[1].trim()
        const nextLineIndex = content.indexOf(simpleMatch[0]) + simpleMatch[0].length
        const remaining = content.slice(nextLineIndex)
        const bodyMatch = remaining.match(/([\s\S]*?)(?=绗琜涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+骞昜锛?]|鍏抽敭杞姌|缁撳眬|$)/)
        const body = bodyMatch ? bodyMatch[1].trim() : ''
        defaultDraft.scenes.push({
          act: simpleNum++,
          title: title,
          content: body || '',
        })
      }
    }

    if (defaultDraft.scenes.length === 0) {
      const shotRegex = /^\*\*闀?[涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+)\s*[路\-]?\s*([^锛圿*)\s*锛?[^锛塢*)锛塡*\*/gm
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



