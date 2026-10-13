'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useUIStore } from '@/store/ui'
import { applyRoughCutToRecipe, type CutStyle, type CutTone, type RoughCutResult } from '@/lib/editing/roughCutShape'

interface RoughCutDialogProps {
  open: boolean
  onClose: () => void
}

type Phase = 'configure' | 'generating' | 'preview' | 'error'

const STYLE_OPTIONS: Array<{ value: CutStyle; label: string; icon: string }> = [
  { value: 'fast-paced',  label: 'Fast-Paced',  icon: '⚡' },
  { value: 'cinematic',   label: 'Cinematic',    icon: '🎬' },
  { value: 'documentary', label: 'Documentary',  icon: '📹' },
  { value: 'interview',   label: 'Interview',    icon: '🎤' },
  { value: 'music-video', label: 'Music Video',  icon: '🎵' },
]

const TONE_OPTIONS: Array<{ value: CutTone; label: string; icon: string }> = [
  { value: 'energetic', label: 'Energetic', icon: '🔥' },
  { value: 'serious',   label: 'Serious',   icon: '🎭' },
  { value: 'humorous',  label: 'Humorous',  icon: '😄' },
  { value: 'emotional', label: 'Emotional', icon: '💎' },
]

export function RoughCutDialog({ open, onClose }: RoughCutDialogProps) {
  const recipe = useEditorRecipeView()
  const setRecipe = useEditorStore((s) => s.setRecipe)
  const addToast = useUIStore((s) => s.addToast)

  const [phase, setPhase] = useState<Phase>('configure')
  const [style, setStyle] = useState<CutStyle>('cinematic')
  const [tone, setTone] = useState<CutTone>('serious')
  const [targetDuration, setTargetDuration] = useState(300)
  const [result, setResult] = useState<RoughCutResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) {
      setPhase('configure')
      setResult(null)
      setErrorMessage('')
    }
    return () => { abortRef.current?.abort() }
  }, [open])

  const allClips = recipe
    ? recipe.tracks.flatMap((t) =>
        t.clips.map((c) => ({
          id: c.id,
          prompt: c.prompt ?? '',
          duration: c.duration,
          trackId: t.id,
          videoUrl: c.videoUrl ?? null,
        })),
      )
    : []

  const totalAvailable = allClips.reduce((sum, c) => sum + c.duration, 0)
  const clipCount = allClips.length

  const handleGenerate = useCallback(async () => {
    if (!recipe || clipCount === 0) {
      setErrorMessage('No clips in timeline to assemble.')
      setPhase('error')
      return
    }

    setPhase('generating')
    setErrorMessage('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/rough-cut/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: recipe.projectId,
          clips: allClips,
          targetDuration,
          style,
          tone,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = (await res.json()) as Record<string, unknown>
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      }

      const body = (await res.json()) as { result: RoughCutResult }
      setResult(body.result)
      setPhase('preview')
    } catch (err: unknown) {
      console.warn("[caught] src/components/editor/RoughCutDialog.tsx:103", err instanceof Error ? { name: err.name, message: err.message } : err)

      if (err instanceof DOMException && err.name === 'AbortError') return
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setPhase('error')
    }
  }, [recipe, clipCount, allClips, targetDuration, style, tone])

  const handleApply = useCallback(() => {
    if (!recipe || !result) return
    const newRecipe = applyRoughCutToRecipe(recipe, result)
    setRecipe(newRecipe)
    addToast(`✂️ Rough cut applied — ${result.selections.length} clips, ${Math.round(result.totalDuration)}s`, 'success')
    onClose()
  }, [recipe, result, setRecipe, addToast, onClose])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setPhase('configure')
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'generating') onClose() }}
    >
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <span>✂️</span> AI Rough Cut Copilot
          </h2>
          {phase !== 'generating' && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Configure */}
        {phase === 'configure' && (
          <div className="space-y-5">
            <div className="rounded-lg bg-[#1a1f2e] p-3 text-sm text-white/60">
              <span className="font-medium text-white">{clipCount}</span> clips ·{' '}
              <span className="font-medium text-white">{Math.round(totalAvailable)}s</span> available
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">Target Duration (seconds)</label>
              <input
                type="number" min={5} max={3600} step={5} value={targetDuration}
                onChange={(e) => setTargetDuration(Math.max(5, Number(e.target.value)))}
                className="w-full rounded-lg border border-white/10 bg-[#1a1f2e] px-3 py-2 text-sm text-white outline-none transition focus:border-[#00e5c8] focus:ring-1 focus:ring-[#00e5c8]"
              />
              {targetDuration > totalAvailable && totalAvailable > 0 && (
                <p className="mt-1 text-xs text-amber-400">
                  ⚠ Target exceeds available material by {Math.round(targetDuration - totalAvailable)}s
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">Cut Style</label>
              <div className="grid grid-cols-5 gap-2">
                {STYLE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setStyle(opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition ${
                      style === opt.value
                        ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                        : 'border-white/10 bg-[#1a1f2e] text-white/50 hover:border-white/20 hover:text-white/70'
                    }`}>
                    <span className="text-base">{opt.icon}</span>
                    <span className="leading-tight text-center">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">Emotional Tone</label>
              <div className="grid grid-cols-4 gap-2">
                {TONE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setTone(opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition ${
                      tone === opt.value
                        ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                        : 'border-white/10 bg-[#1a1f2e] text-white/50 hover:border-white/20 hover:text-white/70'
                    }`}>
                    <span className="text-base">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-white/40">Cost: 10 credits</span>
              <button
                onClick={handleGenerate} disabled={clipCount === 0}
                className="rounded-lg bg-[#00e5c8] px-5 py-2 text-sm font-semibold text-[#0d1117] transition hover:bg-[#00e5c8]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Generate Rough Cut
              </button>
            </div>
          </div>
        )}

        {/* Generating */}
        {phase === 'generating' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#00e5c8]/30 border-t-[#00e5c8]" />
            <p className="text-sm text-white/60">Analysing {clipCount} clips for {style} {tone} cut…</p>
            <p className="text-xs text-white/30">This typically takes 5–15 seconds</p>
            <button onClick={handleCancel}
              className="mt-2 rounded-md px-4 py-1.5 text-xs text-white/40 transition hover:bg-white/10 hover:text-white/70">
              Cancel
            </button>
          </div>
        )}

        {/* Preview */}
        {phase === 'preview' && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: result.selections.length, label: 'Clips Selected', color: 'text-[#00e5c8]' },
                { value: `${Math.round(result.totalDuration)}s`, label: 'Total Duration', color: 'text-white' },
                { value: result.brollGaps.length, label: 'B-Roll Gaps', color: 'text-amber-400' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-[#1a1f2e] p-3 text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-white/50">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-[#1a1f2e] p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-white/40">Editor Notes</p>
              <p className="text-sm leading-relaxed text-white/70">{result.styleNotes}</p>
            </div>

            <div className="max-h-40 overflow-y-auto rounded-lg bg-[#1a1f2e] p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">Sequence</p>
              <ol className="space-y-1.5">
                {result.selections.map((sel, i) => (
                  <li key={sel.clipId} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 rounded bg-[#00e5c8]/20 px-1.5 py-0.5 font-mono text-[#00e5c8]">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <span className="text-white/60">{sel.duration.toFixed(1)}s</span>
                      <span className="ml-1 text-white/30">— {sel.reason}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {result.brollGaps.length > 0 && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                <p className="mb-1 text-xs font-medium text-amber-400">B-Roll Suggestions</p>
                {result.brollGaps.map((gap, i) => (
                  <p key={i} className="text-xs text-amber-400/70">
                    • {gap.startTime}s–{gap.startTime + gap.duration}s: {gap.suggestion}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setPhase('configure')}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white">
                Reconfigure
              </button>
              <button onClick={handleApply}
                className="rounded-lg bg-[#00e5c8] px-5 py-2 text-sm font-semibold text-[#0d1117] transition hover:bg-[#00e5c8]/90">
                Apply to Timeline
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <p className="mb-1 text-sm font-medium text-red-400">Rough cut generation failed</p>
              <p className="text-xs text-red-400/70">{errorMessage}</p>
            </div>
            <p className="text-xs text-white/40">Credits have been refunded. Adjust parameters and try again.</p>
            <div className="flex justify-end">
              <button onClick={() => setPhase('configure')}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white">
                Back to Configuration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
