import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayIcon, StopIcon, QuestionMarkCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface ProgressEvent {
  step: string
  message: string
  progress: number
  project_id?: string
}

const SHORTCUTS = [
  { keys: ['Ctrl', 'Shift', 'G'], description: 'Start generation' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close dialogs' },
]

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-100">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.description} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <span className="text-sm text-gray-300">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-1 text-xs font-mono bg-gray-800 border border-gray-700 rounded text-gray-300"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-500">Press ? to toggle this dialog</p>
      </div>
    </div>
  )
}

export default function CreatePage() {
  const navigate = useNavigate()
  const [idea, setIdea] = useState('')
  const [style, setStyle] = useState('anime')
  const [duration, setDuration] = useState(30)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [currentProgress, setCurrentProgress] = useState(0)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!idea.trim() || isGenerating) return
    setIsGenerating(true)
    setProgress([])
    setCurrentProgress(0)
    setProjectId(null)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim(), style, duration }),
      })

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

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
          if (line.startsWith('data: ')) {
            try {
              const event: ProgressEvent = JSON.parse(line.slice(6))
              setProgress((prev) => [...prev, event])
              setCurrentProgress(event.progress)

              if (event.project_id) {
                setProjectId(event.project_id)
              }

              if (event.step === 'done' && event.project_id) {
                setTimeout(() => navigate(`/project/${event.project_id}`), 1500)
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setProgress((prev) => [
        ...prev,
        { step: 'error', message: `Error: ${err}`, progress: 0 },
      ])
    } finally {
      setIsGenerating(false)
    }
  }, [idea, style, duration, isGenerating, navigate])

  const handleStop = () => {
    setIsGenerating(false)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'

      if (e.key === '?' && !isInput) {
        e.preventDefault()
        setShowHelp((prev) => !prev)
        return
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        if (!isGenerating && idea.trim()) {
          handleGenerate()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleGenerate, isGenerating, idea])

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Create</h2>
          <p className="mt-1 text-sm text-gray-400">
            Describe your manga idea and generate a video
          </p>
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="text-gray-400 hover:text-gray-200 transition-colors"
          title="Keyboard shortcuts (?)"
        >
          <QuestionMarkCircleIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Your Idea
          </label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="A brave samurai discovers a hidden portal to a cyberpunk world..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="anime">Anime</option>
              <option value="manga">Manga</option>
              <option value="realistic">Realistic</option>
              <option value="chibi">Chibi</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Duration: {duration}s
            </label>
            <input
              type="range"
              min={10}
              max={120}
              step={10}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !idea.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-md transition-colors"
          >
            <PlayIcon className="h-5 w-5" />
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
          {isGenerating && (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium py-3 px-4 rounded-md transition-colors"
            >
              <StopIcon className="h-5 w-5" />
              Stop
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Tip: Press <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">?</kbd> for keyboard shortcuts
        </p>
      </div>

      {(isGenerating || progress.length > 0) && (
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-200">Progress</h3>
            {projectId && (
              <span className="text-xs text-gray-500 font-mono">ID: {projectId}</span>
            )}
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {progress.map((event, i) => (
              <div
                key={i}
                className={`text-sm p-2 rounded ${
                  event.step === 'error'
                    ? 'bg-red-900/50 text-red-300'
                    : event.step === 'done'
                    ? 'bg-green-900/50 text-green-300'
                    : 'bg-gray-800 text-gray-300'
                }`}
              >
                <span className="text-gray-500 font-mono mr-2">[{event.step}]</span>
                {event.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <ShortcutsModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  )
}
