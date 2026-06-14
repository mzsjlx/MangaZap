interface SceneCardProps {
  title: string
  subtitle: string
  description: string
  gradient: string
  icon: string
}

export default function SceneCard({ title, subtitle, description, gradient, icon }: SceneCardProps) {
  return (
    <div className="group relative bg-[#111111] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-[#00aaff]/25 hover:-translate-y-2 transition-all duration-300 cursor-pointer">
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gradient}`}
        style={{ filter: 'blur(60px)', zIndex: 0 }}
      />

      <div className="relative z-10">
        <div className="w-full h-[180px] relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
          <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60">{icon}</div>
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
              animation: 'shimmer 3s infinite',
            }}
          />
        </div>

        <div className="p-7">
          <p className="text-[11px] font-semibold text-[#00aaff] uppercase tracking-[2px] mb-2">{subtitle}</p>
          <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
          <p className="text-sm text-gray-400 leading-relaxed mb-6">{description}</p>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#aa88ff] group-hover:text-[#00aaff] transition-colors">
            <span>探索</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
