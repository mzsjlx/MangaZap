import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { KeyIcon } from '@heroicons/react/24/outline'
import ApiKeyModal from './ApiKeyModal'

const navItems = [
  { to: '/', icon: '🏠', label: '首页' },
  { to: '/projects', icon: '📁', label: '项目' },
  { to: '/elements', icon: '🎨', label: '元素库' },
  { to: '/skill', icon: '⚡', label: 'Skill' },
]

export default function Sidebar() {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-[#0d0d0d] border-r border-white/5 flex flex-col z-50">
      <NavLink to="/" className="flex items-center gap-3 px-5 h-16 border-b border-white/5 shrink-0 hover:bg-white/[0.03] transition-colors">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center">
          <span className="text-white text-sm font-bold">M</span>
        </div>
        <span className="text-base font-bold text-white tracking-tight">MangaZap</span>
      </NavLink>

      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/5 space-y-1">
        <button
          onClick={() => setShowApiKeyModal(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white hover:bg-white/[0.04] w-full"
        >
          <KeyIcon className="w-5 h-5" />
          <span>API 设置</span>
        </button>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center text-white text-xs font-bold">
            U
          </div>
          <span className="text-sm text-gray-400">用户</span>
        </div>
      </div>

      <ApiKeyModal
        open={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSaved={() => setShowApiKeyModal(false)}
      />
    </aside>
  )
}
