import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FolderIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

interface Project {
  id: string
  title: string
  status: string
  style: string
  duration: number
  created_at: string
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-600 text-gray-200',
  scripted: 'bg-blue-600 text-blue-100',
  storyboarded: 'bg-purple-600 text-purple-100',
  completed: 'bg-green-600 text-green-100',
  failed: 'bg-red-600 text-red-100',
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      setProjects(projects.filter((p) => p.id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Projects</h2>
          <p className="mt-1 text-sm text-gray-400">Your manga video projects</p>
        </div>
        <Link
          to="/create"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          New Project
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <FolderIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No projects yet</p>
          <Link to="/create" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/project/${project.id}`}
              className="bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-500 transition-colors overflow-hidden group"
            >
              <div className="h-40 bg-gray-800 flex items-center justify-center">
                <FolderIcon className="h-12 w-12 text-gray-600" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-gray-200 truncate flex-1">{project.title}</h3>
                  <button
                    onClick={(e) => handleDelete(project.id, e)}
                    className="text-gray-600 hover:text-red-400 transition-colors ml-2 opacity-0 group-hover:opacity-100"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      statusColors[project.status] || 'bg-gray-600 text-gray-200'
                    }`}
                  >
                    {project.status}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="capitalize">{project.style}</span>
                    <span>{project.duration}s</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
