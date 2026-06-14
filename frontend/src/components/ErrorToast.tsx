import { useEffect } from 'react'

interface ErrorToastProps {
  message: string
  show: boolean
  onClose: () => void
  onConfigureApi?: () => void
  isApiError?: boolean
}

export default function ErrorToast({ message, show, onClose, onConfigureApi, isApiError }: ErrorToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose()
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] animate-in fade-in slide-in-from-top-2">
      <div
        className="rounded-xl border border-red-500/20 px-5 py-4 shadow-2xl shadow-black/50 max-w-md"
        style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(153,27,27,0.15) 100%)' }}
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300 mb-1">
              {isApiError ? 'API 请求失败' : '出错了'}
            </p>
            <p className="text-xs text-red-400/80 leading-relaxed">{message}</p>
            {isApiError && onConfigureApi && (
              <button
                onClick={onConfigureApi}
                className="mt-3 px-4 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[#00aaff] to-[#aa88ff] text-white hover:opacity-90 transition-opacity"
              >
                重新配置 API
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
