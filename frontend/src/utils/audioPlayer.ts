let currentAudio: HTMLAudioElement | null = null
let onEndCallback: (() => void) | null = null
let onTimeUpdateCallback: ((progress: number) => void) | null = null

export function playAudio(url: string, onEnd?: () => void, onTimeUpdate?: (progress: number) => void): Promise<void> {
  stopAudio()
  onEndCallback = onEnd || null
  onTimeUpdateCallback = onTimeUpdate || null
  
  currentAudio = new Audio(url)
  
  currentAudio.addEventListener('ended', () => {
    onEndCallback?.()
  })
  
  currentAudio.addEventListener('timeupdate', () => {
    if (currentAudio && currentAudio.duration && onTimeUpdateCallback) {
      onTimeUpdateCallback(currentAudio.currentTime / currentAudio.duration)
    }
  })
  
  return currentAudio.play()
}

export function stopAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio.src = ''
    currentAudio = null
  }
  onEndCallback = null
  onTimeUpdateCallback = null
}

export function pauseAudio() {
  if (currentAudio) {
    currentAudio.pause()
  }
}

export function resumeAudio() {
  if (currentAudio) {
    currentAudio.play()
  }
}

export function isAudioPlaying(): boolean {
  return currentAudio ? !currentAudio.paused : false
}

export function getAudioProgress(): number {
  if (!currentAudio || !currentAudio.duration) return 0
  return currentAudio.currentTime / currentAudio.duration
}
