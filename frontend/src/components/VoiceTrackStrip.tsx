import { useRef, useEffect, useState } from 'react'

export interface VoiceTrack {
  id: string
  version: number
  character: string
  voice: string
  audioUrl: string
  waveform: number[]
  color: string
  isSelected: boolean
}

interface VoiceTrackStripProps {
  track: VoiceTrack
  onSelect: (trackId: string) => void
  onDelete: (trackId: string) => void
  onPlay: (trackId: string) => void
}

export default function VoiceTrackStrip({ track, onSelect, onDelete, onPlay }: VoiceTrackStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = 48
    const height = 32
    canvas.width = width
    canvas.height = height
    
    ctx.clearRect(0, 0, width, height)
    
    const points = track.waveform.length
    if (points === 0) return
    
    const barWidth = Math.max(1, (width - 2) / points - 1)
    const gap = 1
    
    track.waveform.forEach((amp, i) => {
      const barHeight = Math.max(2, amp * (height - 4))
      const x = 1 + i * (barWidth + gap)
      const y = (height - barHeight) / 2
      
      ctx.fillStyle = track.isSelected ? track.color : '#6b7280'
      ctx.fillRect(x, y, barWidth, barHeight)
    })
  }, [track.waveform, track.isSelected, track.color])

  return (
    <div
      className="relative flex-shrink-0 cursor-pointer rounded-sm transition-all"
      style={{
        width: 48,
        height: 32,
        border: track.isSelected ? `2px solid ${track.color}` : '1px solid rgba(255,255,255,0.1)',
        boxShadow: track.isSelected ? `0 0 8px ${track.color}40` : 'none',
      }}
      onClick={() => {
        onSelect(track.id)
        onPlay(track.id)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <canvas
        ref={canvasRef}
        width={48}
        height={32}
        className="absolute inset-0"
      />
      
      <span className="absolute bottom-0 right-0.5 text-[8px] text-white/60 pointer-events-none">
        v{track.version}
      </span>
      
      <span className="absolute top-0 left-0.5 text-[7px] text-white/40 pointer-events-none truncate max-w-[36px]">
        {track.voice}
      </span>
      
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(track.id)
          }}
          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-[8px] flex items-center justify-center hover:bg-red-400 transition-colors z-10"
        >
          x
        </button>
      )}
    </div>
  )
}
