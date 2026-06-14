import { useMemo } from 'react'

interface KeyElementsViewerProps {
  content: string
  images?: Record<string, string[]>
}

interface Character {
  name: string
  isMain: boolean
  content: string
}

interface Scene {
  name: string
  isMain: boolean
  content: string
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        let processed: React.ReactNode = line
        processed = line.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>
          }
          return part
        })
        return (
          <span key={i}>
            {processed}
            {i < lines.length - 1 && <br />}
          </span>
        )
      })}
    </>
  )
}

function parseKeyElements(content: string) {
  const characters: Character[] = []
  const scenes: Scene[] = []
  let clothingContent = ''
  let multiViewContent = ''
  let visualStyleContent = ''
  let moodContent = ''

  // Split by ## headings
  const sections = content.split(/(?=^## )/m)

  for (const section of sections) {
    // Check for character sections
    const characterMatch = section.match(/^### (主角|配角)：(.+)$/m)
    if (characterMatch) {
      const isMain = characterMatch[1] === '主角'
      const name = characterMatch[2].trim()
      // Extract content after the ### line
      const lines = section.split('\n')
      const startIndex = lines.findIndex(l => l.startsWith('### '))
      const charContent = lines.slice(startIndex + 1).join('\n').trim()
      characters.push({ name, isMain, content: charContent })
      continue
    }

    // Check for clothing section
    if (section.match(/^## 二、服装与材质/m)) {
      const lines = section.split('\n')
      const startIndex = lines.findIndex(l => l.startsWith('## '))
      clothingContent = lines.slice(startIndex + 1).join('\n').trim()
      continue
    }

    // Check for multi-view section
    if (section.match(/^## 三、多视角展示/m)) {
      const lines = section.split('\n')
      const startIndex = lines.findIndex(l => l.startsWith('## '))
      multiViewContent = lines.slice(startIndex + 1).join('\n').trim()
      continue
    }

    // Check for scene section
    const sceneMatch = section.match(/^### (主要场景|次要场景)：(.+)$/m)
    if (sceneMatch) {
      const isMain = sceneMatch[1] === '主要场景'
      const name = sceneMatch[2].trim()
      // Extract content after the ### line
      const lines = section.split('\n')
      const startIndex = lines.findIndex(l => l.startsWith('### '))
      const sceneContent = lines.slice(startIndex + 1).join('\n').trim()
      scenes.push({ name, isMain, content: sceneContent })
      continue
    }

    // Check for visual style section
    if (section.match(/^## 五、视觉风格/m)) {
      const lines = section.split('\n')
      const startIndex = lines.findIndex(l => l.startsWith('## '))
      visualStyleContent = lines.slice(startIndex + 1).join('\n').trim()
      continue
    }

    // Check for mood section
    if (section.match(/^## 六、情绪与氛围/m)) {
      const lines = section.split('\n')
      const startIndex = lines.findIndex(l => l.startsWith('## '))
      moodContent = lines.slice(startIndex + 1).join('\n').trim()
      continue
    }
  }

  return { characters, scenes, clothingContent, multiViewContent, visualStyleContent, moodContent }
}

export default function KeyElementsViewer({ content, images = {} }: KeyElementsViewerProps) {
  const { characters, scenes, clothingContent, multiViewContent, visualStyleContent, moodContent } = useMemo(
    () => parseKeyElements(content),
    [content]
  )

  return (
    <div className="space-y-4">
      {/* Character cards */}
      {characters.map((char, i) => (
        <div
          key={`char-${i}`}
          className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
              background: char.isMain ? 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)' : 'rgba(255,255,255,0.05)',
              color: char.isMain ? '#00aaff' : '#9ca3af',
            }}>
              {char.isMain ? '主角' : '配角'}
            </span>
            <h4 className="text-sm font-semibold text-white">{char.name}</h4>
          </div>
          <div className="text-sm text-gray-300 leading-relaxed">
            <SimpleMarkdown text={char.content} />
          </div>
          {images[`char_${char.name}`]?.length > 0 && (
            <div className="mt-3 flex gap-1 overflow-x-auto">
              {images[`char_${char.name}`].map((url, idx) => (
                <img key={idx} src={url} alt={`${char.name} ${idx + 1}`} className="w-full rounded-lg flex-shrink-0" />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Clothing & Material card */}
      {clothingContent && (
        <div
          className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4"
        >
          <h4 className="text-sm font-semibold text-white mb-3">服装与材质</h4>
          <div className="text-sm text-gray-300 leading-relaxed">
            <SimpleMarkdown text={clothingContent} />
          </div>
        </div>
      )}

      {/* Multi-view card */}
      {multiViewContent && (
        <div
          className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4"
        >
          <h4 className="text-sm font-semibold text-white mb-3">多视角展示</h4>
          <div className="text-sm text-gray-300 leading-relaxed">
            <SimpleMarkdown text={multiViewContent} />
          </div>
        </div>
      )}

      {/* Scene cards */}
      {scenes.map((scene, i) => (
        <div
          key={`scene-${i}`}
          className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
              background: scene.isMain ? 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)' : 'rgba(255,255,255,0.05)',
              color: scene.isMain ? '#00aaff' : '#9ca3af',
            }}>
              {scene.isMain ? '主要场景' : '次要场景'}
            </span>
            <h4 className="text-sm font-semibold text-white">{scene.name}</h4>
          </div>
          <div className="text-sm text-gray-300 leading-relaxed">
            <SimpleMarkdown text={scene.content} />
          </div>
          {images[`scene_${scene.name}`]?.length > 0 && (
            <div className="mt-3 flex gap-1 overflow-x-auto">
              {images[`scene_${scene.name}`].map((url, idx) => (
                <img key={idx} src={url} alt={`${scene.name} ${idx + 1}`} className="w-full rounded-lg flex-shrink-0" />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Visual Style card */}
      {visualStyleContent && (
        <div
          className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4"
        >
          <h4 className="text-sm font-semibold text-white mb-3">视觉风格</h4>
          <div className="text-sm text-gray-300 leading-relaxed">
            <SimpleMarkdown text={visualStyleContent} />
          </div>
        </div>
      )}

      {/* Mood & Atmosphere card */}
      {moodContent && (
        <div
          className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4"
        >
          <h4 className="text-sm font-semibold text-white mb-3">情绪与氛围</h4>
          <div className="text-sm text-gray-300 leading-relaxed">
            <SimpleMarkdown text={moodContent} />
          </div>
        </div>
      )}
    </div>
  )
}
