'use client'

import { useState, useCallback } from 'react'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useUIStore } from '@/store/ui'

interface SessionState {
  sessionId: string
  broadcastUrl: string
}

export function CameraIngestPanel() {
  const recipe = useEditorRecipeView()
  const addToast = useUIStore((s) => s.addToast)

  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(false)
  const [chunkCount, setChunkCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const startSession = useCallback(async () => {
    if (!recipe?.projectId) { setError('No project loaded'); return }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/camera/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: recipe.projectId }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`); return }
      setSession({ sessionId: data.sessionId as string, broadcastUrl: data.broadcastUrl as string })
      addToast('Camera session started', 'success')
    } catch (e: unknown) {
      console.warn("[caught] src/components/editor/CameraIngestPanel.tsx:37", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [recipe, addToast])

  const stopSession = useCallback(async () => {
    if (!session) return
    try {
      await fetch(`/api/camera/session/${session.sessionId}/stop`, { method: 'POST' })
      setSession(null)
      setChunkCount(0)
      addToast('Camera session stopped', 'info')
    } catch (err) {
      console.warn("[caught] src/components/editor/CameraIngestPanel.tsx:51", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
  }, [session, addToast])

  const copyLink = useCallback(async () => {
    if (!session) return
    await navigator.clipboard.writeText(session.broadcastUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [session])

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Wireless Camera</h3>
        {session && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] text-red-400 font-semibold">LIVE</span>
          </div>
        )}
      </div>

      {!session ? (
        <>
          <p className="text-[10px] text-white/30 leading-relaxed">
            Stream directly from your iPhone camera to the timeline in real-time.
          </p>
          {error && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
              <p className="text-[10px] text-red-400">{error}</p>
            </div>
          )}
          <button onClick={startSession} disabled={loading || !recipe?.projectId}
            className="w-full py-2 rounded-lg text-[11px] font-semibold bg-[#00e5c8] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00e5c8]/90 transition flex items-center justify-center gap-1.5">
            {loading ? (
              <><div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />Starting…</>
            ) : 'Start Live Camera'}
          </button>
        </>
      ) : (
        <>
          {/* QR code */}
          <div className="rounded-lg bg-[#1a1f2e] p-3 flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(session.broadcastUrl)}&bgcolor=1a1f2e&color=00e5c8&margin=0`}
              alt="Camera QR code"
              className="rounded w-[140px] h-[140px]"
              width={140} height={140}
            />
            <p className="text-[9px] text-white/30 text-center">Scan with iPhone camera</p>
          </div>

          {/* Copy link */}
          <button onClick={copyLink}
            className="w-full py-1.5 rounded-lg text-[10px] border border-white/10 text-white/50 hover:border-white/20 hover:text-white/70 transition">
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>

          {/* Chunk status */}
          <div className="rounded-lg bg-[#1a1f2e] p-2 text-[10px] text-white/40 flex items-center justify-between">
            <span>Chunks received</span>
            <span className="font-mono text-[#00e5c8]">{chunkCount}</span>
          </div>

          {/* Stop button */}
          <button onClick={stopSession}
            className="w-full py-2 rounded-lg text-[11px] font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition">
            Stop Recording
          </button>
        </>
      )}
    </div>
  )
}
