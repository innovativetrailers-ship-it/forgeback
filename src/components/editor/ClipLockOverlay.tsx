'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useCollabStore } from '@/store/collabStore'

interface Props {
  clipId: string
  projectId: string
}

export function ClipLockOverlay({ clipId, projectId }: Props) {
  const { data: session } = useSession()
  const myUserId = (session?.user as { id?: string } | null | undefined)?.id ?? ''
  const peers = useCollabStore((s) => s.peers)

  const [lockedBy, setLockedBy] = useState<string | null>(null)
  const [myLock, setMyLock] = useState(false)

  const fetchLocks = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/collab/lock?projectId=${encodeURIComponent(projectId)}`, {
        headers: { 'x-user-id': myUserId },
      })
      if (!res.ok) return
      const data = (await res.json()) as { locks: Record<string, string> }
      const holder = data.locks[clipId] ?? null
      setLockedBy(holder)
      setMyLock(holder === myUserId)
    } catch (err) {
      console.warn("[caught] src/components/editor/ClipLockOverlay.tsx:31", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
  }, [projectId, clipId, myUserId])

  useEffect(() => {
    void fetchLocks()
    const id = setInterval(fetchLocks, 15_000)
    return () => clearInterval(id)
  }, [fetchLocks])

  const handleRelease = useCallback(async () => {
    await fetch(`/api/collab/lock/${clipId}?projectId=${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers: { 'x-user-id': myUserId },
    })
    setLockedBy(null)
    setMyLock(false)
  }, [clipId, projectId, myUserId])

  if (!lockedBy) return null

  const holderPeer = peers.find((p) => p.userId === lockedBy)
  const holderName = holderPeer?.displayName ?? lockedBy.slice(0, 8)
  const holderColor = holderPeer?.color ?? '#f97316'

  return (
    <div
      className="absolute top-1 right-1 z-20 flex items-center gap-1"
      title={myLock ? 'You have this clip locked — click to release' : `Locked by ${holderName}`}
    >
      {myLock ? (
        <button
          onClick={handleRelease}
          className="w-4 h-4 flex items-center justify-center rounded bg-[#00e5c8]/20 border border-[#00e5c8]/40 hover:bg-[#00e5c8]/30 transition"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <rect x="1" y="3" width="6" height="4.5" rx="0.5" stroke="#00e5c8" strokeWidth="0.8"/>
            <path d="M2.5 3V2a1.5 1.5 0 013 0v1" stroke="#00e5c8" strokeWidth="0.8"/>
          </svg>
        </button>
      ) : (
        <div
          className="w-4 h-4 flex items-center justify-center rounded"
          style={{ backgroundColor: `${holderColor}30`, border: `1px solid ${holderColor}60` }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <rect x="1" y="3" width="6" height="4.5" rx="0.5" stroke={holderColor} strokeWidth="0.8"/>
            <path d="M2.5 3V2a1.5 1.5 0 013 0v1" stroke={holderColor} strokeWidth="0.8"/>
            <line x1="2.5" y1="3" x2="5.5" y2="3" stroke={holderColor} strokeWidth="0.6"/>
          </svg>
        </div>
      )}
    </div>
  )
}
