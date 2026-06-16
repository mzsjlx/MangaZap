import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { ClockIcon, FilmIcon, PencilIcon, SparklesIcon } from '@heroicons/react/24/outline'

interface StoryboardCardViewProps {
  content: string
  images?: Record<number, string>
  onImageClick?: (imageUrl: string) => void
  onGenerateImage?: (shotIndex: number, prompt: string) => void
  generatingImages?: Record<number, boolean>
}

interface Shot {
  index: number
  title: string
  timeRange: string
  body: string
}

function parseShots(content: string): Shot[] {
  const shots: Shot[] = []
  const regex = /^\*\*镜([一二三四五六七八九十\d]+)\s*[·\-]?\s*([^（]*)\s*（([^）]*)）\*\*/gm
  const blocks: { match: RegExpExecArray; bodyStart: number }[] = []

  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    blocks.push({ match: m, bodyStart: m.index + m[0].length })
  }

  for (let i = 0; i < blocks.length; i++) {
    const { match, bodyStart } = blocks[i]
    const cnNum = match[1]
    const title = match[2].trim() || `镜头${i + 1}`
    const timeRange = match[3].trim()
    const bodyEnd = i + 1 < blocks.length ? blocks[i + 1].match.index : content.length
    const body = content.slice(bodyStart, bodyEnd).trim()
    const numMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 }
    const index = numMap[cnNum] ?? parseInt(cnNum, 10) ?? i + 1
    shots.push({ index, title, timeRange, body })
  }

  return shots
}

function extractTotalInfo(content: string): { totalCount: string; totalDuration: string } {
  const m = content.match(/\*\*总镜头数\*\*[：:]\s*(\d+)\s*\|\s*\*\*预计总时长\*\*[：:]\s*(\d+)/)
  return m ? { totalCount: m[1], totalDuration: m[2] } : { totalCount: '', totalDuration: '' }
}

export default function StoryboardCardView({ content, images, onImageClick, onGenerateImage, generatingImages }: StoryboardCardViewProps) {
  const { totalCount, totalDuration } = useMemo(() => extractTotalInfo(content), [content])
  const shots = useMemo(() => parseShots(content), [content])

  if (shots.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4">
        <p className="text-xs text-gray-500 mb-2">分镜格式异常，请检查后端输出</p>
        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-auto">{content}</pre>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold mb-2"># 分镜设计</h1>
      {(totalCount || totalDuration) && (
        <div className="text-sm text-gray-400 mb-4">
          {totalCount && <span className="font-bold text-white">总镜头数：{totalCount}</span>}
          {totalCount && totalDuration && <span className="text-gray-500 mx-2">|</span>}
          {totalDuration && <span className="font-bold text-white">预计总时长：{totalDuration}秒</span>}
        </div>
      )}

      {shots.map((shot, i) => (
        <div key={`shot-${i}-${shot.index}`} className="rounded-xl border border-white/[0.06] bg-[#0f1520] p-4 group relative">
          <div className="flex items-center gap-2 mb-3">
            <FilmIcon className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-semibold text-white">镜{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][shot.index - 1] || shot.index} · {shot.title}</h4>
            {shot.timeRange && (
              <div className="flex items-center gap-1 ml-auto text-xs text-gray-400">
                <ClockIcon className="w-3.5 h-3.5" />
                <span>{shot.timeRange}</span>
              </div>
            )}
            {onGenerateImage && (
              <button
                onClick={() => onGenerateImage(shot.index - 1, shot.body)}
                disabled={generatingImages?.[shot.index - 1]}
                className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                style={{
                  background: generatingImages?.[shot.index - 1]
                    ? 'rgba(255,255,255,0.02)'
                    : 'linear-gradient(135deg, rgba(0,170,255,0.2) 0%, rgba(170,136,255,0.2) 100%)',
                }}
                title="生成图片"
              >
                {generatingImages?.[shot.index - 1] ? (
                  <div className="w-3.5 h-3.5 border-2 border-[#00aaff] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <SparklesIcon className="w-3.5 h-3.5 text-[#00aaff]" />
                )}
              </button>
            )}
          </div>

          <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed [&_p]:mb-2 [&_strong]:text-indigo-400">
            <ReactMarkdown>{shot.body}</ReactMarkdown>
          </div>

          {images?.[shot.index - 1] && (
            <div className="mt-3">
              <img
                src={images[shot.index - 1]}
                alt={`Shot ${shot.index}`}
                className="h-16 w-auto max-w-full rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onImageClick?.(images[shot.index - 1])}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
