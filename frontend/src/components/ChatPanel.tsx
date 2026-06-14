import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { useConversation, ConvMessage } from '../hooks/useConversation'
import WizardOptions from './WizardOptions'
import ScriptDraft from './ScriptDraft'
import StoryboardCardView from './StoryboardCardView'
import ModelSelector from './ModelSelector'
import ApiKeyModal from './ApiKeyModal'
import FileUploader from './FileUploader'
import ErrorToast from './ErrorToast'
import { STYLE_SKILLS, getSelectedStyle, setSelectedStyle, type SkillStyle } from '../config/wizardSteps'
import OptimizedPromptPanel from './OptimizedPromptPanel'
import { ArrowUpIcon } from '@heroicons/react/24/outline'
import { loadApiKeys } from '../utils/apiKeys'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const CONFIRM_WORDS = ['确认', '同意', '继续', '好的', 'ok', 'yes', 'y', '可以', '没问题', '就这样', '行', '嗯']

function isConfirmInput(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return CONFIRM_WORDS.some((w) => lower === w || lower.startsWith(w))
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        let processed: React.ReactNode = line
        processed = line.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>
          }
          return part
        })
        return (
          <span key={i}>
            {processed}
            {i < lines.length - 1 && <br />}
          </span>
        )
      })}
    </>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <span className="text-gray-400 text-sm">AI 正在思考</span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </div>
  )
}

interface ChatPanelProps {
  conversation: ReturnType<typeof useConversation>
  initialPrompt?: string
}

export default function ChatPanel({ conversation, initialPrompt }: ChatPanelProps) {
  const { phase, messages, questions, currentQuestionIndex,
          awaitingReferenceSelection, setAwaitingReferenceSelection, getMissingReferences } = conversation
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState('')
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false)
  const [errorToast, setErrorToast] = useState({ show: false, message: '', isApiError: false })
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const uploadBtnRef = useRef<HTMLButtonElement>(null)
  const [showStyleDropdown, setShowStyleDropdown] = useState(false)
  const [selectedStyle, setSelectedStyleState] = useState<SkillStyle | null>(getSelectedStyle())
  const styleDropdownRef = useRef<HTMLDivElement>(null)
  const styleButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const keys = loadApiKeys()
    setCurrentModel(keys.model || '')
  }, [])

  // Close style dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const isInWrapper = styleDropdownRef.current?.contains(target)
      const isInPortal = (target as HTMLElement).closest?.('[data-style-dropdown]')
      if (!isInWrapper && !isInPortal) {
        setShowStyleDropdown(false)
      }
    }
    if (showStyleDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStyleDropdown])

  const handleStyleSelect = useCallback((style: SkillStyle) => {
    setSelectedStyle(style)
    setSelectedStyleState(style)
    setShowStyleDropdown(false)
  }, [])

  const handleStyleToggle = useCallback(() => {
    if (!showStyleDropdown) {
      const rect = styleButtonRef.current?.getBoundingClientRect()
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        if (spaceBelow >= 300 || spaceBelow > spaceAbove) {
          setDropdownPos({ top: rect.bottom + 4, left: rect.left })
        } else {
          setDropdownPos({ top: rect.top - 304, left: rect.left })
        }
      }
    }
    setShowStyleDropdown(!showStyleDropdown)
  }, [showStyleDropdown])

  // Detect API errors and show toast
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.status === 'error' && lastMsg.role === 'assistant') {
      const errorMsg = lastMsg.content || ''
      const isApi = errorMsg.includes('502') || errorMsg.includes('API') || errorMsg.includes('401') ||
                    errorMsg.includes('连接') || errorMsg.includes('超时') || errorMsg.includes('getaddrinfo') ||
                    errorMsg.includes('fetch') || errorMsg.includes('network')
      setErrorToast({
        show: true,
        message: errorMsg.replace('获取选项失败：', '').replace('生成剧本失败：', '').replace('生成分镜失败：', ''),
        isApiError: isApi,
      })
    }
  }, [messages])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const hasWelcomed = useRef(false)

  useEffect(() => {
    if (messages.length === 0 && phase === 'idle' && !conversation.awaitingScriptDecision && !hasWelcomed.current) {
      hasWelcomed.current = true
      conversation.initWorkspaceWithScriptPrompt()
    }
  }, [messages.length, phase, conversation])

  const isBusy = phase === 'generating_script' || phase === 'regenerating_script' ||
    phase === 'generating_storyboard' || phase === 'generating_key_elements' ||
    phase === 'generating_narration' || phase === 'generating_dialogue'

  console.log('[ChatPanel] isBusy:', isBusy, 'phase:', phase, 'subPhase:', conversation.currentSubPhase)

  // Auto-detect when all required references are selected
  useEffect(() => {
    if (!awaitingReferenceSelection) return
    const missing = getMissingReferences()
    if (missing.length === 0) {
      setAwaitingReferenceSelection(false)
      conversation.addMessage({
        role: 'assistant',
        content: '✅ 所有主参考图已选择完成！\n\n点击下方按钮开始生成角色/场景图片：',
        status: 'done',
        options: [
          { id: '__confirm__', label: '🎨 开始生成角色/场景图片', description: '生成关键视觉元素的概念图' },
        ],
      })
    }
  }, [conversation.selectedReferenceImages, awaitingReferenceSelection, getMissingReferences, setAwaitingReferenceSelection, conversation])

  const handleSend = useCallback(() => {
    if (!input.trim() || isBusy) return

    // Script decision phase
    if (conversation.awaitingScriptDecision) {
      const text = input.trim()
      const lower = text.toLowerCase()
      if (text.length > 200) {
        conversation.confirmHasScript(true, text)
      } else if (lower.includes('我没有剧本') || lower.includes('无剧本') || lower.includes('没有剧本') ||
          lower.includes('无') || lower.includes('no') || lower === 'n') {
        conversation.confirmHasScript(false)
      } else if (lower.includes('有') || lower.includes('yes') || lower === 'y') {
        conversation.confirmHasScript(true)
      } else {
        conversation.addMessage({
          role: 'assistant',
          content: '请回复"有"或"无"，或直接粘贴剧本内容。',
          status: 'done',
        })
      }
      setInput('')
      return
    }

    // Wizard phase
    if (phase === 'wizard' && questions.length > 0 && currentQuestionIndex < questions.length) {
      const currentQ = questions[currentQuestionIndex]
      conversation.selectOption(currentQ.id, input.trim(), input.trim())
      setInput('')
      return
    }

    // Post-script sub-phase: check confirm vs modify
    const subPhase = conversation.currentSubPhase
    if (subPhase !== 'none') {
      const text = input.trim()
      const confirm = isConfirmInput(text)

      if (subPhase === 'key_elements') {
        if (confirm) conversation.confirmKeyElements()
        else conversation.modifyKeyElements(text)
        setInput('')
        return
      }
      if (subPhase === 'narration') {
        if (confirm) conversation.confirmNarration()
        else conversation.modifyNarration(text)
        setInput('')
        return
      }
      if (subPhase === 'dialogue') {
        if (confirm) conversation.confirmDialogue()
        else conversation.modifyDialogue(text)
        setInput('')
        return
      }
      if (subPhase === 'storyboard') {
        if (confirm) conversation.confirmStoryboard()
        else conversation.modifyStoryboard(text)
        setInput('')
        return
      }
      if (subPhase === 'image_confirm') {
        const lower = text.toLowerCase()
        if (lower.includes('满意') || lower.includes('继续')) {
          conversation.confirmSatisfied()
        } else if (confirm || lower.includes('生成图片') || lower.includes('开始生成') || lower.includes('主图已选')) {
          if (awaitingReferenceSelection) {
            const missing = getMissingReferences()
            if (missing.length > 0) {
              conversation.addMessage({
                role: 'assistant',
                content: `还有以下角色/场景未选择主图：\n${missing.map(k => {
                  const name = k.replace(/^char_|^scene_/, '')
                  return '• ' + name
                }).join('\n')}\n\n请先选择主图，或输入"跳过"使用默认图片。`,
                status: 'done',
              })
              setInput('')
              return
            }
            setAwaitingReferenceSelection(false)
          }
          const hasImages = Object.keys(conversation.keyElementsImages).length > 0
          if (hasImages) {
            conversation.confirmImageGeneration()
          } else {
            conversation.generateKeyElementsImages()
          }
        } else if (lower.includes('跳过') || lower.includes('默认')) {
          conversation.skipReferenceSelection()
          conversation.confirmImageGeneration()
        } else if (lower.includes('重新生成') || lower.includes('重新全部')) {
          conversation.regenerateAllKeyElements()
        }
        setInput('')
        return
      }
    }

    // Script review phase: confirm or free-form modify
    if (phase === 'script_review') {
      const text = input.trim()
      if (isConfirmInput(text)) {
        conversation.confirmScript()
      } else {
        conversation.modifyScript(text)
      }
      setInput('')
      return
    }

    // Default: start wizard
    conversation.startWizard(input.trim())
    setInput('')
  }, [input, isBusy, phase, questions, currentQuestionIndex, conversation, setInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleModelSelect = (model: string) => {
    setCurrentModel(model)
    setModelOpen(false)
  }

  const handleApiKeySaved = () => {
    const keys = loadApiKeys()
    setCurrentModel(keys.model || '')
  }

  const getModelDisplayName = () => {
    if (!currentModel) return '模型'
    if (currentModel.length > 12) {
      const parts = currentModel.split('/')
      return parts[parts.length - 1]
    }
    return currentModel
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p className="text-sm">描述你想创作的故事</p>
            </div>
          </div>
        )}

        {messages.map((msg: ConvMessage) => {
          const isUser = msg.role === 'user'
          const hasOptions = msg.options && msg.options.length > 0 && (
            phase === 'idle' || phase === 'wizard' || phase === 'voice_selection' ||
            phase === 'key_elements_review' || phase === 'narration_review' ||
            phase === 'dialogue_review' || phase === 'storyboard_review'
          )
          const isError = msg.status === 'error'
          const isGenerating = msg.status === 'generating' && !msg.content

          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[95%] space-y-2">
                {/* AI Logo */}
                {!isUser && !isGenerating && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">M</span>
                    </div>
                    <span className="text-xs text-gray-500">MangaZap</span>
                  </div>
                )}

                {/* AI generating indicator */}
                {isGenerating && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">M</span>
                      </div>
                      <span className="text-xs text-gray-500">MangaZap</span>
                    </div>
                    <div
                      className="rounded-xl px-4 py-3 text-gray-200 border border-white/[0.06] ml-8"
                      style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
                    >
                      <TypingIndicator />
                    </div>
                  </div>
                )}

                {/* Unified message content box */}
                {!isUser && !isGenerating && msg.content && !msg.scriptDraft && (
                  <div className="ml-8">
                    {msg.storyboardContent ? (
                      <div>
                        <StoryboardCardView content={msg.storyboardContent} />
                        {hasOptions && (
                          <div className="mt-3">
                            <WizardOptions
                              options={msg.options!}
                              onSubmit={(value) => {
                                if (value === '__confirm__') {
                                  const subPhase = conversation.currentSubPhase
                                  if (subPhase === 'storyboard') conversation.confirmStoryboard()
                                  else if (subPhase === 'image_confirm') {
                                    const hasImages = Object.keys(conversation.keyElementsImages).length > 0
                                    if (hasImages) {
                                      conversation.confirmImageGeneration()
                                    } else {
                                      conversation.generateKeyElementsImages()
                                    }
                                  }
                                } else if (value === '__skip__') {
                                  conversation.skipReferenceSelection()
                                  conversation.confirmImageGeneration()
                                } else if (value === '__regenerate__') {
                                  conversation.regenerateAllKeyElements()
                                } else if (value === '__satisfied__') {
                                  conversation.confirmSatisfied()
                                }
                              }}
                            />
                          </div>
                        )}
                        <div className="text-xs mt-2 text-gray-600">
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="rounded-xl px-4 py-3 border border-white/[0.06]"
                        style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
                      >
                        {msg.keyElementsContent ? (
                          <div className="text-sm text-gray-300 leading-relaxed">
                            <ReactMarkdown
                              components={{
                                img: () => null,
                                h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-3">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-md font-semibold text-indigo-300 mt-4 mb-2">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-medium text-gray-200 mt-2 mb-1">{children}</h3>,
                                p: ({ children }) => <p className="text-sm text-gray-300 leading-relaxed mb-2">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside text-sm text-gray-300 space-y-1 mb-2">{children}</ul>,
                                li: ({ children }) => <li>{children}</li>,
                              }}
                            >
                              {msg.keyElementsContent}
                            </ReactMarkdown>
                          </div>
                        ) : msg.narrationContent ? (
                          <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                            <SimpleMarkdown text={msg.narrationContent} />
                          </div>
                        ) : msg.dialogueContent ? (
                          <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                            <SimpleMarkdown text={msg.dialogueContent} />
                          </div>
                        ) : (
                          <div className="text-sm leading-relaxed text-gray-300">
                            <SimpleMarkdown text={msg.content} />
                          </div>
                        )}

                        {/* Confirm button at bottom of content */}
                        {hasOptions && (
                          <div className="mt-3">
                            <WizardOptions
                            options={msg.options!}
                            onSubmit={(value, label) => {
                              if (value === '__confirm__') {
                                const subPhase = conversation.currentSubPhase
                                if (subPhase === 'key_elements') conversation.confirmKeyElements()
                                else if (subPhase === 'narration') conversation.confirmNarration()
                                else if (subPhase === 'dialogue') conversation.confirmDialogue()
                                else if (subPhase === 'storyboard') conversation.confirmStoryboard()
                                else if (subPhase === 'image_confirm') {
                                  const hasImages = Object.keys(conversation.keyElementsImages).length > 0
                                  if (hasImages) {
                                    conversation.confirmImageGeneration()
                                  } else {
                                    conversation.generateKeyElementsImages()
                                  }
                                }
                              } else if (value === '__skip__') {
                                conversation.skipReferenceSelection()
                                conversation.confirmImageGeneration()
                              } else if (value === '__regenerate__') {
                                conversation.regenerateAllKeyElements()
                              } else if (value === '__satisfied__') {
                                conversation.confirmSatisfied()
                              } else if (value === '__has_script__') {
                                conversation.confirmHasScript(true)
                              } else if (value === '__no_script__') {
                                conversation.confirmHasScript(false)
                              } else if (phase === 'wizard') {
                                const currentQ = questions[currentQuestionIndex]
                                if (currentQ) {
                                  conversation.selectOption(currentQ.id, value, label)
                                }
                              } else if (phase === 'voice_selection') {
                                conversation.selectVoice(value)
                              }
                            }}
                            onAiRecommend={() => {
                              if (phase === 'wizard') {
                                const currentQ = questions[currentQuestionIndex]
                                if (currentQ) {
                                  conversation.aiRecommend(currentQ.id)
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {/* Single timestamp at bottom */}
                      <div className="text-xs mt-2 text-gray-600">
                        {formatTime(msg.timestamp)}
                      </div>

                      {/* Action buttons */}
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="flex gap-2 mt-3">
                          {msg.actions.map((action) => (
                            <button
                              key={action.id}
                              onClick={() => {
                                conversation.executeAction(action.id)
                                // 点击后移除按钮防重复
                                conversation.setMessages(prev => prev.map(m => 
                                  m.id === msg.id ? { ...m, actions: [] } : m
                                ))
                              }}
                              disabled={conversation.generatingVideo}
                              className="flex-1 px-3 py-2.5 rounded-lg text-center transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                            >
                              <span className="block text-sm font-semibold text-white">
                                {conversation.generatingVideo ? '生成中...' : action.label}
                              </span>
                              <span className="block text-xs text-white/80">{action.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                )}

                {/* Script draft */}
                {msg.scriptDraft && !isUser && (
                  <div className="ml-8">
                    <div
                      className="rounded-xl px-4 py-3 border border-white/[0.06]"
                      style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
                    >
                      <ScriptDraft
                        script={msg.scriptDraft}
                        rawContent={msg.content}
                        onConfirm={conversation.confirmScript}
                        onRequestModify={conversation.requestModification}
                        showModCategories={msg.showModCategories || false}
                        onSelectCategory={conversation.selectModCategory}
                        onSubOption={conversation.selectModSubOption}
                        selectedCategory={msg.selectedCategory}
                        isBusy={isBusy}
                      />
                      <div className="text-xs mt-2 text-gray-600">
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error message */}
                {isError && !isUser && (
                  <div
                    className="rounded-xl px-4 py-3 text-red-200 border border-red-800/50"
                    style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(153,27,27,0.15) 100%)' }}
                  >
                    <div className="text-sm leading-relaxed">
                      <SimpleMarkdown text={msg.content} />
                    </div>
                    {msg.retryable && (
                      <button
                        onClick={conversation.retry}
                        className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        🔄 重试
                      </button>
                    )}
                    <div className="text-xs mt-2 text-red-400/50">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                )}

                {/* User message - no timestamp */}
                {isUser && (
                  <div
                    className="rounded-xl px-4 py-3 text-white"
                    style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.6) 0%, rgba(170,136,255,0.6) 100%)' }}
                  >
                    <div className="text-sm leading-relaxed">
                      <SimpleMarkdown text={msg.content} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3">
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              console.log('[ChatPanel] textarea onChange:', e.target.value)
              setInput(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => console.log('[ChatPanel] textarea focused')}
            onBlur={() => console.log('[ChatPanel] textarea blurred')}
            rows={2}
            placeholder={
              phase === 'idle'
                ? '从一个想法或故事开始...'
                : phase === 'wizard'
                ? '选择上方选项或输入自定义内容...'
                : isBusy
                ? 'AI 生成中...'
                : conversation.currentSubPhase === 'key_elements'
                ? '确认或输入修改意见...'
                : conversation.currentSubPhase === 'narration'
                ? '确认或输入修改意见...'
                : conversation.currentSubPhase === 'dialogue'
                ? '确认或输入修改意见...'
                : conversation.currentSubPhase === 'storyboard'
                ? '确认或输入修改意见...'
                : conversation.currentSubPhase === 'image_confirm'
                ? '点击按钮生成起始帧图片...'
                : phase === 'script_review'
                ? '确认剧本或输入修改意见...'
                : '输入消息...'
            }
            disabled={isBusy}
            className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none resize-none disabled:opacity-50"
          />

          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-2">
              <FileUploader
                onUpload={() => {}}
                triggerRef={uploadBtnRef}
                onTextFileContent={
                  conversation.awaitingScriptDecision
                    ? (content) => conversation.confirmHasScript(true, content)
                    : undefined
                }
              />

              <div className="relative">
                <button
                  ref={modelBtnRef}
                  onClick={() => setModelOpen(!modelOpen)}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-all duration-200 active:scale-95 ${
                    currentModel
                      ? 'text-[#00aaff]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  style={{
                    background: currentModel
                      ? 'linear-gradient(135deg, rgba(0,170,255,0.12) 0%, rgba(170,136,255,0.12) 100%)'
                      : 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
                    borderColor: currentModel ? 'rgba(0,170,255,0.2)' : 'rgba(255,255,255,0.06)',
                  }}
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

              {/* Style Skill Selector */}
              <div ref={styleDropdownRef}>
                <button
                  ref={styleButtonRef}
                  onClick={handleStyleToggle}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white border transition-all duration-200 active:scale-95 flex items-center gap-1"
                  style={{
                    background: selectedStyle
                      ? 'linear-gradient(135deg, rgba(0,170,255,0.15) 0%, rgba(170,136,255,0.15) 100%)'
                      : 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
                    borderColor: selectedStyle ? 'rgba(0,170,255,0.3)' : 'rgba(255,255,255,0.06)',
                    color: selectedStyle ? '#00aaff' : undefined,
                  }}
                >
                  Skill
                  {selectedStyle && <span className="text-[10px] opacity-70">·{selectedStyle.name}</span>}
                </button>
                {showStyleDropdown && dropdownPos && createPortal(
                  <div
                    data-style-dropdown
                    className="fixed w-56 max-h-72 overflow-y-auto rounded-xl border border-white/[0.06] shadow-xl z-[9999]"
                    style={{
                      background: 'linear-gradient(145deg, #141418 0%, #0f0f14 100%)',
                      top: dropdownPos.top,
                      left: Math.min(dropdownPos.left, window.innerWidth - 240),
                    }}
                  >
                    <div className="p-1.5">
                      {STYLE_SKILLS.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => handleStyleSelect(style)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-[11px] transition-colors ${
                            selectedStyle?.id === style.id
                              ? 'bg-[#00aaff]/10 text-[#00aaff]'
                              : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="font-medium">{style.name}</div>
                          <div className="text-[10px] opacity-60 mt-0.5">{style.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body
                )}
              </div>
              <button
                className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white border transition-all duration-200 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                元素
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-[#00aaff] to-[#aa88ff] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all shrink-0"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <ApiKeyModal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onSaved={handleApiKeySaved}
      />

      <ErrorToast
        show={errorToast.show}
        message={errorToast.message}
        isApiError={errorToast.isApiError}
        onClose={() => setErrorToast({ show: false, message: '', isApiError: false })}
        onConfigureApi={() => {
          setErrorToast({ show: false, message: '', isApiError: false })
          setApiKeyModalOpen(true)
        }}
      />
    </div>
  )
}
