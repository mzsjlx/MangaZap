import { useState } from 'react'
import { MODIFICATION_CATEGORIES } from '../config/wizardSteps'

export interface ScriptDraftData {
  title: string
  type: string
  duration: string
  tone: string
  characters: Array<{ name: string; identity: string; personality: string; appearance?: string }>
  scenes: Array<{ act: number; title: string; content: string; duration_estimate?: string }>
  synopsis: string
}

interface ScriptDraftProps {
  script: ScriptDraftData
  rawContent?: string
  onConfirm: () => void
  onRequestModify: () => void
  showModCategories: boolean
  onSelectCategory: (categoryId: string) => void
  onSubOption?: (categoryId: string, subOption: string) => void
  selectedCategory?: string | null
  isBusy?: boolean
}

export default function ScriptDraft({
  script,
  rawContent,
  onConfirm,
  onRequestModify,
  showModCategories,
  onSelectCategory,
  onSubOption,
  selectedCategory,
  isBusy,
}: ScriptDraftProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<ScriptDraftData>(script)

  const isEmpty = script.characters.length === 0 && script.scenes.length === 0 && !script.synopsis

  if (isEmpty) {
    return (
      <div className="space-y-4 text-sm">
        <div
          className="rounded-xl p-4 border border-white/[0.06]"
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <h3 className="text-base font-bold text-white mb-3">📜 脚本预览</h3>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-auto">
            {rawContent || '(无法解析剧本内容)'}
          </pre>
        </div>
        <div
          className="rounded-xl p-4 border border-white/[0.06]"
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onConfirm}
              disabled={isBusy}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #00aaff 0%, #aa88ff 100%)' }}
            >
              ✅ 同意，开始制作
            </button>
            <button
              onClick={onRequestModify}
              disabled={isBusy}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all duration-200 disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              ✏️ 修改意见
            </button>
          </div>
          {showModCategories && (
            <div className="mt-3 space-y-1.5">
              {MODIFICATION_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  disabled={isBusy}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedCategory === cat.id ? 'bg-[#00aaff]/10 text-[#00aaff]' : 'text-gray-400 hover:bg-white/[0.03]'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleEditChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }))
  }

  const handleCharacterChange = (index: number, field: string, value: string) => {
    setEditData((prev) => {
      const chars = [...prev.characters]
      chars[index] = { ...chars[index], [field]: value }
      return { ...prev, characters: chars }
    })
  }

  const handleSceneChange = (index: number, field: string, value: string) => {
    setEditData((prev) => {
      const scenes = [...prev.scenes]
      scenes[index] = { ...scenes[index], [field]: value }
      return { ...prev, scenes: scenes }
    })
  }

  const handleSaveEdit = () => {
    setIsEditing(false)
    onSubOption?.('edit_script', JSON.stringify(editData))
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div
        className="rounded-xl p-4 border border-white/[0.06]"
        style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-white">📜 {isEditing ? '编辑脚本' : '脚本预览'}</h3>
          <button
            onClick={() => isEditing ? handleSaveEdit() : setIsEditing(true)}
            disabled={isBusy}
            className="px-3 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isEditing
                ? 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)'
                : 'rgba(255,255,255,0.04)',
              color: isEditing ? '#00aaff' : '#9ca3af',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {isEditing ? '✅ 保存' : '✏️ 编辑'}
          </button>
        </div>

        {isEditing ? (
          <input
            value={editData.title}
            onChange={(e) => handleEditChange('title', e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-white text-base font-bold mb-2 focus:outline-none focus:border-[#00aaff]/30"
          />
        ) : (
          <div className="flex flex-wrap gap-2 text-xs mb-2">
            <span className="px-2 py-0.5 rounded text-gray-300" style={{ background: 'rgba(255,255,255,0.05)' }}>{editData.type}</span>
            <span className="px-2 py-0.5 rounded text-gray-300" style={{ background: 'rgba(255,255,255,0.05)' }}>{editData.duration}</span>
            <span className="px-2 py-0.5 rounded text-gray-300" style={{ background: 'rgba(255,255,255,0.05)' }}>{editData.tone}</span>
          </div>
        )}

        {isEditing ? (
          <textarea
            value={editData.synopsis}
            onChange={(e) => handleEditChange('synopsis', e.target.value)}
            rows={3}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs text-gray-300 leading-relaxed mt-2 focus:outline-none focus:border-[#00aaff]/30 resize-none"
          />
        ) : editData.synopsis ? (
          <p className="text-gray-400 text-xs leading-relaxed">{editData.synopsis}</p>
        ) : null}
      </div>

      {/* Characters */}
      {editData.characters.length > 0 && (
        <div
          className="rounded-xl p-4 border border-white/[0.06]"
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">人物设定</h4>
          <div className="space-y-1.5">
            {editData.characters.map((char, i) => (
              <div key={i} className="rounded px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                {isEditing ? (
                  <div className="space-y-1">
                    <input
                      value={char.name}
                      onChange={(e) => handleCharacterChange(i, 'name', e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00aaff]/30"
                      placeholder="角色名"
                    />
                    <input
                      value={char.identity}
                      onChange={(e) => handleCharacterChange(i, 'identity', e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-[#00aaff]/30"
                      placeholder="身份"
                    />
                    <input
                      value={char.personality}
                      onChange={(e) => handleCharacterChange(i, 'personality', e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-[#00aaff]/30"
                      placeholder="性格"
                    />
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-gray-200">{char.name}</span>
                    <span className="text-gray-500 mx-1">·</span>
                    <span className="text-gray-400">{char.identity}</span>
                    {char.personality && (
                      <>
                        <span className="text-gray-500 mx-1">·</span>
                        <span className="text-gray-500">{char.personality}</span>
                      </>
                    )}
                    {char.appearance && (
                      <div className="text-xs text-gray-500 mt-0.5">{char.appearance}</div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scenes */}
      {editData.scenes.length > 0 && (
        <div
          className="rounded-xl p-4 border border-white/[0.06]"
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">场景分幕</h4>
          <div className="space-y-1.5">
            {editData.scenes.map((scene, i) => (
              <div key={i} className="rounded px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-1.5 py-0.5 text-[#00aaff] rounded font-mono" style={{ background: 'rgba(0,170,255,0.1)' }}>
                    第{scene.act}幕
                  </span>
                  {isEditing ? (
                    <input
                      value={scene.title}
                      onChange={(e) => handleSceneChange(i, 'title', e.target.value)}
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-[#00aaff]/30"
                      placeholder="场景标题"
                    />
                  ) : (
                    <span className="font-medium text-gray-200">{scene.title}</span>
                  )}
                  {scene.duration_estimate && (
                    <span className="text-xs text-gray-500 ml-auto">{scene.duration_estimate}</span>
                  )}
                </div>
                {isEditing ? (
                  <textarea
                    value={scene.content}
                    onChange={(e) => handleSceneChange(i, 'content', e.target.value)}
                    rows={3}
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs text-gray-300 leading-relaxed focus:outline-none focus:border-[#00aaff]/30 resize-none"
                  />
                ) : (
                  <p className="text-xs text-gray-400 leading-relaxed">{scene.content}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!showModCategories && !isEditing && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={onConfirm}
            disabled={isBusy}
            className="flex-1 px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.3) 0%, rgba(170,136,255,0.3) 100%)' }}
          >
            ✅ 同意，开始制作
          </button>
          <button
            onClick={onRequestModify}
            disabled={isBusy}
            className="flex-1 px-4 py-2.5 text-gray-200 text-sm font-medium rounded-lg transition-colors border border-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, rgba(0,170,255,0.04) 0%, rgba(170,136,255,0.04) 100%)' }}
          >
            ✏️ 需要修改脚本
          </button>
        </div>
      )}

      {/* Modification categories */}
      {showModCategories && !isEditing && (
        <div
          className="rounded-xl p-4 border border-white/[0.06]"
          style={{ background: 'linear-gradient(145deg, #0f1520 0%, #0a0e18 40%, #080810 100%)' }}
        >
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">选择要修改的类别</h4>
          <div className="space-y-1.5">
            {MODIFICATION_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <button
                  onClick={() => onSelectCategory(cat.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                    selectedCategory === cat.id
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                  }`}
                  style={
                    selectedCategory === cat.id
                      ? { background: 'linear-gradient(135deg, rgba(0,170,255,0.12) 0%, rgba(170,136,255,0.12) 100%)' }
                      : undefined
                  }
                >
                  <span>{cat.icon}</span>
                  <span className="font-medium">{cat.label}</span>
                </button>

                {selectedCategory === cat.id && (
                  <div className="ml-6 mt-1 space-y-1">
                    {cat.subOptions.map((sub) => (
                      <button
                        key={sub}
                        onClick={() => onSubOption?.(cat.id, sub)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-[#00aaff] hover:bg-white/[0.03] rounded transition-colors"
                      >
                        → {sub}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
