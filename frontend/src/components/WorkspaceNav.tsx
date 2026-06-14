import { useNavigate } from 'react-router-dom'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

export type ExportType = 'script_md' | 'script_txt' | 'storyboard_json' | 'storyboard_csv' | 'all_zip'

interface WorkspaceNavProps {
  activeTabs: string[]
  onTabToggle: (tab: string) => void
  chatOpen: boolean
  onToggleChat: () => void
  onExport: (type: ExportType) => void
  hasStoryboard: boolean
}

const leftTabs = [
  { id: 'storyboard', label: '故事版' },
  { id: 'files', label: '文件区' },
  { id: 'timeline', label: '时间线' },
  { id: 'docs', label: '文档' },
]

const exportItems: { type: ExportType; label: string; group: 'script' | 'storyboard' | 'all' }[] = [
  { type: 'script_md', label: '导出剧本（Markdown）', group: 'script' },
  { type: 'script_txt', label: '导出剧本（纯文本）', group: 'script' },
  { type: 'storyboard_json', label: '导出分镜（JSON）', group: 'storyboard' },
  { type: 'storyboard_csv', label: '导出分镜（CSV）', group: 'storyboard' },
  { type: 'all_zip', label: '导出全部（ZIP）', group: 'all' },
]

export default function WorkspaceNav({ activeTabs, onTabToggle, chatOpen, onToggleChat, onExport, hasStoryboard }: WorkspaceNavProps) {
  const navigate = useNavigate()

  return (
    <nav className="h-12 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 mr-4 hover:opacity-80 transition-opacity"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <span className="text-sm font-bold text-white tracking-tight">MangaZap</span>
        </button>

        {leftTabs.map((tab) => {
          const isActive = activeTabs.includes(tab.id)
          return (
            <button
              key={tab.id}
              onClick={() => onTabToggle(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 active:scale-95 ${
                isActive ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(0,170,255,0.12) 0%, rgba(170,136,255,0.12) 100%)'
                  : 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
                borderColor: isActive ? 'rgba(0,170,255,0.2)' : 'rgba(255,255,255,0.06)',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onToggleChat}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 active:scale-95 ${
            chatOpen ? 'text-[#00aaff]' : 'text-gray-400 hover:text-white'
          }`}
          style={{
            background: chatOpen
              ? 'linear-gradient(135deg, rgba(0,170,255,0.12) 0%, rgba(170,136,255,0.12) 100%)'
              : 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
            borderColor: chatOpen ? 'rgba(0,170,255,0.2)' : 'rgba(255,255,255,0.06)',
          }}
        >
          对话
        </button>

        <Menu as="div" className="relative">
          <MenuButton
            className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white rounded-lg border transition-all duration-200 active:scale-95 flex items-center gap-1"
            style={{
              background: 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            导出
            <ChevronDownIcon className="w-3 h-3" />
          </MenuButton>

          <MenuItems
            className="absolute right-0 mt-1 w-52 rounded-lg border border-white/[0.06] bg-[#141418] shadow-xl z-50 focus:outline-none"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            <div className="py-1">
              {exportItems.map((item, idx) => {
                const isStoryboard = item.group === 'storyboard'
                const disabled = isStoryboard && !hasStoryboard

                return (
                  <div key={item.type}>
                    {idx === 2 && (
                      <div className="my-1 border-t border-white/[0.06]" />
                    )}
                    {idx === 4 && (
                      <div className="my-1 border-t border-white/[0.06]" />
                    )}
                    <MenuItem disabled={disabled}>
                      {({ focus }) => (
                        <button
                          onClick={() => onExport(item.type)}
                          disabled={disabled}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            disabled
                              ? 'text-gray-600 cursor-not-allowed'
                              : focus
                                ? 'text-white bg-white/[0.06]'
                                : 'text-gray-300 hover:text-white'
                          }`}
                        >
                          {item.label}
                          {disabled && <span className="ml-1 text-gray-600">（无数据）</span>}
                        </button>
                      )}
                    </MenuItem>
                  </div>
                )
              })}
            </div>
          </MenuItems>
        </Menu>

        <button className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00aaff] to-[#aa88ff] flex items-center justify-center text-white text-xs font-bold ml-2">
          U
        </button>
      </div>
    </nav>
  )
}
