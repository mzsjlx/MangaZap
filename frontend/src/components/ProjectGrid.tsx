import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects } from '../services/api'
import type { Project } from '../services/api'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-600/80 text-gray-200',
  scripted: 'bg-blue-600/80 text-blue-100',
  storyboarded: 'bg-purple-600/80 text-purple-100',
  completed: 'bg-green-600/80 text-green-100',
  failed: 'bg-red-600/80 text-red-100',
}

export default function ProjectGrid() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listProjects()
      .then((data) => setProjects(data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <h2 className="text-sm font-semibold text-gray-400 mb-4">最近项目</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <button
          onClick={() => navigate('/workspace')}
          className="aspect-square bg-[#111111] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-[#00aaff]/40 hover:bg-white/[0.03] transition-all group"
        >
          <span className="text-2xl text-gray-600 group-hover:text-[#00aaff] transition-colors">+</span>
          <span className="text-xs text-gray-500 group-hover:text-[#00aaff] transition-colors">新建项目</span>
        </button>

        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="aspect-square bg-[#111111] border border-white/5 rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-white/5 rounded w-3/4 mb-3" />
              <div className="h-2 bg-white/5 rounded w-1/2" />
            </div>
          ))}

        {!loading &&
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => navigate(`/workspace?projectId=${project.id}`)}
              className="aspect-square bg-[#111111] border border-white/5 rounded-xl p-4 text-left hover:border-[#00aaff]/25 hover:-translate-y-0.5 transition-all group flex flex-col justify-between"
            >
              <div>
                <h3 className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                  {project.title || project.idea}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{formatDate(project.updated_at || project.created_at)}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full w-fit ${statusColors[project.status] || 'bg-gray-600/80 text-gray-200'}`}>
                {project.status}
              </span>
            </button>
          ))}

        {!loading && projects.length === 0 && (
          <div className="col-span-full text-center py-6 text-gray-600 text-xs">
            还没有项目，输入创意开始创作吧
          </div>
        )}
      </div>
    </div>
  )
}
