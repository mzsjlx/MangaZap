import { Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import ProjectsPage from './pages/ProjectsPage'
import ElementsPage from './pages/ElementsPage'
import SkillPage from './pages/SkillPage'

export default function App() {
  const location = useLocation()
  const isWorkspace = location.pathname === '/workspace'

  // Workspace has its own nav, no sidebar
  if (isWorkspace) {
    return (
      <Routes>
        <Route path="/workspace" element={<WorkspacePage />} />
      </Routes>
    )
  }

  // Home and other pages have sidebar
  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <div className="flex-1 ml-[220px]">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/elements" element={<ElementsPage />} />
          <Route path="/skill" element={<SkillPage />} />
        </Routes>
      </div>
    </div>
  )
}
