import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react'

interface ImageConfirmModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ImageConfirmModal({ open, onConfirm, onCancel }: ImageConfirmModalProps) {
  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className="rounded-2xl border border-white/[0.06] p-8 max-w-md w-full shadow-2xl shadow-black/60"
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.1) 0%, rgba(170,136,255,0.1) 100%)' }}
            >
              <svg className="w-8 h-8 text-[#00aaff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">确认生成图片</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              AI 将优化关键元素的提示词，以便后续生成图片。优化后的提示词将用于指导图片生成 API。
            </p>
          </div>

          <div
            className="rounded-xl p-4 mb-6 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <p className="text-xs text-gray-500 mb-2">优化内容包括：</p>
            <ul className="space-y-1 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00aaff]" />
                场景描述 → 图片生成提示词
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#aa88ff]" />
                人物形象 → 角色描述词
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00aaff]" />
                视觉风格 → 风格关键词
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 text-sm text-gray-400 rounded-xl transition-colors border border-white/[0.06]"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 text-sm font-medium text-white rounded-xl transition-all"
              style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.3) 0%, rgba(170,136,255,0.3) 100%)' }}
            >
              确认优化
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
