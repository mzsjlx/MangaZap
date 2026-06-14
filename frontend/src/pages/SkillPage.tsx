import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { STYLE_SKILLS, getSelectedStyle, setSelectedStyle, type SkillStyle } from '../config/wizardSteps'

export default function SkillPage() {
  const [selected, setSelected] = useState<SkillStyle | null>(getSelectedStyle())
  const navigate = useNavigate()

  const handleSelect = useCallback((style: SkillStyle) => {
    setSelectedStyle(style)
    setSelected(style)
  }, [])

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">画风选择</h1>
          <p className="text-sm text-gray-400">
            选择一种画风风格，后续生成图片时将自动应用该风格。
          </p>
          {selected && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00aaff]/10 border border-[#00aaff]/20">
              <span className="text-xs text-[#00aaff]">当前风格：</span>
              <span className="text-sm font-medium text-[#00aaff]">{selected.name}</span>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {STYLE_SKILLS.map((style) => (
            <button
              key={style.id}
              onClick={() => handleSelect(style)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
                selected?.id === style.id
                  ? 'border-[#00aaff]/40 bg-[#00aaff]/10 shadow-lg shadow-[#00aaff]/5'
                  : 'border-white/[0.06] bg-[#111111] hover:border-[#00aaff]/20 hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">
                  {selected?.id === style.id ? '✓' : '🎨'}
                </span>
                <h3 className={`text-sm font-semibold ${
                  selected?.id === style.id ? 'text-[#00aaff]' : 'text-gray-200'
                }`}>
                  {style.name}
                </h3>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{style.description}</p>
              <p className="text-[10px] text-gray-600 mt-2 font-mono line-clamp-2">
                {style.system_prompt}
              </p>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/workspace')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.6) 0%, rgba(170,136,255,0.6) 100%)' }}
          >
            前往创作
          </button>
        </div>
      </div>
    </div>
  )
}
