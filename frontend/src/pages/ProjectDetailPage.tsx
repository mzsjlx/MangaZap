import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeftIcon, PlayIcon, DocumentTextIcon, FilmIcon } from '@heroicons/react/24/outline'

interface Scene {
  scene_id: number
  title: string
  description: string
  duration: number
  prompt?: string
  narration?: string
}

interface Project {
  id: string
  title: string
  idea: string
  style: string
  duration: number
  status: string
  script: {
    synopsis: string
    scenes: Array<{
      id: number
      title: string
      description: string
      narration: string
    }>
  } | null
  scenes: Scene[]
  created_at: string
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-600 text-gray-200',
  scripted: 'bg-blue-600 text-blue-100',
  storyboarded: 'bg-purple-600 text-purple-100',
  completed: 'bg-green-600 text-green-100',
  failed: 'bg-red-600 text-red-100',
}

export default function ProjectDetailPage() {
  const { id } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) fetchProject(id)
  }, [id])

  const fetchProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok) {
        setProject(await res.json())
      }
    } catch (err) {
      console.error('Failed to fetch project:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">Project not found</p>
        <Link to="/projects" className="text-indigo-400 hover:text-indigo-300">
          Back to projects
        </Link>
      </div>
    )
  }

  const scenes = project.scenes.length > 0
    ? project.scenes
    : project.script?.scenes?.map((s) => ({
        scene_id: s.id,
        title: s.title,
        description: s.description,
        duration: project.duration / (project.script?.scenes?.length || 1),
        narration: s.narration,
      })) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/projects" className="text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeftIcon className="h-6 w-6" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-100">{project.title}</h2>
          <p className="text-sm text-gray-400">ID: {id}</p>
        </div>
        <span
          className={`text-xs font-medium px-3 py-1 rounded-full ${
            statusColors[project.status] || 'bg-gray-600 text-gray-200'
          }`}
        >
          {project.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
              <FilmIcon className="h-5 w-5 text-indigo-400" />
              Video Preview
            </h3>
            <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
              {project.status === 'completed' ? (
                <video
                  controls
                  className="w-full h-full rounded-lg"
                  src={`/api/projects/${project.id}/video`}
                />
              ) : (
                <div className="text-center">
                  <PlayIcon className="h-16 w-16 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500">
                    {project.status === 'failed' ? 'Generation failed' : 'Video not ready yet'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-indigo-400" />
              Script
            </h3>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-300 text-sm leading-relaxed">
                {project.script?.synopsis || project.idea}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-lg font-medium text-gray-200 mb-4">Info</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Status</dt>
                <dd className="text-sm text-gray-200 capitalize">{project.status}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Style</dt>
                <dd className="text-sm text-gray-200 capitalize">{project.style}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Duration</dt>
                <dd className="text-sm text-gray-200">{project.duration}s</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Created</dt>
                <dd className="text-sm text-gray-200">
                  {new Date(project.created_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-lg font-medium text-gray-200 mb-4">
              Storyboard ({scenes.length} scenes)
            </h3>
            <div className="space-y-3">
              {scenes.map((scene) => (
                <div key={scene.scene_id} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-200">
                      {scene.title}
                    </span>
                    <span className="text-xs text-gray-500">{scene.duration}s</span>
                  </div>
                  <p className="text-xs text-gray-400">{scene.description}</p>
                  {scene.narration && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{scene.narration}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
