import { useState, useRef, useCallback } from 'react'
import { loadApiKeys } from '../utils/apiKeys'

export interface GenMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  status: 'sending' | 'generating' | 'done' | 'error'
  videoUrl?: string
  pendingConfirm?: { stepName: string; stepId: string; taskId: string }
}

export interface ProgressEvent {
  step: string
  message: string
  progress: number
  project_id?: string
  video_url?: string
  step_name?: string
  step_id?: string
  task_id?: string
}

export type GenState = 'idle' | 'generating' | 'waiting_confirm' | 'done' | 'error'

function formatStepMessage(event: ProgressEvent): { content: string; videoUrl?: string } {
  switch (event.step) {
    case 'init':
      return { content: `项目已创建: ${event.message}` }
    case 'script':
      return { content: `正在生成剧本... ${event.message}` }
    case 'storyboard':
      return { content: `正在构建分镜... ${event.message}` }
    case 'tts':
      return { content: `正在生成语音... ${event.message}` }
    case 'image':
      return { content: `正在生成画面... ${event.message}` }
    case 'video':
      return { content: `正在合成视频... ${event.message}` }
    case 'done':
      return {
        content: event.video_url
          ? `视频生成完成！\n\n[点击预览视频](${event.video_url})`
          : '视频生成完成！',
        videoUrl: event.video_url,
      }
    case 'error':
      return { content: `生成失败: ${event.message}` }
    default:
      return { content: event.message }
  }
}

export function useGeneration() {
  const [state, setState] = useState<GenState>('idle')
  const [progress, setProgress] = useState(0)
  const [messages, setMessages] = useState<GenMessage[]>([])
  const [pendingConfirm, setPendingConfirm] = useState<{ stepName: string; stepId: string; taskId: string } | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const currentAssistantIdRef = useRef<string | null>(null)

  const readSSEStream = useCallback(async (response: Response, assistantMsgId: string) => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event: ProgressEvent = JSON.parse(line.slice(6))

          if (event.step === 'need_confirm') {
            const confirmInfo = {
              stepName: event.step_name || '确认',
              stepId: event.step_id || '',
              taskId: event.task_id || '',
            }
            setPendingConfirm(confirmInfo)
            setState('waiting_confirm')
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `已完成剧本、分镜和语音生成。`,
                      status: 'done' as const,
                      pendingConfirm: confirmInfo,
                    }
                  : m
              )
            )
            return
          }

          if (event.progress > 0) setProgress(event.progress)
          if (event.project_id) setCurrentProjectId(event.project_id)

          const { content, videoUrl } = formatStepMessage(event)
          const msgStatus = event.step === 'done' ? 'done' : event.step === 'error' ? 'error' : 'generating'

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content, status: msgStatus, videoUrl, pendingConfirm: undefined }
                : m
            )
          )

          if (event.step === 'error') {
            setState('error')
            setError(event.message)
            return
          }

          if (event.step === 'done') {
            setState('done')
            return
          }
        } catch {
          // skip malformed events
        }
      }
    }
  }, [])

  const startGeneration = useCallback(
    async (idea: string, style: string, duration: number, autoConfirm: boolean) => {
      if (!idea.trim()) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const userMsg: GenMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: idea.trim(),
        timestamp: new Date().toISOString(),
        status: 'done',
      }

      const assistantMsg: GenMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'generating',
      }

      currentAssistantIdRef.current = assistantMsg.id
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setState('generating')
      setProgress(0)
    setError(null)
    setPendingConfirm(undefined)

    const apiKeys = loadApiKeys()

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idea: idea.trim(),
            style,
            duration,
            api_keys: { text: apiKeys.text || '', image: apiKeys.image || '' },
            auto_confirm: autoConfirm,
          }),
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`Server error: ${response.status}`)

        await readSSEStream(response, assistantMsg.id)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `错误: ${(err as Error).message}`, status: 'error' }
              : m
          )
        )
        setState('error')
        setError((err as Error).message)
      }
    },
    [readSSEStream]
  )

  const confirmStep = useCallback(async () => {
    if (!pendingConfirm || !currentAssistantIdRef.current) return

    const assistantMsgId = currentAssistantIdRef.current
    const { taskId, stepId } = pendingConfirm

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPendingConfirm(undefined)
    setState('generating')
    setError(null)

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, content: '已确认，继续生成...', status: 'generating' as const, pendingConfirm: undefined }
          : m
      )
    )

    try {
      const response = await fetch('/api/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, step_id: stepId }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`Confirm error: ${response.status}`)

      await readSSEStream(response, assistantMsgId)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `错误: ${(err as Error).message}`, status: 'error' }
            : m
        )
      )
      setState('error')
      setError((err as Error).message)
    }
  }, [pendingConfirm, readSSEStream])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState('idle')
    setPendingConfirm(undefined)
    if (currentAssistantIdRef.current) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === currentAssistantIdRef.current && m.status === 'generating'
            ? { ...m, content: '已取消', status: 'error' }
            : m
        )
      )
    }
  }, [])

  return {
    state,
    progress,
    messages,
    setMessages,
    pendingConfirm,
    error,
    currentProjectId,
    startGeneration,
    confirmStep,
    cancel,
  }
}
