import { useState } from 'react'
import { PencilIcon } from '@heroicons/react/24/outline'

interface KeyElementsPanelProps {
  content: string
  onEdit: (content: string) => void
}

export default function KeyElementsPanel({ content, onEdit }: KeyElementsPanelProps) {
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const parseSections = (text: string) => {
    const sections: { title: string; content: string }[] = []
    const lines = text.split('\n')
    let currentSection = ''
    let currentContent = ''

    for (const line of lines) {
      if (line.startsWith('**') && line.endsWith('**') && line.includes('角色') || line.includes('场景') || line.includes('视觉') || line.includes('形象') || line.includes('设定') || line.includes('风格')) {
        if (currentSection) {
          sections.push({ title: currentSection, content: currentContent.trim() })
        }
        currentSection = line.replace(/\*\*/g, '').trim()
        currentContent = ''
      } else {
        currentContent += line + '\n'
      }
    }
    if (currentSection) {
      sections.push({ title: currentSection, content: currentContent.trim() })
    }

    return sections.length > 0 ? sections : [{ title: '关键元素', content: text }]
  }

  const sections = parseSections(content)

  const handleEdit = (title: string, sectionContent: string) => {
    setEditingSection(title)
    setEditContent(sectionContent)
  }

  const handleSave = () => {
    if (editingSection) {
      const newSections = sections.map(s =>
        s.title === editingSection ? { ...s, content: editContent } : s
      )
      const newContent = newSections.map(s => `**${s.title}**\n${s.content}`).join('\n\n')
      onEdit(newContent)
    }
    setEditingSection(null)
    setEditContent('')
  }

  const handleCancel = () => {
    setEditingSection(null)
    setEditContent('')
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-300">关键元素</h4>
      
      {sections.map((section, index) => (
        <div
          key={index}
          className="rounded-lg border border-white/[0.06] p-4 group relative"
          style={{ background: 'linear-gradient(135deg, #101828 0%, #0c1020 100%)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-medium text-gray-200">{section.title}</h5>
            <button
              onClick={() => editingSection === section.title ? handleCancel() : handleEdit(section.title, section.content)}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: editingSection === section.title
                  ? 'linear-gradient(135deg, rgba(220,38,38,0.2) 0%, rgba(153,27,27,0.2) 100%)'
                  : 'rgba(255,255,255,0.04)',
              }}
            >
              {editingSection === section.title ? (
                <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <PencilIcon className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          </div>

          {editingSection === section.title ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#00aaff]/30 resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                  style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)', color: '#00aaff' }}
                >
                  保存
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-400 rounded-lg transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {section.content || '暂无内容，请编辑'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
