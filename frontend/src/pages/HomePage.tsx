import { useState } from 'react'
import ParticleBackground from '../components/ParticleBackground'
import ChatInput from '../components/ChatInput'
import SkillShowcase from '../components/SkillShowcase'
import ProjectGrid from '../components/ProjectGrid'

export default function HomePage() {
  const [chatValue, setChatValue] = useState('')

  const handleSkillSelect = (name: string) => {
    setChatValue(name + '：')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      <ParticleBackground />
      <div className="relative z-10 flex flex-col items-center pt-24 pb-16 px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-3 tracking-tight">
            <span className="bg-gradient-to-r from-[#00aaff] to-[#aa88ff] bg-clip-text text-transparent">MangaZap</span>
            <span className="text-white"> + 你的专属视频创作 agent</span>
          </h1>
          <p className="text-base text-gray-400 font-light">
            把品味和习惯写进 skill，让精力回归创意
          </p>
        </div>

        <ChatInput externalValue={chatValue} onValueChange={setChatValue} />

        <div className="mt-12 w-full max-w-6xl">
          <SkillShowcase onSelect={handleSkillSelect} />
        </div>

        <div className="mt-12 w-full max-w-6xl">
          <ProjectGrid />
        </div>
      </div>
    </div>
  )
}
