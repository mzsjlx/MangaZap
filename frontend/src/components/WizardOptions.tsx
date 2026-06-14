import { useState } from 'react'
import type { WizardOption } from '../config/wizardSteps'

interface WizardOptionsProps {
  options: WizardOption[]
  onSubmit: (value: string, label: string) => void
  onAiRecommend?: () => void
}

export default function WizardOptions({ options, onSubmit, onAiRecommend }: WizardOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false)

  const handleSelect = (option: WizardOption) => {
    if (option.id === '__free_input__') {
      setSelected(option.id)
      setShowCustom(true)
      return
    }
    if (option.id === '__ai_recommend__') {
      onAiRecommend?.()
      setIsDisabled(true)
      return
    }
    if (option.id === '__confirm__') {
      setSelected(option.id)
      setIsDisabled(true)
      onSubmit('__confirm__', '确认')
      return
    }
    setSelected(option.id)
    setShowCustom(false)
  }

  const handleSubmit = () => {
    if (!selected) return
    setIsDisabled(true)
    if (selected === '__free_input__') {
      if (customInput.trim()) {
        onSubmit(customInput.trim(), customInput.trim())
      }
      return
    }
    if (selected === '__ai_recommend__') {
      onAiRecommend?.()
      return
    }
    const option = options.find((o) => o.id === selected)
    if (option) {
      const displayText = option.description
        ? `${option.label}\n${option.description}`
        : option.label
      onSubmit(option.id, displayText)
    }
  }

  const canSubmit = selected && selected !== '__ai_recommend__' && (selected !== '__free_input__' || customInput.trim())

  return (
    <div className="space-y-1.5">
      {options.map((option) => {
        const isSelected = selected === option.id
        return (
          <button
            key={option.id}
            onClick={() => handleSelect(option)}
            disabled={isDisabled}
            className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
              isDisabled
                ? 'opacity-40 cursor-not-allowed'
                : isSelected
                  ? 'bg-[#00aaff]/10'
                  : 'hover:bg-white/[0.03]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                isSelected
                  ? 'border-[#00aaff] bg-[#00aaff]'
                  : 'border-gray-600'
              }`}
            >
              {isSelected && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                {option.label}
              </div>
              {option.description && (
                <div className={`text-xs mt-1 leading-relaxed ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                  {option.description}
                </div>
              )}
            </div>
          </button>
        )
      })}

      {showCustom && selected === '__free_input__' && (
        <div className="px-4">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit() }}
            placeholder="请输入你想要的..."
            autoFocus
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#00aaff]/30"
          />
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isDisabled}
          className="px-5 py-2 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: canSubmit
              ? 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)'
              : 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
            borderColor: canSubmit ? 'rgba(0,170,255,0.3)' : 'rgba(255,255,255,0.06)',
            color: canSubmit ? '#00aaff' : '#6b7280',
            border: '1px solid',
          }}
        >
          确认
        </button>
      </div>
    </div>
  )
}
