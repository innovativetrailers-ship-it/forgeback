'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loadProject } from '@/lib/projects/loadProject'
import { toast } from '@/lib/toast'
import { ImportProjectPanel } from './ImportProjectPanel'
import { MediaBin } from './MediaBin'
import { usePlaybackStore } from '@/store/playbackStore'
import { FolderOpen, Film, Music, Image, Search, Loader2 } from 'lucide-react'

type LibraryTab = 'projects' | 'media' | 'audio'

interface Project {
  id: string
  name: string
  updatedAt: string
  status: string
}

export function LibraryPanel() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('projects')
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const projectId = usePlaybackStore((state) => state.projectId) ?? ''

  const { data: projectsData } = useQuery<{ projects: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
    enabled: activeTab === 'projects',
  })

  const projects = (projectsData?.projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleOpenProject(projectId: string, projectName: string) {
    setLoadingId(projectId)
    try {
      const { project } = await loadProject(projectId)
      toast.success(`Opened ${project.name ?? projectName ?? 'project'}`)
    } catch (err) {
      console.warn("[caught] src/components/panels/LibraryPanel.tsx:41", err instanceof Error ? { name: err.name, message: err.message } : err)

      toast.error(err instanceof Error ? err.message : 'Failed to open project')
    } finally {
      setLoadingId(null)
    }
  }

  const TABS: { id: LibraryTab; label: string; icon: React.ReactNode }[] = [
    { id: 'projects', label: 'Projects', icon: <Film size={13} /> },
    { id: 'media', label: 'Media', icon: <Image size={13} /> },
    { id: 'audio', label: 'Audio', icon: <Music size={13} /> },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Import button */}
      <div className="p-3 border-b border-[#1a1f2e]">
        <button
          onClick={() => setShowImport(true)}
          className="w-full py-2 text-sm text-[#00e5c8] border border-[#00e5c8]/30 rounded-lg hover:border-[#00e5c8] hover:bg-[#00e5c8]/5 transition flex items-center justify-center gap-2"
        >
          <FolderOpen size={14} />
          Import from another app
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1a1f2e]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs transition ${
              activeTab === tab.id
                ? 'text-[#00e5c8] border-b-2 border-[#00e5c8]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-2 border-b border-[#1a1f2e]">
        <div className="flex items-center gap-2 bg-[#0d1117] border border-[#2a3040] rounded-lg px-2.5 py-1.5">
          <Search size={12} className="text-gray-500 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-white text-xs placeholder-gray-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'projects' && (
          <div className="flex flex-col gap-1">
            {projects.length === 0 ? (
              <div className="text-gray-500 text-xs text-center py-8">
                {search ? 'No projects match your search' : 'No projects yet'}
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => void handleOpenProject(project.id, project.name)}
                  disabled={loadingId === project.id}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-[#1a1f2e] border border-transparent hover:border-[#2a3040] transition group disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    {loadingId === project.id ? (
                      <Loader2 size={13} className="text-[#00e5c8] flex-shrink-0 animate-spin" />
                    ) : (
                      <Film size={13} className="text-[#00e5c8] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium truncate">{project.name}</div>
                      <div className="text-gray-500 text-[10px]">
                        {new Date(project.updatedAt).toLocaleDateString()}
                        {project.status === 'needs_relink' && (
                          <span className="ml-1 text-red-400">· needs re-link</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {(activeTab === 'media' || activeTab === 'audio') && (
          projectId
            ? <MediaBin projectId={projectId} />
            : <div className="text-gray-500 text-xs text-center py-8">Open a project to see its library.</div>
        )}
      </div>

      {/* Import wizard modal */}
      {showImport && (
        <ImportProjectPanel onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
