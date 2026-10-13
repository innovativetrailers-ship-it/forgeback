'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePlaybackStore } from '@/store/playbackStore'
import { useCollabStore } from '@/store/collabStore'
import type { PresenceState } from '@/lib/collab/presence'

const POLL_INTERVAL_MS = 5000
const PUSH_INTERVAL_MS = 2000

export function PresenceBar({ projectId }: { projectId: string }) {
  const { data: session } = useSession()
  const playheadTime = usePlaybackStore((s) => s.playheadTime)
  const { peers, setPeers, ownPlayheadTime, setOwnPlayheadTime } = useCollabStore()
  const lastPushedTime = useRef<number>(-1)
  const pushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch(`/api/collab/presence?projectId=${encodeURIComponent(projectId)}`)
      if (!res.ok) return
      const data = (await res.json()) as { presence: PresenceState[] }
      const myId = session?.user?.id
      setPeers(data.presence.filter((p) => p.userId !== myId))
    } catch (err) {
      console.warn("[caught] src/components/editor/PresenceBar.tsx:26", err instanceof Error ? { name: err.name, message: err.message } : err)

      // silently ignore network errors for presence
    }
  }, [projectId, session?.user?.id, setPeers])

  const pushPresence = useCallback(async (time: number) => {
    if (!session?.user?.id) return
    try {
      await fetch('/api/collab/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          displayName: session.user.name ?? 'Unknown',
          avatarUrl: session.user.image ?? null,
          playheadTime: time,
        }),
      })
    } catch (err) {
      console.warn("[caught] src/components/editor/PresenceBar.tsx:44", err instanceof Error ? { name: err.name, message: err.message } : err)

      // silently ignore
    }
  }, [projectId, session])

  // Poll peers
  useEffect(() => {
    fetchPresence()
    const pollTimer = setInterval(fetchPresence, POLL_INTERVAL_MS)
    return () => clearInterval(pollTimer)
  }, [fetchPresence])

  // Push own position when playhead changes
  useEffect(() => {
    if (Math.abs(playheadTime - lastPushedTime.current) < 0.1) return
    setOwnPlayheadTime(playheadTime)

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      lastPushedTime.current = playheadTime
      void pushPresence(playheadTime)
    }, PUSH_INTERVAL_MS)
  }, [playheadTime, pushPresence, setOwnPlayheadTime])

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    }
  }, [])

  if (peers.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 px-2" aria-label="Active collaborators">
      {peers.map((peer) => (
        <PeerAvatar key={peer.userId} peer={peer} />
      ))}
    </div>
  )
}

function PeerAvatar({ peer }: { peer: PresenceState }) {
  const initials = peer.displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <div className="relative group">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 overflow-hidden"
        style={{ borderColor: peer.color, border: `2px solid ${peer.color}` }}
        title={peer.displayName}
      >
        {peer.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={peer.avatarUrl} alt={peer.displayName} className="w-full h-full object-cover" />
        ) : (
          <span style={{ backgroundColor: peer.color + '33' }}>{initials}</span>
        )}
      </div>

      {/* Tooltip */}
      <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none">
        <div className="bg-[#1a1f2e] border border-[#2a3040] rounded px-2 py-1 text-[10px] whitespace-nowrap text-white shadow-lg">
          <div className="font-semibold">{peer.displayName}</div>
          <div className="text-gray-400">{formatTime(peer.playheadTime)}</div>
          {peer.selectedClipId && (
            <div className="text-gray-500 text-[9px]">editing clip</div>
          )}
        </div>
        <div
          className="w-1.5 h-1.5 rotate-45 -mt-0.5"
          style={{ backgroundColor: '#1a1f2e' }}
        />
      </div>
    </div>
  )
}

/** Ghost cursor lines rendered on the timeline — exported so Timeline.tsx can import */
export interface GhostCursor {
  userId: string
  color: string
  playheadTime: number
  displayName: string
}

export function useGhostCursors(): GhostCursor[] {
  const peers = useCollabStore((s) => s.peers)
  return peers.map((p) => ({
    userId: p.userId,
    color: p.color,
    playheadTime: p.playheadTime,
    displayName: p.displayName,
  }))
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
