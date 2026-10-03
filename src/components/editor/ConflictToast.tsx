'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '@/store/ui'
import { useCollabStore } from '@/store/collabStore'
import type { ConflictRecord } from '@/lib/collab/conflict'

interface ConflictToastProps {
  projectId: string
}

const POLL_INTERVAL_MS = 10000

export function ConflictToast({ projectId }: ConflictToastProps) {
  const addToast = useUIStore((s) => s.addToast)
  const setActiveConflictCount = useCollabStore((s) => s.setActiveConflictCount)
  // Seen ids stay in a ref. A Zustand selector that returns `new Set()` every
  // call makes useSyncExternalStore re-render forever (React error #185).
  const seenConflictIds = useRef(new Set<string>())

  const checkConflicts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/collab/conflicts?projectId=${encodeURIComponent(projectId)}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as { conflicts: ConflictRecord[] }
      const conflicts = data.conflicts

      setActiveConflictCount(conflicts.length)

      for (const conflict of conflicts) {
        if (seenConflictIds.current.has(conflict.id)) continue
        seenConflictIds.current.add(conflict.id)

        const clipLabel = conflict.clipId.slice(-6)
        const resolutionLabel = conflict.resolution
          ? resolutionText(conflict.resolution)
          : 'pending review'

        addToast(
          `⚡ Conflict on clip …${clipLabel}: ${typeLabel(conflict.type)} by two editors. ${resolutionLabel}.`,
          'warning' as Parameters<typeof addToast>[1],
        )
      }
    } catch (err) {
      console.warn("[caught] src/components/editor/ConflictToast.tsx:44", err instanceof Error ? { name: err.name, message: err.message } : err)

      // silently ignore
    }
  }, [projectId, addToast, setActiveConflictCount])

  useEffect(() => {
    checkConflicts()
    const timer = setInterval(checkConflicts, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [checkConflicts])

  return null
}

function typeLabel(type: ConflictRecord['type']): string {
  switch (type) {
    case 'clip_move': return 'moved'
    case 'clip_delete': return 'deleted'
    case 'clip_resize': return 'resized'
    case 'track_reorder': return 'track reorder'
    default: return 'edited'
  }
}

function resolutionText(resolution: NonNullable<ConflictRecord['resolution']>): string {
  switch (resolution) {
    case 'user1_wins': return 'First edit kept'
    case 'user2_wins': return 'Latest edit kept'
    case 'merged': return 'Changes merged'
    default: return ''
  }
}
