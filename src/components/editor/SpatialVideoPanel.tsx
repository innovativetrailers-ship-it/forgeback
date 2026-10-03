'use client'

import { useState, useCallback } from 'react'
import type { SpatialClipData } from '@/lib/spatial/SpatialImport'

type Phase = 'idle' | 'detecting' | 'detected' | 'exporting' | 'done' | 'error'

const FORMAT_LABELS: Record<string, { label: string; badge: string; compatible: boolean }> = {
  'mv-hevc': { label: 'Apple Spatial (MV-HEVC)', badge: '✓ Vision Pro Ready', compatible: true },
  'sbs-3d': { label: 'Side-by-Side 3D', badge: '✓ Vision Pro Ready', compatible: true },
  'tab-3d': { label: 'Top-and-Bottom 3D', badge: '⚠ Conversion required', compatible: false },
  '2d': { label: 'Standard 2D', badge: '⚠ Conversion required', compatible: false },
}

export function SpatialVideoPanel() {
  const [importUrl, setImportUrl] = useState('')
  const [leftEyeUrl, setLeftEyeUrl] = useState('')
  const [rightEyeUrl, setRightEyeUrl] = useState('')
  const [clipData, setClipData] = useState<SpatialClipData | null>(null)
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleDetect = useCallback(async () => {
    if (!importUrl.trim()) return
    setPhase('detecting')
    setError(null)
    try {
      const res = await fetch('/api/spatial/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`); setPhase('error'); return }
      setClipData(data.clipData as SpatialClipData)
      setPhase('detected')
    } catch (e: unknown) {
      console.warn("[caught] src/components/editor/SpatialVideoPanel.tsx:38", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Network error')
      setPhase('error')
    }
  }, [importUrl])

  const handleExport = useCallback(async () => {
    if (!leftEyeUrl.trim() || !rightEyeUrl.trim()) return
    setPhase('exporting')
    setError(null)
    try {
      const res = await fetch('/api/spatial/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leftEyeUrl, rightEyeUrl }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`); setPhase('error'); return }
      setExportUrl(data.mvhevcUrl as string)
      setPhase('done')
    } catch (e: unknown) {
      console.warn("[caught] src/components/editor/SpatialVideoPanel.tsx:58", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Network error')
      setPhase('error')
    }
  }, [leftEyeUrl, rightEyeUrl])

  const formatInfo = clipData ? FORMAT_LABELS[clipData.format] : null

  return (
    <div className="p-3 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Spatial Video</h3>

      {/* Import section */}
      <div className="space-y-2">
        <p className="text-[9px] text-white/30 uppercase tracking-wider">Import Spatial Clip</p>
        <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)}
          placeholder="Paste .mv-hevc or SBS video URL…"
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-white/20 outline-none focus:border-[#00e5c8]/40" />
        <button onClick={handleDetect} disabled={!importUrl.trim() || phase === 'detecting'}
          className="w-full py-1.5 rounded-lg text-[10px] font-semibold bg-[#1a1f2e] text-white/60 hover:text-white hover:bg-[#1a1f2e]/80 border border-white/10 disabled:opacity-40 transition">
          {phase === 'detecting' ? 'Detecting…' : 'Detect Format'}
        </button>

        {clipData && formatInfo && (
          <div className="rounded-lg bg-[#1a1f2e] p-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-white/70">{formatInfo.label}</p>
              <p className="text-[9px] text-white/30">{clipData.metadata.width}×{clipData.metadata.height} · {clipData.metadata.fps}fps</p>
            </div>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
              formatInfo.compatible ? 'bg-[#00e5c8]/10 text-[#00e5c8]' : 'bg-amber-400/10 text-amber-400'
            }`}>{formatInfo.badge}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-white/6" />

      {/* Export section */}
      <div className="space-y-2">
        <p className="text-[9px] text-white/30 uppercase tracking-wider">Export for Vision Pro</p>
        <p className="text-[9px] text-white/20 leading-relaxed">Provide left-eye and right-eye video URLs to encode Apple Immersive Video (MV-HEVC).</p>
        <input value={leftEyeUrl} onChange={(e) => setLeftEyeUrl(e.target.value)}
          placeholder="Left eye URL…"
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-white/20 outline-none focus:border-[#00e5c8]/40" />
        <input value={rightEyeUrl} onChange={(e) => setRightEyeUrl(e.target.value)}
          placeholder="Right eye URL…"
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-white/20 outline-none focus:border-[#00e5c8]/40" />
        <button onClick={handleExport} disabled={!leftEyeUrl.trim() || !rightEyeUrl.trim() || phase === 'exporting'}
          className="w-full py-2 rounded-lg text-[11px] font-semibold bg-[#00e5c8] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00e5c8]/90 transition flex items-center justify-center gap-1.5">
          {phase === 'exporting' ? (
            <><div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />Encoding…</>
          ) : 'Export for Vision Pro'}
        </button>

        {phase === 'done' && exportUrl && (
          <a href={exportUrl} download="spatial-video.mov"
            className="block w-full py-1.5 text-center rounded-lg text-[10px] font-semibold border border-[#00e5c8]/30 text-[#00e5c8] hover:bg-[#00e5c8]/10 transition">
            Download .mov
          </a>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
          <p className="text-[10px] text-red-400">{error}</p>
          <button onClick={() => { setError(null); setPhase('idle') }} className="text-[9px] text-red-400/60 hover:text-red-400 mt-1">Retry</button>
        </div>
      )}
    </div>
  )
}
