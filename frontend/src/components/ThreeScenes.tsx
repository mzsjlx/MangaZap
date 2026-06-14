import SceneCard from './SceneCard'

const scenes = [
  {
    title: '热门漫剧',
    subtitle: 'Trending',
    description: '最受欢迎的 AI 漫剧作品，感受创作者的无限灵感',
    gradient: 'bg-gradient-to-br from-[#00aaff]/20 to-transparent',
    icon: '🔥',
  },
  {
    title: '精选推荐',
    subtitle: 'Featured',
    description: '编辑精选的高质量漫剧，每一部都值得细细品味',
    gradient: 'bg-gradient-to-br from-[#aa88ff]/20 to-transparent',
    icon: '⭐',
  },
  {
    title: '最新上线',
    subtitle: 'Latest',
    description: '刚刚出炉的新鲜作品，第一时间感受最新创意',
    gradient: 'bg-gradient-to-br from-[#00aaff]/10 to-[#aa88ff]/10',
    icon: '🆕',
  },
]

export default function ThreeScenes() {
  return (
    <section className="relative px-6 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {scenes.map((scene) => (
            <SceneCard key={scene.title} {...scene} />
          ))}
        </div>
      </div>
    </section>
  )
}
