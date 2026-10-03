'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { usePlaybackStore } from '@/store/playbackStore'
import { useScriptStore } from '@/store/scriptStore'
import { useCollabStore } from '@/store/collabStore'
import { useUIStore } from '@/store/ui'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import type { PresenceState } from '@/lib/collab/presence'

/**
 * Subscribe to project collab SSE and apply remote recipe/script into the
 * canonical playback + script stores. Presence heartbeats go through Redis.
 */
export function useProjectCollab(projectId: string | null): void {
  const { data: session } = useSession()
  const setRecipe = usePlaybackStore((s) => s.setRecipe)
  const setScript = useScriptStore((s) => s.setScript)
  const setPeers = useCollabStore((s) => s.setPeers)
  const addToast = useUIStore((s) => s.addToast)
  const ownSelectedClipId = useCollabStore((s) => s.ownSelectedClipId)
  const playheadTime = usePlaybackStore((s) => s.playheadTime)
  const scriptContent = useScriptStore((s) => s.scriptContent)
  const lastScriptOrigin = useScriptStore((s) => s.lastScriptOrigin)
  const scriptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void fetch(`/api/projects/${projectId}/collab/doc`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { doc?: { script?: { value?: string } } } | null) => {
        if (cancelled || !data?.doc) return
        if (typeof data.doc.script?.value === 'string' && data.doc.script.value) {
          setScript(data.doc.script.value, 'collab')
        }
      })
      .catch((err) => logCaught('hooks/useProjectCollab', err))
    return () => { cancelled = true }
  }, [projectId, setRecipe, setScript])

  useEffect(() => {
    if (!projectId) return
    const source = new EventSource(`/api/projects/${projectId}/collab/stream`)
    const myId = session?.user?.id

    const onPresence = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { peers?: PresenceState[] }
        const peers = (data.peers ?? []).filter((p) => p.userId !== myId)
        setPeers(peers)
      } catch (err) {
        console.warn("[caught] src/hooks/useProjectCollab.ts:55", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    }
    const onHello = (ev: MessageEvent) => {
      onPresence(ev)
      try {
        const data = JSON.parse(ev.data) as { recipe?: TimelineRecipe }
        if (data.recipe && data.recipe.projectId === projectId) setRecipe(data.recipe, 'collab')
      } catch (err) {
        console.warn('[collab]', err instanceof Error ? err.message : err)
      }
    }
    const onDoc = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          recipe?: TimelineRecipe
          script?: string
          actor?: string
          warnings?: Array<{ type: string; clipId: string }>
        }
        if (data.actor && data.actor === myId) return
        if (data.recipe && data.recipe.projectId === projectId) {
          setRecipe(data.recipe, 'collab')
        }
        if (typeof data.script === 'string') {
          setScript(data.script, 'collab')
        }
        if (data.warnings?.length) {
          for (const w of data.warnings) {
            addToast(`Same-clip last-write on ${w.clipId.slice(-6)}`, 'warning')
          }
        }
      } catch (err) {
        console.warn("[caught] src/hooks/useProjectCollab.ts:78", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    }
    const onConflict = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { warnings?: Array<{ clipId: string }> }
        useCollabStore.getState().setActiveConflictCount(data.warnings?.length ?? 0)
      } catch (err) {
        console.warn("[caught] src/hooks/useProjectCollab.ts:84", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    }

    source.addEventListener('hello', onHello)
    source.addEventListener('presence', onPresence)
    source.addEventListener('doc', onDoc)
    source.addEventListener('conflict', onConflict)
    return () => {
      source.close()
    }
  }, [projectId, session?.user?.id, setRecipe, setScript, setPeers, addToast])

  useEffect(() => {
    if (!projectId || !session?.user?.id) return
    const push = () => {
      void fetch('/api/collab/presence', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          displayName: session.user?.name ?? 'Unknown',
          avatarUrl: session.user?.image ?? null,
          playheadTime,
          selectedClipId: ownSelectedClipId,
        }),
      }).catch((err) => logCaught('hooks/useProjectCollab', err))
    }
    push()
    const id = setInterval(push, 8000)
    return () => clearInterval(id)
  }, [projectId, session, playheadTime, ownSelectedClipId])

  useEffect(() => {
    if (!projectId || lastScriptOrigin === 'collab') return
    if (scriptTimer.current) clearTimeout(scriptTimer.current)
    scriptTimer.current = setTimeout(() => {
      void fetch(`/api/projects/${projectId}/collab/doc`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptContent }),
      }).catch((err) => logCaught('hooks/useProjectCollab', err))
    }, 800)
    return () => {
      if (scriptTimer.current) clearTimeout(scriptTimer.current)
    }
  }, [projectId, scriptContent, lastScriptOrigin])
}
