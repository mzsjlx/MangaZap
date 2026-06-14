import { useState } from 'react'
import type { WizardOption } from '../config/wizardSteps'

interface OptionCardProps {
  options: WizardOption[]
  allowCustom?: boolean
  customPlaceholder?: string
  onSelect: (value: string, label?: string) => void
  disabled?: boolean
}

export default function OptionCard({ options, customPlaceholder, onSelect, disabled }: OptionCardProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false)
  const [customInput, setCustomInput] = useState('')

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onSelect(customInput.trim(), customInput.trim())
      setCustomInput('')
      setIsCustomOpen(false)
    }
  }

  const handleOptionClick = (option: WizardOption) => {
    if (disabled) return
    if (option.id === '__free_input__') {
      setIsCustomOpen(true)
      return
    }
    onSelect(option.id, option.label)
  }

  return (
    <div className="mt-3 space-y-2">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => handleOptionClick(option)}
          disabled={disabled}
          className="w-full flex items-start gap-3 px-3 py-2.5 bg-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 border border-gray-600/50 rounded-lg text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {option.icon && (
            <span className="text-lg shrink-0 mt-0.5">{option.icon}</span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-200 group-hover:text-indigo-300 transition-colors">
              {option.label}
            </div>
            {option.description && (
              <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
            )}
          </div>
        </button>
      ))}

      {isCustomOpen && (
        <div className="flex gap-2 mt-2">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomSubmit()
              if (e.key === 'Escape') { setIsCustomOpen(false); setCustomInput('') }
            }}
            placeholder={customPlaceholder || '请输入你想要的...'}
            autoFocus
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customInput.trim()}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors shrink-0"
          >
            确认
          </button>
        </div>
      )}
    </div>
  )
}
