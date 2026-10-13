'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PresenceState } from '@/lib/collab/presence'

interface Activity {
  id: string
  userId: string
  color: string
  action: string
  timestamp: number
}

function formatRelativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export function ActivityFeed({ projectId }: { projectId: string }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [tick, setTick] = useState(0)
  const prevPeersRef = useRef<Map<string, PresenceState>>(new Map())

  const addActivity = useCallback((userId: string, color: string, action: string) => {
    setActivities((prev) => [
      { id: `${userId}-${Date.now()}`, userId, color, action, timestamp: Date.now() },
      ...prev,
    ].slice(0, 10))
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/collab/presence?projectId=${encodeURIComponent(projectId)}`)
      if (!res.ok) return
      const data = (await res.json()) as { peers: PresenceState[] }
      const currentPeers = data.peers ?? []
      const prevPeers = prevPeersRef.current

      // Detect joins
      for (const peer of currentPeers) {
        if (!prevPeers.has(peer.userId)) {
          addActivity(peer.userId, peer.color, `${peer.displayName} joined`)
        }
      }

      // Detect leaves
      prevPeers.forEach((peer, uid) => {
        if (!currentPeers.find((p) => p.userId === uid)) {
          addActivity(uid, peer.color, `${peer.displayName} left`)
        }
      })

      // Detect significant playhead moves (>10s)
      for (const peer of currentPeers) {
        const prev = prevPeers.get(peer.userId)
        if (prev && Math.abs(peer.playheadTime - prev.playheadTime) > 10) {
          addActivity(peer.userId, peer.color, `${peer.displayName} jumped to ${formatTime(peer.playheadTime)}`)
        }
      }

      // Detect clip selections
      for (const peer of currentPeers) {
        const prev = prevPeers.get(peer.userId)
        if (prev && peer.selectedClipId !== prev.selectedClipId && peer.selectedClipId) {
          addActivity(peer.userId, peer.color, `${peer.displayName} selected a clip`)
        }
      }

      // Update ref
      const newMap = new Map<string, PresenceState>()
      currentPeers.forEach((p) => newMap.set(p.userId, p))
      prevPeersRef.current = newMap
    } catch (err) {
      console.warn("[caught] src/components/editor/ActivityFeed.tsx:81", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
  }, [projectId, addActivity])

  useEffect(() => {
    void poll()
    const id = setInterval(() => {
      void poll()
      setTick((t) => t + 1)  // force re-render for relative timestamps
    }, 5000)
    return () => clearInterval(id)
  }, [poll])

  if (activities.length === 0) {
    return (
      <div className="w-40 p-2 text-[9px] text-white/20 text-center">
        No activity yet
      </div>
    )
  }

  return (
    <div className="w-40 rounded-lg bg-[#0d1117]/90 border border-white/8 backdrop-blur overflow-hidden">
      <div className="px-2 py-1.5 border-b border-white/6">
        <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider">Activity</p>
      </div>
      <div className="divide-y divide-white/4 max-h-48 overflow-y-auto">
        {activities.map((a) => (
          <div key={a.id} className="px-2 py-1.5 flex items-start gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full mt-0.5 flex-shrink-0"
              style={{ backgroundColor: a.color }}
            />
            <div className="min-w-0">
              <p className="text-[9px] text-white/60 leading-tight truncate">{a.action}</p>
              <p className="text-[8px] text-white/20 mt-0.5">{formatRelativeTime(a.timestamp)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
