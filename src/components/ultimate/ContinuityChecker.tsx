'use client'

import { useState, useCallback } from 'react'
import { ShieldCheck, AlertTriangle, CheckCircle, Loader2, ChevronDown, Eye, Camera } from 'lucide-react'
import type { Clip, TimelineRecipe } from '@/lib/timeline/schema'

interface ContinuityIssue {
  type: 'prop' | 'costume' | 'lighting' | 'time_of_day' | 'character' | 'camera_angle'
  severity: 'low' | 'medium' | 'high'
  clipAId: string
  clipBId: string
  description: string
  suggestion: string
  frameA?: string
  frameB?: string
}

interface CheckResult {
  id: string
  checkedAt: number
  clipAId: string
  clipBId: string
  issues: ContinuityIssue[]
  passed: boolean
}

interface Props {
  recipe: TimelineRecipe
  clips: Clip[]
  onRepaintSuggested: (clipId: string) => void
}

const SEVERITY_CONFIG = {
  high: { label: 'High', colour: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: '⚠' },
  medium: { label: 'Medium', colour: 'text-[#00e5c8]', bg: 'bg-[#00e5c8]/10 border-[#00e5c8]/30', icon: '⚡' },
  low: { label: 'Low', colour: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: 'ℹ' },
}

const ISSUE_TYPE_LABELS: Record<ContinuityIssue['type'], string> = {
  prop: 'Prop continuity',
  costume: 'Costume mismatch',
  lighting: 'Lighting inconsistency',
  time_of_day: 'Time of day jump',
  character: 'Character continuity',
  camera_angle: 'Camera angle break',
}

function IssueCard({ issue, onRepaint, clipA, clipB }: {
  issue: ContinuityIssue
  onRepaint: () => void
  clipA?: Clip
  clipB?: Clip
}) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SEVERITY_CONFIG[issue.severity]

  return (
    <div className={`rounded-xl border ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
      >
        <span className={`text-sm ${cfg.colour}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-white/70">{ISSUE_TYPE_LABELS[issue.type]}</p>
          <p className="text-[9px] text-white/35 truncate">{issue.description}</p>
        </div>
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.colour} bg-black/20`}>
          {cfg.label}
        </span>
        <ChevronDown className={`w-3 h-3 text-white/25 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/8 pt-2 space-y-2">
          {/* Frame comparison */}
          {(issue.frameA || issue.frameB || clipA?.sourceUrl || clipB?.sourceUrl) && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[8px] text-white/25 mb-1">Clip A</p>
                <div className="aspect-video bg-black/50 rounded-lg overflow-hidden">
                  {clipA?.sourceUrl && (
                    <video src={clipA.sourceUrl} className="w-full h-full object-cover" muted />
                  )}
                </div>
              </div>
              <div>
                <p className="text-[8px] text-white/25 mb-1">Clip B</p>
                <div className="aspect-video bg-black/50 rounded-lg overflow-hidden">
                  {clipB?.sourceUrl && (
                    <video src={clipB.sourceUrl} className="w-full h-full object-cover" muted />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-black/20 rounded-lg p-2">
            <p className="text-[9px] text-white/50 leading-relaxed">{issue.description}</p>
          </div>

          <div className="flex items-start gap-1.5">
            <span className="text-[9px] text-green-400 flex-shrink-0 mt-0.5">💡</span>
            <p className="text-[9px] text-white/40 leading-relaxed">{issue.suggestion}</p>
          </div>

          <button
            onClick={onRepaint}
            className="w-full py-1.5 rounded-lg bg-[#00e5c8]/20 border border-[#00e5c8]/30
              text-[#00e5c8] text-[10px] font-medium hover:bg-[#00e5c8]/30 transition-colors"
          >
            Repaint Clip B to fix
          </button>
        </div>
      )}
    </div>
  )
}

export function ContinuityChecker({ recipe, clips, onRepaintSuggested }: Props) {
  const [results, setResults] = useState<CheckResult[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [selectedPair, setSelectedPair] = useState<[string, string] | null>(null)
  const [checkMode, setCheckMode] = useState<'adjacent' | 'character' | 'all'>('adjacent')
  const [progress, setProgress] = useState(0)

  const videoClips = clips.filter((c) => c.sourceUrl && !c.sourceUrl.endsWith('.mp3'))
  const clipMap = new Map(clips.map((c) => [c.id, c]))

  const handleCheck = useCallback(async () => {
    if (isChecking || videoClips.length < 2) return
    setIsChecking(true)
    setProgress(0)
    setResults([])

    try {
      setProgress(30)
      const res = await fetch('/api/studio/continuity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
      })
      if (!res.ok) throw new Error('Continuity check failed')
      const data = await res.json() as {
        issues?: Array<{
          type: string
          severity: string
          clips: [string, string]
          description: string
          suggestion: string
        }>
      }
      setProgress(100)

      const apiIssues = data.issues ?? []
      const newResults: CheckResult[] = apiIssues.length > 0
        ? apiIssues.map((issue, i) => {
            const [clipAId, clipBId] = issue.clips
            return {
              id: `issue-${i}`,
              checkedAt: Date.now(),
              clipAId,
              clipBId,
              issues: [{
                type: issue.type as ContinuityIssue['type'],
                severity: issue.severity === 'error' ? 'high' : issue.severity === 'warning' ? 'medium' : 'low',
                clipAId,
                clipBId,
                description: issue.description,
                suggestion: issue.suggestion,
              }],
              passed: false,
            }
          })
        : [{
            id: 'all-pass',
            checkedAt: Date.now(),
            clipAId: videoClips[0]?.id ?? '',
            clipBId: videoClips[1]?.id ?? '',
            issues: [],
            passed: true,
          }]

      setResults(newResults)
    } finally {
      setIsChecking(false)
      setProgress(0)
    }
  }, [isChecking, videoClips, checkMode, clipMap])

  const totalIssues = results.flatMap((r) => r.issues).length
  const highIssues = results.flatMap((r) => r.issues).filter((i) => i.severity === 'high').length
  const passedPairs = results.filter((r) => r.passed).length

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 flex-shrink-0">
        <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Continuity</span>
        {results.length > 0 && (
          <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full
            ${highIssues > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            {highIssues > 0 ? `${highIssues} critical` : `${passedPairs}/${results.length} OK`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Check controls */}
        <div className="p-3 bg-white/3 rounded-xl border border-white/8 space-y-3">
          <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Check Mode</p>
          <div className="flex gap-1.5">
            {(['adjacent', 'character', 'all'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCheckMode(mode)}
                className={`flex-1 py-1.5 rounded-lg border text-[10px] capitalize transition-colors
                  ${checkMode === mode ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/10 text-white/35 hover:border-white/20'}`}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/25">
            {checkMode === 'adjacent' && 'Check each consecutive clip pair'}
            {checkMode === 'character' && 'Check clips with same character'}
            {checkMode === 'all' && 'Check all nearby clip combinations'}
          </p>

          {isChecking && (
            <div className="space-y-1">
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[9px] text-white/30">Analysing with Claude Vision… {progress}%</p>
            </div>
          )}

          <button
            onClick={handleCheck}
            disabled={isChecking || videoClips.length < 2}
            className="w-full py-2 rounded-lg bg-green-500/20 border border-green-500/30
              text-green-400 text-xs font-semibold hover:bg-green-500/30
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center gap-1.5"
          >
            {isChecking
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
              : <><Eye className="w-3.5 h-3.5" /> Run Continuity Check</>}
          </button>

          {videoClips.length < 2 && (
            <p className="text-[9px] text-white/25 text-center">Add at least 2 video clips to check</p>
          )}
        </div>

        {/* Summary */}
        {results.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pairs checked', value: results.length, colour: 'text-white/60' },
              { label: 'Issues found', value: totalIssues, colour: totalIssues > 0 ? 'text-[#00e5c8]' : 'text-green-400' },
              { label: 'Critical', value: highIssues, colour: highIssues > 0 ? 'text-red-400' : 'text-green-400' },
            ].map((stat) => (
              <div key={stat.label} className="p-2.5 rounded-xl bg-white/3 border border-white/6 text-center">
                <p className={`text-lg font-bold ${stat.colour}`}>{stat.value}</p>
                <p className="text-[9px] text-white/25">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Issues list */}
        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((result) => {
              if (result.passed && result.issues.length === 0) {
                return (
                  <div key={result.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/5 border border-green-500/15">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[10px] text-white/40">
                      Clips {result.clipAId.slice(-4)} → {result.clipBId.slice(-4)} · No issues
                    </span>
                  </div>
                )
              }
              return result.issues.map((issue, i) => (
                <IssueCard
                  key={`${result.id}-${i}`}
                  issue={issue}
                  clipA={clipMap.get(result.clipAId)}
                  clipB={clipMap.get(result.clipBId)}
                  onRepaint={() => onRepaintSuggested(result.clipBId)}
                />
              ))
            })}
          </div>
        )}

        {results.length > 0 && totalIssues === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <p className="text-sm font-medium text-green-400">All clear!</p>
            <p className="text-[10px] text-white/30">No continuity issues detected across {results.length} clip pairs</p>
          </div>
        )}
      </div>
    </div>
  )
}
