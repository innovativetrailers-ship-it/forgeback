'use client'

import { useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useUIStore } from '@/store/ui'
import {
  computeArcPath, EMOTION_COLORS,
  isEmotionLatticeResult,
  type EmotionLatticeResult, type EmotionalBeat,
} from '@/lib/emotion/emotionShape'

const CHART_W = 240
const CHART_H = 80

const ARC_COLORS: Record<string, string> = {
  rising: '#22c55e', falling: '#ef4444', circular: '#00e5c8',
  broken: '#f97316', flat: '#64748b',
}

const PACE_RECS: Array<{ key: keyof EmotionLatticeResult['paceRecommendations']['recommendations']; label: string; color: string }> = [
  { key: 'cutFaster', label: 'Cut Faster', color: '#f97316' },
  { key: 'addSilence', label: 'Add Silence', color: '#3b82f6' },
  { key: 'increaseMusicProminence', label: 'More Music', color: '#8b5cf6' },
  { key: 'extendEmotionalMoments', label: 'Extend Moments', color: '#00e5c8' },
]

export function EmotionLatticePanel() {
  const recipe = useEditorRecipeView()
  const setPlayheadTime = useEditorStore((s) => s.setPlayheadTime)
  const addToast = useUIStore((s) => s.addToast)

  const [result, setResult] = useState<EmotionLatticeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clips = recipe
    ? recipe.tracks.flatMap((t) =>
        t.clips.map((c) => ({
          id: c.id,
          prompt: c.prompt ?? '',
          duration: c.duration,
          startTime: c.startTime,
        })),
      )
    : []

  const totalDuration = clips.reduce((sum, c) => Math.max(sum, c.startTime + c.duration), 0)
  const canAnalyse = clips.length >= 3

  const handleAnalyse = useCallback(async () => {
    if (!recipe || !canAnalyse) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/emotion/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: recipe.projectId, clips }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
        return
      }
      if (!isEmotionLatticeResult(data.result)) {
        setError('Unexpected response from analysis')
        return
      }
      setResult(data.result)
    } catch (e: unknown) {
      console.warn("[caught] src/components/panels/EmotionLatticePanel.tsx:72", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [recipe, clips, canAnalyse])

  const handleWeakPointClick = useCallback((timestamp: number, suggestion: string) => {
    setPlayheadTime(timestamp)
    addToast(`💡 ${suggestion}`, 'info')
  }, [setPlayheadTime, addToast])

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Emotion Guide</h3>
        <span className="text-[9px] text-white/30">{clips.length} clips · {Math.round(totalDuration)}s</span>
      </div>

      {/* Arc chart */}
      {result && (
        <div className="rounded-lg bg-[#1a1f2e] p-2">
          <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((p) => (
              <line key={p} x1={CHART_W * p} y1={0} x2={CHART_W * p} y2={CHART_H}
                stroke="#ffffff0a" strokeWidth={1} strokeDasharray="2 2" />
            ))}
            {/* Arc path */}
            <path d={computeArcPath(result.beats, CHART_W, CHART_H)}
              stroke="#00e5c8" strokeWidth={1.5} fill="none" />
            {/* Beat dots */}
            {result.beats.map((beat: EmotionalBeat) => {
              const x = (beat.timestamp / Math.max(totalDuration, 1)) * CHART_W
              const y = CHART_H - (beat.intensity / 10) * CHART_H
              return (
                <circle key={beat.clipId} cx={x} cy={y} r={3}
                  fill={EMOTION_COLORS[beat.emotion]} opacity={beat.confidence} />
              )
            })}
            {/* 3-act dividers */}
            {[result.threeActStructure.act1End, result.threeActStructure.act2End].map((t, i) => (
              <line key={i} x1={(t / Math.max(totalDuration, 1)) * CHART_W} y1={0}
                x2={(t / Math.max(totalDuration, 1)) * CHART_W} y2={CHART_H}
                stroke="#ffffff30" strokeWidth={1} />
            ))}
          </svg>

          {/* Overall arc + 3-act labels */}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${ARC_COLORS[result.overallArc]}20`, color: ARC_COLORS[result.overallArc] }}>
              {result.overallArc.charAt(0).toUpperCase() + result.overallArc.slice(1)} arc
            </span>
            <div className="flex gap-1 text-[8px] text-white/30">
              <span>I: {result.threeActStructure.act1Emotion}</span>
              <span>·</span>
              <span>II: {result.threeActStructure.act2Emotion}</span>
              <span>·</span>
              <span>III: {result.threeActStructure.act3Emotion}</span>
            </div>
          </div>
        </div>
      )}

      {/* Pacing recommendations */}
      {result && (
        <div className="flex flex-wrap gap-1">
          {PACE_RECS.filter((r) => result.paceRecommendations.recommendations[r.key]).map((r) => (
            <span key={r.key} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${r.color}20`, color: r.color }}>
              {r.label}
            </span>
          ))}
          {PACE_RECS.every((r) => !result.paceRecommendations.recommendations[r.key]) && (
            <span className="text-[9px] text-[#00e5c8]">✓ Pacing looks good</span>
          )}
        </div>
      )}

      {/* Weak points */}
      {result && result.weakPoints.length > 0 && (
        <div className="border-t border-white/6 pt-2">
          <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
            Pacing Issues ({result.weakPoints.length})
          </p>
          <div className="space-y-1">
            {result.weakPoints.map((wp, i) => (
              <button key={i} onClick={() => handleWeakPointClick(wp.timestamp, wp.suggestion)}
                className="w-full text-left p-2 rounded-lg bg-amber-400/5 border border-amber-400/20 hover:bg-amber-400/10 transition">
                <div className="text-[9px] font-medium text-amber-400">{wp.issue}</div>
                <div className="text-[9px] text-amber-400/60 mt-0.5">{wp.suggestion}</div>
                <div className="text-[8px] text-white/20 mt-0.5">{wp.timestamp.toFixed(1)}s</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      {/* Analyse button */}
      <button onClick={handleAnalyse} disabled={loading || !canAnalyse}
        className="w-full py-2 rounded-lg text-[11px] font-semibold transition bg-[#00e5c8] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00e5c8]/90 flex items-center justify-center gap-1.5">
        {loading ? (
          <><div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" /> Analysing…</>
        ) : (
          <>Analyse Emotional Arc {!canAnalyse && '(need 3+ clips)'}</>
        )}
      </button>
      {canAnalyse && <p className="text-[9px] text-white/20 text-center">5 credits · 2-3 minutes typical</p>}
    </div>
  )
}
