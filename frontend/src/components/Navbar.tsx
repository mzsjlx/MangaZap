import { useState } from 'react'
import { NavLink } from 'react-router-dom'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <NavLink to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center">
              <span className="text-white text-sm font-bold">M</span>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">MangaZap</span>
          </NavLink>

          <div className="hidden md:flex items-center gap-8">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-[#00aaff]' : 'text-gray-400 hover:text-white'}`
              }
            >
              首页
            </NavLink>
            <NavLink
              to="/workspace"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-[#00aaff]' : 'text-gray-400 hover:text-white'}`
              }
            >
              剧集
            </NavLink>
            <span className="text-sm font-medium text-gray-400 hover:text-white cursor-pointer transition-colors">
              我的
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              U
            </button>
            <button
              className="md:hidden text-gray-400 hover:text-white text-2xl leading-none"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-[#0a0a0a]/95 backdrop-blur-md border-t border-white/5 px-6 py-4 space-y-3">
          <NavLink to="/" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>首页</NavLink>
          <NavLink to="/workspace" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>剧集</NavLink>
          <span className="block text-sm text-gray-300 hover:text-white cursor-pointer">我的</span>
        </div>
      )}
    </nav>
  )
}
