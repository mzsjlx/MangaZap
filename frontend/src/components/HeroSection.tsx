import { useNavigate } from 'react-router-dom'

export default function HeroSection() {
  const navigate = useNavigate()

  return (
    <section className="relative pt-32 pb-20 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.1] mb-6 tracking-tight">
          用 AI 创作
          <br />
          <span className="bg-gradient-to-r from-[#00aaff] to-[#aa88ff] bg-clip-text text-transparent">
            漫剧
          </span>
        </h1>
        <p className="text-lg md:text-xl text-gray-400 mb-10 leading-relaxed font-light">
          输入你的创意，AI 自动生成剧本、分镜、配音，一键出片
        </p>
        <button
          onClick={() => navigate('/workspace')}
          className="px-8 py-3.5 bg-gradient-to-r from-[#00aaff] to-[#aa88ff] text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all duration-200 shadow-lg shadow-[#00aaff]/20"
        >
          开始创作
        </button>
      </div>
    </section>
  )
}
