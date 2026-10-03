'use client'

import { useState, useEffect, useCallback } from 'react'
import { subscribeJobStream } from '@/lib/jobs/subscribeJobStream'

interface SceneStatus {
  id: string
  sceneNumber: number
  title?: string
  status: 'pending' | 'generating' | 'generated' | 'failed'
  clipCount: number
  hasAnchor: boolean
  progress?: number
}

interface Props {
  projectId: string
  selectedModels: string[]
  mode: 'draft' | 'production'
}

export function SceneGenerationPanel({ projectId, selectedModels, mode }: Props) {
  const [scenes, setScenes] = useState<SceneStatus[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    fetch(`/api/projects/${projectId}/scenes`)
      .then((r) => r.json())
      .then((d) => {
        setScenes(d.scenes ?? [])
        setLoading(false)
      })
      .catch((err) => {
        console.warn("[caught] src/components/ultimate/SceneGenerationPanel.tsx:33", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (setLoading(false))
      })
  }, [projectId])

  useEffect(() => { reload() }, [reload])

  async function generateScene(sceneId: string) {
    setScenes((s) =>
      s.map((sc) => (sc.id === sceneId ? { ...sc, status: 'generating', progress: 0 } : sc)),
    )

    const res = await fetch('/api/studio/scene/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sceneId, selectedModels, mode }),
    })
    if (!res.ok) {
      setScenes((s) => s.map((sc) => (sc.id === sceneId ? { ...sc, status: 'failed' } : sc)))
      return
    }
    const { jobId } = await res.json() as { jobId: string }

    subscribeJobStream(jobId, {
      onProgress: (update) => {
        const pct = typeof update.progress === 'number' ? update.progress : undefined
        setScenes((s) =>
          s.map((sc) => (sc.id === sceneId ? { ...sc, progress: pct } : sc)),
        )
      },
      onComplete: () => {
        setScenes((s) =>
          s.map((sc) => (sc.id === sceneId ? { ...sc, status: 'generated', progress: 100 } : sc)),
        )
        reload()
      },
      onFailed: () => {
        setScenes((s) => s.map((sc) => (sc.id === sceneId ? { ...sc, status: 'failed' } : sc)))
      },
    })
  }

  if (loading) {
    return <div className="text-zinc-400 text-sm p-4">Loading scenes…</div>
  }

  if (scenes.length === 0) {
    return (
      <p className="text-xs text-zinc-500 p-4">
        Run AI Director analysis first — scenes are created from the script breakdown.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4 border-t border-zinc-800">
      <h3 className="text-sm font-medium text-zinc-300">Scene Generation</h3>

      {scenes.map((scene, idx) => {
        const prevScene = scenes[idx - 1]
        const prevGenerated = idx === 0 || prevScene?.status === 'generated'
        const canGenerate = prevGenerated && scene.status !== 'generating'

        return (
          <div key={scene.id} className="bg-zinc-900 rounded p-3 border border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-zinc-200">Scene {scene.sceneNumber}</span>
                {scene.title && <span className="text-xs text-zinc-500 ml-2">{scene.title}</span>}
                <span className="text-xs text-zinc-600 ml-2">
                  {scene.clipCount} clip{scene.clipCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  scene.status === 'generated' ? 'bg-teal-900 text-teal-300'
                  : scene.status === 'generating' ? 'bg-yellow-900 text-yellow-300'
                  : scene.status === 'failed' ? 'bg-red-900 text-red-300'
                  : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {scene.status === 'generating' && scene.progress !== undefined
                    ? `${Math.round(scene.progress)}%`
                    : scene.status}
                </span>
                <button
                  type="button"
                  onClick={() => void generateScene(scene.id)}
                  disabled={!canGenerate || selectedModels.length === 0}
                  className={`text-xs px-3 py-1 rounded ${
                    canGenerate && selectedModels.length > 0
                      ? 'bg-teal-600 hover:bg-teal-500 text-white'
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {scene.status === 'generated' ? 'Regenerate' : 'Generate'}
                </button>
              </div>
            </div>
            {idx > 0 && !prevGenerated && (
              <p className="text-xs text-amber-400 mt-1">
                Generate Scene {scene.sceneNumber - 1} first for cross-scene continuity.
              </p>
            )}
            {idx > 0 && (
              <p className="text-xs text-zinc-600 mt-1">
                {scene.hasAnchor ? '✓ Anchored to previous scene' : '○ No anchor yet'}
              </p>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => {
          void scenes
            .filter((s) => s.status !== 'generated')
            .reduce((p, scene) => p.then(() => generateScene(scene.id)), Promise.resolve())
        }}
        disabled={selectedModels.length === 0}
        className="mt-2 w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm py-2 rounded"
      >
        Generate All Scenes (Sequential)
      </button>
    </div>
  )
}
