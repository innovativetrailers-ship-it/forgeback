'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CharacterOnboarding } from '@/components/vault/CharacterOnboarding'
import { ForgeCastPanel } from '@/components/vault/ForgeCastPanel'
import type { CharacterOnboardingData } from '@/components/vault/CharacterOnboarding'
import { toast } from '@/lib/toast'
import { Users, Plus, Loader2, Trash2 } from 'lucide-react'
import { usePlaybackStore } from '@/store/playbackStore'
import { ensureEditorProject } from '@/lib/projects/loadProject'

interface ApiCharacter {
  id: string
  name: string
  referenceUrls: string[]
  loraStatus: string
  renderCount: number
}

export function CharacterCastPanel() {
  const queryClient = useQueryClient()
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [forgeCastId, setForgeCastId] = useState<string | null>(null)

  const editorProjectId = usePlaybackStore((s) => s.projectId)

  useEffect(() => {
    if (!onboardingOpen) return
    const current = editorProjectId || usePlaybackStore.getState().projectId
    if (current) {
      setCreateProjectId(current)
      return
    }
    void ensureEditorProject().then(({ projectId }) => setCreateProjectId(projectId)).catch((err) => logCaught('components/panels/CharacterCastPanel', err))
  }, [onboardingOpen, editorProjectId])

  const { data: characters = [], isLoading } = useQuery<ApiCharacter[]>({
    queryKey: ['vault-characters', 'user'],
    queryFn: async () => {
      const res = await fetch('/api/vault/character/list', { credentials: 'include' })
      if (!res.ok) return []
      return res.json() as Promise<ApiCharacter[]>
    },
  })

  const handleOnboardingComplete = async (data: CharacterOnboardingData) => {
    setCreating(true)
    try {
      if (!data.characterId) {
        const fd = new FormData()
        fd.append('name', data.name)
        if (data.description?.trim()) fd.append('description', data.description.trim())
        const projectId = editorProjectId || (await ensureEditorProject()).projectId
        fd.append('projectId', projectId)
        fd.append('triggerWord', data.triggerWord)
        fd.append('modelFamily', data.modelFamily)
        fd.append('trainLora', data.trainLora ? 'true' : 'false')
        if (data.trainLora) {
          const { primaryCastTrainer, trainingCostUsd } = await import('@cinema/core')
          fd.append('confirmedCostUsd', String(trainingCostUsd(primaryCastTrainer(), 1000)))
          fd.append('subjectConsent', 'true')
        }
        data.referenceImages.forEach((f) => fd.append('images', f))
        const res = await fetch('/api/vault/character/create', {
          method: 'POST',
          body: fd,
          credentials: 'include',
        })
        if (!res.ok) {
          const body = await res.json().catch((err) => {
            console.warn("[caught] src/components/panels/CharacterCastPanel.tsx:75", err instanceof Error ? { name: err.name, message: err.message } : err)
            return (({}))
          }) as { error?: string }
          throw new Error(body.error ?? 'Create failed')
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['vault-characters', 'user'] })
      toast.success(`${data.name} added to vault`)
    } catch (err) {
      console.warn("[caught] src/components/panels/CharacterCastPanel.tsx:81", err instanceof Error ? { name: err.name, message: err.message } : err)

      toast.error('Could not create character')
    } finally {
      setCreating(false)
    }
  }

  const removeCharacter = async (id: string, name: string) => {
    await fetch(`/api/vault/character/${id}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['vault-characters', 'user'] })
    toast.info(`${name} removed`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-section flex items-center justify-between">
        <span className="panel-label flex items-center gap-1.5">
          <Users size={10} className="text-[var(--teal-bright)]" />
          Cast ({characters.length})
        </span>
        <button
          onClick={() => setOnboardingOpen(true)}
          className="w-5 h-5 rounded bg-[var(--teal-glow)] text-[var(--teal-bright)] hover:bg-[rgba(0,229,200,0.18)] flex items-center justify-center"
        >
          <Plus size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {(isLoading || creating) && (
          <div className="flex justify-center py-3">
            <Loader2 size={14} className="text-[var(--text-tertiary)] animate-spin" />
          </div>
        )}

        {!isLoading && !creating && characters.length === 0 && (
          <div className="text-center py-8">
            <Users size={28} className="text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-[11px] text-[var(--text-tertiary)]">No characters yet</p>
            <button
              onClick={() => setOnboardingOpen(true)}
              className="mt-2 text-[11px] text-[var(--teal-bright)] hover:text-[#00f0d5] transition-colors"
            >
              + Add character
            </button>
          </div>
        )}

        {characters.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('characterId', c.id)}
            onClick={() => setForgeCastId(c.id)}
            className="cinema-card flex items-center gap-2 cursor-pointer group"
          >
            {c.referenceUrls[0] ? (
              <img src={c.referenceUrls[0]} alt={c.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-active)] flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-[var(--text-tertiary)]">{c.name[0]}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{c.name}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] capitalize">{c.loraStatus.toLowerCase()}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void removeCharacter(c.id, c.name)
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-all"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      <CharacterOnboarding
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        onComplete={handleOnboardingComplete}
        projectId={createProjectId ?? editorProjectId ?? ''}
      />

      {forgeCastId && (
        <ForgeCastPanel characterId={forgeCastId} onClose={() => setForgeCastId(null)} />
      )}
    </div>
  )
}
