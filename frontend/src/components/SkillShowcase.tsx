const skills = [
  { id: 'action', name: '热血战斗', icon: '🔥' },
  { id: 'romance', name: '甜蜜恋爱', icon: '💕' },
  { id: 'mystery', name: '悬疑推理', icon: '🔍' },
  { id: 'scifi', name: '科幻末世', icon: '🚀' },
  { id: 'urban', name: '都市生活', icon: '🏙️' },
]

interface SkillShowcaseProps {
  onSelect: (name: string) => void
}

export default function SkillShowcase({ onSelect }: SkillShowcaseProps) {
  return (
    <div className="w-full max-w-6xl mx-auto">
      <h2 className="text-sm font-semibold text-gray-400 mb-4">Skill</h2>
      <div className="grid grid-cols-5 gap-3">
        {skills.map((skill) => (
          <button
            key={skill.id}
            onClick={() => onSelect(skill.name)}
            className="col-span-1 bg-[#111111] border border-white/[0.06] rounded-xl py-3 px-4 text-center hover:border-[#00aaff]/25 hover:-translate-y-0.5 hover:bg-white/[0.03] transition-all group flex flex-col items-center justify-center"
          >
            <div className="text-2xl mb-1">{skill.icon}</div>
            <h3 className="text-xs font-semibold text-gray-200 group-hover:text-white transition-colors">
              {skill.name}
            </h3>
          </button>
        ))}
      </div>
    </div>
  )
}
