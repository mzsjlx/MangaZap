import { useState } from 'react'

interface OptimizedPromptPanelProps {
  content: string
  isEditing: boolean
  onEdit: () => void
  onSave: (content: string) => void
  onConfirm: (finalPrompts: string) => void
}

export default function OptimizedPromptPanel({ content, isEditing, onEdit, onSave, onConfirm }: OptimizedPromptPanelProps) {
  const [editContent, setEditContent] = useState(content)

  const handleSave = () => {
    onSave(editContent)
  }

  const handleCancel = () => {
    setEditContent(content)
  }

  return (
    <div
      className="rounded-xl border border-white/[0.06] overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]" style={{ background: 'linear-gradient(90deg, #101828 0%, #0c1020 100%)' }}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#00aaff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-sm font-medium text-gray-200">AI 优化后的提示词</span>
        </div>
      </div>

      <div className="p-4">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={12}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-[#00aaff]/30 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)', color: '#00aaff' }}
              >
                保存修改
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-400 rounded-lg transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-auto">
            {content || '暂无优化内容'}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="flex gap-3 px-4 pb-4">
          <button
            onClick={onEdit}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#9ca3af' }}
          >
            ✏️ 修改提示词
          </button>
          <button
            onClick={() => onConfirm(content)}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.3) 0%, rgba(170,136,255,0.3) 100%)' }}
          >
            ✅ 确认生成图片
          </button>
        </div>
      )}
    </div>
  )
}
