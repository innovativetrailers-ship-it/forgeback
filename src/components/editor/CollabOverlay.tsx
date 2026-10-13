'use client'

import { usePlaybackStore } from '@/store/playbackStore'
import { PresenceBar } from './PresenceBar'
import { ConflictToast } from './ConflictToast'
import { useProjectCollab } from '@/hooks/useProjectCollab'

/**
 * Mounts presence + conflict watchers once a project is loaded.
 * Canonical project id is playbackStore (FIX-K); editor store is the Simple leftover.
 */
export function CollabOverlay() {
  const playbackProjectId = usePlaybackStore((s) => s.projectId)
  const editorProjectId = usePlaybackStore((s) => s.recipe?.projectId ?? null)
  const projectId = playbackProjectId || editorProjectId

  useProjectCollab(projectId)

  if (!projectId) return null

  return (
    <>
      <PresenceBar projectId={projectId} />
      <ConflictToast projectId={projectId} />
    </>
  )
}
