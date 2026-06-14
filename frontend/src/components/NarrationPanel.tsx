import { useState } from 'react'
import { PencilIcon } from '@heroicons/react/24/outline'

interface NarrationPanelProps {
  content: string
  onEdit: (content: string) => void
}

export default function NarrationPanel({ content, onEdit }: NarrationPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)

  const handleSave = () => {
    onEdit(editContent)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditContent(content)
    setIsEditing(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-300">旁白语音</h4>
        <button
          onClick={() => isEditing ? handleCancel() : setIsEditing(true)}
          className="p-1.5 rounded-lg transition-colors"
          style={{
            background: isEditing
              ? 'linear-gradient(135deg, rgba(220,38,38,0.2) 0%, rgba(153,27,27,0.2) 100%)'
              : 'rgba(255,255,255,0.04)',
          }}
        >
          {isEditing ? (
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <PencilIcon className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={10}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-[#00aaff]/30 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)', color: '#00aaff' }}
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-400 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
          {content || '暂无旁白'}
        </div>
      )}
    </div>
  )
}
