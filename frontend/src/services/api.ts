const API_BASE = '/api'

export async function fetchApi<T>(path: string, options?: RequestInit & { timeout?: number }): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeout || 120000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      let detail = response.statusText
      try {
        const errBody = await response.json()
        detail = errBody.detail || detail
      } catch {}
      throw new Error(`API error: ${response.status} ${detail}`)
    }
    return response.json()
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout (${timeoutMs / 1000}s)`)
    }
    throw err
  }
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(`Upload error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export interface PlatformInfo {
  platform: string
  is_docker: boolean
  is_wsl: boolean
  security_level: string
  process_isolation: boolean
}

export interface Template {
  id: string
  name: string
  description: string
  author: string
  is_official: boolean
  files: string[]
  signature: string
  signature_algo: string
  signature_warning: string
  imported?: boolean
  signature_valid?: boolean
  checksum_valid?: boolean
  checksum?: string
}

export interface ErrorReport {
  report_id: string
  github_url: string | null
  report_file: string
  title: string
  url_too_long: boolean
  diagnostic_text: string
  message: string
}

export interface HealthResponse {
  status: string
  version: string
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchApi('/health')
}

export async function getPlatform(): Promise<PlatformInfo> {
  return fetchApi('/platform')
}

export async function setApiKey(service: string, key: string, apiBase?: string, model?: string): Promise<{ status: string }> {
  return fetchApi('/config/api-key', {
    method: 'POST',
    body: JSON.stringify({ service, key, api_base: apiBase || '', model: model || '' }),
  })
}

export async function checkApiKey(service: string): Promise<{ configured: boolean }> {
  return fetchApi(`/config/api-key/${service}`)
}

export async function clearApiKey(service: string): Promise<{ status: string }> {
  return fetchApi(`/config/api-key/${service}`, { method: 'DELETE' })
}

export async function listTemplates(): Promise<{ templates: Template[] }> {
  return fetchApi('/templates')
}

export async function createTemplate(data: {
  name: string
  description: string
  author?: string
}): Promise<Template> {
  return fetchApi('/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteTemplate(id: string): Promise<{ status: string }> {
  return fetchApi(`/templates/${id}`, { method: 'DELETE' })
}

export interface ImportResult {
  template: Template
  signature_valid: boolean
  checksum_valid: boolean
  is_official: boolean
  warning: boolean
}

export async function importTemplate(file: File, sigFile?: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  if (sigFile) {
    formData.append('sig_file', sigFile)
  }
  const response = await fetch('/api/templates/import', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(`Import error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function generateErrorReport(data: {
  message: string
  context?: Record<string, unknown>
  user_actions?: string[]
}): Promise<ErrorReport> {
  return fetchApi('/error-reports/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export interface Project {
  id: string
  title: string
  idea: string
  style: string
  duration: number
  status: string
  script: unknown | null
  scenes: unknown[]
  created_at: string
  updated_at: string
}

export async function listProjects(): Promise<{ projects: Project[] }> {
  return fetchApi('/projects')
}

export async function getProject(id: string): Promise<Project> {
  return fetchApi(`/projects/${id}`)
}

export async function deleteProject(id: string): Promise<{ status: string }> {
  return fetchApi(`/projects/${id}`, { method: 'DELETE' })
}

export interface ChatResponse {
  type: 'question' | 'questions' | 'script' | 'storyboard' | 'key_elements' | 'narration' | 'dialogue' | 'optimized_prompt' | 'error' | 'ai_recommend' | 'text'
  content: string
  options?: Array<{ id: string; label: string; description: string }>
  questions?: Array<{ id: string; text: string; options: Array<{ label: string; description: string }> }>
  greeting?: string
  session?: Record<string, string | null>
  missing_critical_fields?: string[]
  field?: string
  label?: string
  description?: string
}

export async function chatApi(data: {
  action?: string
  api_config: { key: string; base_url: string; model: string }
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  choices?: Record<string, string>
  session?: Record<string, string | null>
  user_input?: string
  step_id?: string
  topic?: string
  field_id?: string
  modification_category?: string
  sub_option?: string
  original_script?: string
  script_content?: string
  target_duration?: number
  dialogue_type?: string
  key_elements?: string
  scene_description?: string
  original_content?: string
  modification_request?: string
  duration_str?: string
  image_api_key?: string
  image_model?: string
  image_base_url?: string
  shot_description?: string
  shot_data?: {
    shotType: string
    angle: string
    content: string
    lighting?: string
    mood?: string
  }
  character_visual?: string
  scene_visual?: string
}): Promise<ChatResponse> {
  return fetchApi('/chat', {
    method: 'POST',
    body: JSON.stringify(data),
    timeout: 180000,
  })
}

export interface ImageGenerateResponse {
  image_url: string
}

export async function generateImage(data: {
  prompt: string
  api_key: string
  model?: string
  base_url?: string
  size?: string
  ref_image_url?: string
}): Promise<ImageGenerateResponse> {
  return fetchApi('/image/generate', {
    method: 'POST',
    body: JSON.stringify(data),
    timeout: 180000,
  })
}

export interface ModelInfo {
  id: string
  owned_by: string
}

export async function listModels(apiKey: string, baseUrl: string): Promise<{ models: ModelInfo[] }> {
  return fetchApi('/models', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, base_url: baseUrl }),
  })
}

// ===== Project Management API =====

export interface ConversationState {
  phase: string
  currentSubPhase: string
  scriptContent: string
  storyboardContent: string
  keyElementsContent: string
  narrationContent: string
  dialogueContent: string
  optimizedPrompts: string
  keyElementsImages: Record<string, string[]>
  keyFramesImages: Array<{frame: number; url: string; title: string}>
  session: Record<string, string | null>
  messages: any[]
  questions: any[]
  currentQuestionIndex: number
}

export async function createProject(data: { idea: string; style?: string; duration?: number }): Promise<any> {
  return fetchApi('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function saveProjectState(projectId: string, state: ConversationState): Promise<any> {
  return fetchApi(`/projects/${projectId}/save`, {
    method: 'POST',
    body: JSON.stringify(state),
  })
}

export async function getProjectDetail(id: string): Promise<any> {
  return fetchApi(`/projects/${id}`)
}

export async function downloadProjectImages(projectId: string): Promise<{
  status: string
  keyElementsImages: Record<string, string>
  shotImages: Record<string, string>
}> {
  return fetchApi(`/projects/${projectId}/download-images`, {
    method: 'POST',
  })
}

// ===== Voice Generation API =====

export interface VoiceGenerateResponse {
  audio_url: string
  waveform: number[]
}

export async function generateVoice(data: {
  text: string
  model: string
  voice?: string
  api_key: string
  base_url: string
}): Promise<VoiceGenerateResponse> {
  return fetchApi('/voice/generate', {
    method: 'POST',
    body: JSON.stringify(data),
    timeout: 120000,
  })
}

// ===== Video Generation API =====

export interface VideoTaskResponse {
  task_id: string
  video_id?: string
  status: string
}

export interface VideoStatusResponse {
  status: string  // "pending", "completed", "failed"
  video_url?: string
  error?: string
}

export interface VideoGenerateResponse {
  video_url: string
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function generateVideo(data: {
  image_url: string
  prompt: string
  api_key: string
  model?: string
  base_url?: string
  num_frames?: number
  frame_rate?: number
  onProgress?: (elapsed: number) => void
}): Promise<VideoGenerateResponse> {
  const { onProgress, ...requestData } = data

  // 1. 创建任务
  const task = await fetchApi<VideoTaskResponse>('/video/generate', {
    method: 'POST',
    body: JSON.stringify(requestData),
    timeout: 30000,
  })

  console.log(`[Video] Task created: task_id=${task.task_id}, video_id=${task.video_id}`)

  // 2. 轮询查询状态（每5秒查一次，最多120次 = 10分钟）
  // 优先使用 video_id 查询（Agnes AI 推荐方式）
  const params = new URLSearchParams({
    api_key: data.api_key,
    base_url: data.base_url || '',
  })
  if (task.video_id) {
    params.set('video_id', task.video_id)
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(5000)
    const elapsed = (attempt + 1) * 5

    if (onProgress) onProgress(elapsed)

    try {
      const status = await fetchApi<VideoStatusResponse>(
        `/video/status/${task.task_id}?${params.toString()}`,
        { timeout: 15000 }
      )

      console.log(`[Video] Poll ${attempt + 1}/120, status: ${status.status}, elapsed: ${elapsed}s`)

      if (status.status === 'completed' && status.video_url) {
        console.log(`[Video] SUCCESS after ${elapsed}s`)
        return { video_url: status.video_url }
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Video generation failed')
      }

      // status === 'pending' -> 继续轮询
    } catch (err: any) {
      // 网络错误时继续轮询
      if (err.message?.includes('timeout') || err.message?.includes('network')) {
        console.warn(`[Video] Poll ${attempt + 1} network error, retrying...`)
        continue
      }
      throw err
    }
  }

  throw new Error('Video generation timeout (10 minutes)')
}
