'use client'

import { useState, useCallback } from 'react'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'

interface ExportResult {
  sequencerUrl: string
  manifestUrl: string
  sequencerName: string
  clipCount: number
}

type Phase = 'idle' | 'exporting' | 'done' | 'error'

export function UnrealExportDialog() {
  const recipe = useEditorRecipeView()
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clipCount = recipe?.tracks.reduce((n, t) => n + t.clips.length, 0) ?? 0
  const fps = recipe?.fps ?? 24
  const res = recipe?.resolution ?? { width: 1920, height: 1080 }

  const handleExport = useCallback(async () => {
    if (!recipe?.projectId) { setError('No project loaded'); return }
    setPhase('exporting')
    setError(null)

    try {
      const res = await fetch('/api/ue5/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: recipe.projectId, recipe }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`); setPhase('error'); return }
      setResult(data as unknown as ExportResult)
      setPhase('done')
    } catch (e: unknown) {
      console.warn("[caught] src/components/editor/UnrealExportDialog.tsx:40", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Network error')
      setPhase('error')
    }
  }, [recipe])

  if (!recipe) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[120px]">
        <p className="text-[11px] text-white/30">No project loaded</p>
      </div>
    )
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Unreal Engine Export</h3>

      {/* Project summary */}
      <div className="rounded-lg bg-[#1a1f2e] p-2 space-y-1">
        {[
          { label: 'Clips', value: String(clipCount) },
          { label: 'Frame Rate', value: `${fps} fps` },
          { label: 'Resolution', value: `${res.width}×${res.height}` },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[9px] text-white/30">{label}</span>
            <span className="text-[10px] text-white/60 font-mono">{value}</span>
          </div>
        ))}
      </div>

      {/* Result */}
      {phase === 'done' && result && (
        <div className="rounded-lg bg-[#00e5c8]/5 border border-[#00e5c8]/20 p-2 space-y-2">
          <p className="text-[10px] text-[#00e5c8] font-medium">✓ Export complete — {result.clipCount} clips</p>
          <div className="space-y-1.5">
            <a href={result.sequencerUrl} download={`${result.sequencerName}.udatasmith`}
              className="flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white transition">
              <span className="text-[#00e5c8]">↓</span> Download Sequencer (.udatasmith)
            </a>
            <a href={result.manifestUrl} download={`${result.sequencerName}.manifest.json`}
              className="flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white transition">
              <span className="text-[#00e5c8]">↓</span> Download Manifest (.json)
            </a>
          </div>
          <div className="border-t border-white/6 pt-2">
            <p className="text-[9px] text-white/30 font-semibold mb-1">Import into Unreal Engine 5:</p>
            <ol className="text-[9px] text-white/20 space-y-0.5 list-decimal list-inside">
              <li>Download the .udatasmith file above</li>
              <li>Open UE5 → File → Import into Level</li>
              <li>Select the .udatasmith file</li>
              <li>Your timeline appears in Sequencer</li>
            </ol>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
          <p className="text-[10px] text-red-400">{error}</p>
          <button onClick={() => { setPhase('idle'); setError(null) }}
            className="text-[9px] text-red-400/60 hover:text-red-400 mt-1">Retry</button>
        </div>
      )}

      {/* Export button */}
      <button onClick={handleExport} disabled={phase === 'exporting' || clipCount === 0}
        className="w-full py-2 rounded-lg text-[11px] font-semibold bg-[#00e5c8] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00e5c8]/90 transition flex items-center justify-center gap-1.5">
        {phase === 'exporting' ? (
          <><div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />Generating…</>
        ) : 'Export to Unreal Engine'}
      </button>
      {clipCount === 0 && <p className="text-[9px] text-white/20 text-center">Add clips to the timeline first</p>}
    </div>
  )
}
