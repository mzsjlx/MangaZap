import { useState } from 'react'
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  BugAntIcon,
} from '@heroicons/react/24/outline'
import { generateErrorReport, type ErrorReport } from '../services/api'

interface ErrorReportButtonProps {
  error?: Error | null
  errorMessage?: string
  userActions?: string[]
  context?: Record<string, unknown>
  className?: string
}

export default function ErrorReportButton({
  error,
  errorMessage,
  userActions = [],
  context = {},
  className = '',
}: ErrorReportButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<ErrorReport | null>(null)
  const [copied, setCopied] = useState(false)

  const message = error?.message || errorMessage || 'Unknown error'

  const handleGenerate = async () => {
    setIsGenerating(true)
    setResult(null)
    try {
      const report = await generateErrorReport({
        message,
        context: {
          ...context,
          stack: error?.stack,
          name: error?.name,
        },
        user_actions: userActions,
      })
      setResult(report)

      if (!report.url_too_long && report.github_url) {
        window.open(report.github_url, '_blank')
      }
    } catch (err) {
      console.error('Failed to generate error report:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!result?.diagnostic_text) return
    try {
      await navigator.clipboard.writeText(result.diagnostic_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = result.diagnostic_text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (!result?.report_id) return
    const link = document.createElement('a')
    link.href = `/api/error-reports/${result.report_id}/download`
    link.download = result.report_file
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
      >
        <BugAntIcon className="h-4 w-4" />
        {isGenerating ? 'Generating...' : 'Report Issue'}
      </button>

      {result && !result.url_too_long && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircleIcon className="h-4 w-4" />
          <span>Opening GitHub Issue...</span>
        </div>
      )}

      {result && result.url_too_long && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-sm text-yellow-300 font-medium">
                  Automatic redirect failed
                </p>
                <p className="text-xs text-yellow-200/70 mt-1">
                  Diagnostic data is too long to include in a URL.
                  Please copy the information below and create the issue manually.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 bg-yellow-600/80 hover:bg-yellow-500 text-white font-medium py-1.5 px-3 rounded-md transition-colors text-xs"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy diagnostics'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-1.5 px-3 rounded-md transition-colors text-xs"
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                  Download report
                </button>
                <a
                  href={`https://github.com/mangazap/mangazap/issues/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Open GitHub Issues
                </a>
              </div>

              <div className="bg-gray-900/50 rounded p-2 max-h-32 overflow-y-auto">
                <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">
                  {result.diagnostic_text}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
