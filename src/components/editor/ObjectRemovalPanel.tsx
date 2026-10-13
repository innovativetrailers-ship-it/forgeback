'use client'

import { useState, useCallback, useRef } from 'react'
import { useEditorStore } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useUIStore } from '@/store/ui'
import type { BlendMode } from '@/lib/vfx/ObjectRemoval'

const BLEND_MODES: Array<{ value: BlendMode; label: string; hint: string }> = [
  { value: 'seamless', label: 'Seamless', hint: 'Highest quality, ~2 min' },
  { value: 'conservative', label: 'Conservative', hint: 'Safer results, ~90s' },
  { value: 'aggressive', label: 'Aggressive', hint: 'Fastest, ~45s' },
]

const QUICK_OBJECTS = ['Person', 'Microphone', 'Logo', 'Vehicle', 'Sign', 'Watermark']

type Phase = 'idle' | 'processing' | 'done' | 'error'

export function ObjectRemovalPanel() {
  const recipe = useEditorRecipeView()
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const addToast = useUIStore((s) => s.addToast)

  const [description, setDescription] = useState('')
  const [includeArtifacts, setIncludeArtifacts] = useState(true)
  const [blendMode, setBlendMode] = useState<BlendMode>('seamless')
  const [phase, setPhase] = useState<Phase>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedClip = recipe?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId) ?? null

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback((jid: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jid}/status`)
        if (!res.ok) return
        const data = (await res.json()) as Record<string, unknown>
        if (data.status === 'COMPLETE') {
          stopPolling()
          setPhase('done')
          addToast('Object removed successfully', 'success')
          if (typeof data.outputUrl === 'string' && selectedClipId && recipe) {
            const updatedTracks = recipe.tracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => c.id === selectedClipId ? { ...c, sourceUrl: data.outputUrl as string } : c),
            }))
            useEditorStore.getState().setRecipe({ ...recipe, tracks: updatedTracks })
          }
        } else if (data.status === 'FAILED') {
          stopPolling()
          setPhase('error')
          setErrorMsg('Removal failed. Try a simpler scene (less shadows).')
        }
      } catch (err) {
        console.warn("[caught] src/components/editor/ObjectRemovalPanel.tsx:60", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore poll errors */ }
    }, 5000)
  }, [stopPolling, addToast, selectedClipId, recipe])

  const handleRemove = useCallback(async () => {
    if (!selectedClip || !description.trim()) return
    setPhase('processing')
    setErrorMsg(null)
    setJobId(null)

    try {
      const res = await fetch('/api/vfx/object-remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: selectedClip.id,
          videoUrl: selectedClip.videoUrl ?? '',
          objectDescription: description.trim(),
          includeArtifacts,
          blendMode,
        }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setPhase('error')
        setErrorMsg(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
        return
      }
      const jid = data.jobId as string
      setJobId(jid)
      startPolling(jid)
    } catch (e: unknown) {
      console.warn("[caught] src/components/editor/ObjectRemovalPanel.tsx:91", e instanceof Error ? { name: e.name, message: e.message } : e)

      setPhase('error')
      setErrorMsg(e instanceof Error ? e.message : 'Network error')
    }
  }, [selectedClip, description, includeArtifacts, blendMode, startPolling])

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-2 min-h-[120px]">
        <p className="text-[11px] text-white/30 text-center">Select a clip to remove objects from it</p>
      </div>
    )
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Object Removal</h3>

      {/* Quick selects */}
      <div className="flex flex-wrap gap-1">
        {QUICK_OBJECTS.map((obj) => (
          <button key={obj} onClick={() => setDescription(obj)}
            className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/40 hover:border-white/20 hover:text-white/60 transition">
            {obj}
          </button>
        ))}
      </div>

      {/* Description */}
      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="What should I remove? e.g. 'person in red jacket', 'microphone stand'"
        rows={2} disabled={phase === 'processing'}
        className="w-full bg-[#0d1117] border border-white/10 rounded-lg p-2 text-[11px] text-white placeholder-white/20 resize-none outline-none focus:border-[#00e5c8]/40 disabled:opacity-50" />

      {/* Remove shadows toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={includeArtifacts} onChange={(e) => setIncludeArtifacts(e.target.checked)}
          disabled={phase === 'processing'}
          className="rounded accent-[#00e5c8]" />
        <span className="text-[10px] text-white/50">Remove shadows &amp; reflections</span>
      </label>

      {/* Blend mode */}
      <div>
        <p className="text-[9px] text-white/30 mb-1 uppercase tracking-wider">Blend Mode</p>
        <div className="space-y-1">
          {BLEND_MODES.map((m) => (
            <button key={m.value} onClick={() => setBlendMode(m.value)}
              disabled={phase === 'processing'}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-[10px] transition ${
                blendMode === m.value
                  ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                  : 'border-white/10 text-white/40 hover:border-white/20'
              } disabled:opacity-50`}>
              <span className="font-medium">{m.label}</span>
              <span className="text-[9px] opacity-60">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Status messages */}
      {phase === 'processing' && jobId && (
        <div className="rounded-lg bg-[#1a1f2e] p-2 text-[10px] text-white/50">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border border-[#00e5c8]/30 border-t-[#00e5c8] rounded-full animate-spin" />
            Removing… this takes 2-3 minutes
          </div>
          <div className="text-[9px] text-white/20 mt-1 font-mono">{jobId}</div>
        </div>
      )}

      {phase === 'done' && (
        <div className="rounded-lg bg-[#00e5c8]/5 border border-[#00e5c8]/20 p-2 text-[10px] text-[#00e5c8]">
          ✓ Object removed and applied to clip
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
          <p className="text-[10px] text-red-400">{errorMsg}</p>
          <button onClick={() => setPhase('idle')}
            className="text-[9px] text-red-400/60 hover:text-red-400 mt-1">Retry</button>
        </div>
      )}

      {/* Remove button */}
      <button onClick={handleRemove} disabled={!description.trim() || phase === 'processing'}
        className="w-full py-2 rounded-lg text-[11px] font-semibold bg-[#00e5c8] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00e5c8]/90 transition">
        {phase === 'processing' ? 'Removing…' : 'Remove Object (20 credits)'}
      </button>
    </div>
  )
}
