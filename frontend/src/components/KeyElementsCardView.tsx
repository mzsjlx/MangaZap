import { useMemo } from 'react'
import VoiceTrackStrip, { type VoiceTrack } from './VoiceTrackStrip'

interface KeyElementsCardViewProps {
  content: string
  images?: Record<string, string[]>
  onImageClick?: (imageUrl: string, itemKey?: string) => void
  onSelectImage?: (itemKey: string, imageUrl: string) => void
  selectedReferenceImages?: Record<string, string>
  keyElementsProgress?: Record<string, number>
  voiceTracks?: Record<string, VoiceTrack[]>
  onSelectVoiceTrack?: (trackId: string) => void
  onDeleteVoiceTrack?: (trackId: string) => void
  onPlayVoiceTrack?: (trackId: string) => void
  onAddVoiceTrack?: (characterName: string) => void
}

interface CharacterSub {
  role: string
  name: string
  appearanceLines: string
}

interface SceneSub {
  type: string
  name: string
  rawText: string
}

function parseKeyElements(content: string) {
  const characters: CharacterSub[] = []
  const scenes: SceneSub[] = []
  let visualStyleRaw = ''
  let moodRaw = ''

  const sections = content.split(/(?=^## )/m)

  for (const section of sections) {
    const headingMatch = section.match(/^## (.+)$/m)
    if (!headingMatch) continue
    const heading = headingMatch[1]

    if (heading.includes('角色形象')) {
      const subSections = section.split(/(?=^### )/m)
      for (const sub of subSections) {
        const subMatch = sub.match(/^### (主角|配角)[：:](.+)$/m)
        if (!subMatch) continue
        const role = subMatch[1]
        const name = subMatch[2].trim()

        const lines = sub.split('\n').slice(1).filter(l => l.trim()).join('\n').trim()
        characters.push({ role, name, appearanceLines: lines })
      }
    } else if (heading.includes('场景')) {
      const subSections = section.split(/(?=^### )/m)
      for (const sub of subSections) {
        const subMatch = sub.match(/^### (主要场景|次要场景)[一二三四五六七八九十\d]*[：:]\s*(.+)$/m)
        if (!subMatch) continue
        const type = subMatch[1]
        const name = subMatch[2].trim()
        const lines = sub.split('\n').slice(1).filter(l => l.trim()).join('\n').trim()
        scenes.push({ type, name, rawText: lines })
      }
    } else if (heading.includes('视觉风格')) {
      const idx = section.indexOf('\n')
      visualStyleRaw = idx >= 0 ? section.slice(idx).trim() : ''
    } else if (heading.includes('情绪与氛围')) {
      const idx = section.indexOf('\n')
      moodRaw = idx >= 0 ? section.slice(idx).trim() : ''
    }
  }

  return { characters, scenes, visualStyleRaw, moodRaw }
}

function extractSummary(raw: string, maxLen = 80): string {
  if (!raw) return ''
  const clean = raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[\-\*]\s+/gm, '')
    .replace(/^[^：:]+[：:]\s*/gm, '')
    .trim()
  const firstLine = clean.split('\n').filter(l => l.trim())[0] || ''
  const firstSentence = firstLine.split(/[。！？.!?]/)[0] || firstLine
  const result = firstSentence.trim()
  return result.length > maxLen ? result.slice(0, maxLen) + '...' : result
}

const badgeMain = 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)'
const badgeSub = 'rgba(255,255,255,0.05)'

export default function KeyElementsCardView({ 
  content, 
  images = {}, 
  onImageClick, 
  onSelectImage, 
  selectedReferenceImages = {}, 
  keyElementsProgress = {},
  voiceTracks = {},
  onSelectVoiceTrack,
  onDeleteVoiceTrack,
  onPlayVoiceTrack,
  onAddVoiceTrack,
}: KeyElementsCardViewProps) {
  const { characters, scenes, visualStyleRaw, moodRaw } = useMemo(
    () => parseKeyElements(content),
    [content]
  )

  const handleSelectImage = (itemKey: string, imageUrl: string) => {
    if (confirm('选择此图片作为主图？')) {
      onSelectImage?.(itemKey, imageUrl)
    }
  }

  return (
    <div className="space-y-4">
      {characters.map((char, i) => (
        <div key={`char-${i}`} className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: char.role === '主角' ? badgeMain : badgeSub,
                color: char.role === '主角' ? '#00aaff' : '#9ca3af',
              }}
            >
              {char.role}
            </span>
            <h4 className="text-sm font-medium text-white">{char.name}</h4>
          </div>

          {char.appearanceLines && (
            <p className="text-xs text-gray-400 mb-2 line-clamp-2">
              {extractSummary(char.appearanceLines)}
            </p>
          )}

          {/* Images section */}
          {(() => {
            const charKey = `char_${char.name}`
            const charProgress = keyElementsProgress[charKey]
            const charImages = images[charKey]
            const isGenerating = charProgress !== undefined && charProgress < 100 && charProgress >= 0
            return charImages?.length > 0 ? (
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {charImages.map((url, idx) => {
                  const itemKey = charKey
                  const isSelected = selectedReferenceImages[itemKey] === url
                  return (
                    <div key={idx} className="relative flex-shrink-0">
                      <img 
                        src={url} 
                        alt={`${char.name} ${idx + 1}`} 
                        className={`h-16 w-auto max-w-full rounded-md cursor-pointer hover:opacity-80 transition-opacity ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                        onClick={() => onImageClick?.(url, itemKey)}
                        onDoubleClick={() => handleSelectImage(itemKey, url)}
                      />
                      {isSelected && (
                        <div className="absolute top-0 right-0 bg-green-500 rounded-full p-0.5 text-white text-xs leading-none">✓</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : isGenerating ? (
              <div className="mt-2">
                <div className="h-16 w-auto min-w-[64px] bg-gray-800 rounded-md flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : null
          })()}

          {/* Voice tracks row - always rendered after images */}
          <div className="flex gap-1 mt-2 items-center overflow-x-auto">
            {(voiceTracks[char.name] || []).map(track => (
              <VoiceTrackStrip
                key={track.id}
                track={track}
                onSelect={onSelectVoiceTrack || (() => {})}
                onDelete={onDeleteVoiceTrack || (() => {})}
                onPlay={onPlayVoiceTrack || (() => {})}
              />
            ))}
            {onAddVoiceTrack && (
              <button
                onClick={() => onAddVoiceTrack(char.name)}
                className="flex-shrink-0 w-6 h-8 rounded border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/40 transition-colors text-xs"
              >
                +
              </button>
            )}
          </div>
        </div>
      ))}

      {scenes.map((scene, i) => (
        <div key={`scene-${i}`} className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: scene.type === '主要场景' ? badgeMain : badgeSub,
                color: scene.type === '主要场景' ? '#00aaff' : '#9ca3af',
              }}
            >
              {scene.type}
            </span>
            <h4 className="text-sm font-medium text-white">{scene.name}</h4>
          </div>
          <p className="text-xs text-gray-400 mb-2 line-clamp-2">
            {extractSummary(scene.rawText)}
          </p>

          {(() => {
            const sceneKey = `scene_${scene.name}`
            const sceneProgress = keyElementsProgress[sceneKey]
            const sceneImages = images[sceneKey]
            const isGenerating = sceneProgress !== undefined && sceneProgress < 100 && sceneProgress >= 0
            return sceneImages?.length > 0 ? (
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {sceneImages.map((url, idx) => {
                  const itemKey = sceneKey
                  const isSelected = selectedReferenceImages[itemKey] === url
                  return (
                    <div key={idx} className="relative flex-shrink-0">
                      <img 
                        src={url} 
                        alt={`${scene.name} ${idx + 1}`} 
                        className={`h-16 w-auto max-w-full rounded-md cursor-pointer hover:opacity-80 transition-opacity ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                        onClick={() => onImageClick?.(url, itemKey)}
                        onDoubleClick={() => handleSelectImage(itemKey, url)}
                      />
                      {isSelected && (
                        <div className="absolute top-0 right-0 bg-green-500 rounded-full p-0.5 text-white text-xs leading-none">✓</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : isGenerating ? (
              <div className="mt-2">
                <div className="h-16 w-auto min-w-[64px] bg-gray-800 rounded-md flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : null
          })()}
        </div>
      ))}

      {(visualStyleRaw || moodRaw) && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-2">
          <h4 className="text-sm font-medium text-white mb-1">视觉风格与氛围</h4>
          <p className="text-xs text-gray-400 line-clamp-2">
            {visualStyleRaw ? extractSummary(visualStyleRaw, 100) : extractSummary(moodRaw, 100)}
          </p>
        </div>
      )}
    </div>
  )
}
