'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { subscribeJobStream } from '@/lib/jobs/subscribeJobStream'
import { jobPlaybackPath } from '@/lib/media/jobPlayback'
import type { ShotPlanCard } from '@/lib/studio/shotPlan'
import type { DirectShotArgs } from '@/lib/types/shot'
import { AwaitingDirectionCard } from '@/components/ultimate/AwaitingDirectionCard'
import { presentShotFailure, type ShotActionJson } from '@/components/ultimate/shotAction'
import { useStudioStore } from '@/store/editor'
import { usePlaybackStore } from '@/store/playbackStore'

interface Props {
  projectId: string
  script: string
  selectedModels: string[]
  mode: 'draft' | 'production'
  targetDuration: number
  onShotCompleted: (
    shotId: string,
    videoUrl: string,
    duration: number,
    extras?: { posterUrl?: string; jobId?: string },
  ) => void
  onShotReset?: (shotIds: string[]) => void
  onShotsReloaded?: (shots: ShotPlanCard[]) => void
}

export function ShotPlanPanel({
  projectId,
  script,
  selectedModels,
  mode,
  targetDuration,
  onShotCompleted,
  onShotReset,
  onShotsReloaded,
}: Props) {
  const [shots, setShots] = useState<ShotPlanCard[]>([])
  const [parsing, setParsing] = useState(false)
  const [totalCost, setTotalCost] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)
  const [directError, setDirectError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const shotsKey = useRef('')
  const jobEventShot = useRef<string | null>(null)

  const reload = useCallback(() => {
    if (!projectId) return Promise.resolve([] as ShotPlanCard[])
    return fetch(`/api/projects/${projectId}/shots`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { shots?: ShotPlanCard[]; totalCost?: number }) => {
        const next = d.shots ?? []
        setShots(next)
        setTotalCost(d.totalCost ?? 0)
        const key = next.map((shot) => `${shot.id}:${shot.status}:${shot.videoUrl ?? ''}`).join('|')
        if (key !== shotsKey.current) {
          shotsKey.current = key
          onShotsReloaded?.(next)
        }
        return next
      })
      .catch((err) => {
        console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:63", err instanceof Error ? { name: err.name, message: err.message } : err)
        return ([] as ShotPlanCard[])
      })
  }, [projectId, onShotsReloaded])

  useEffect(() => {
    shotsKey.current = ''
  }, [projectId])

  useEffect(() => { void reload() }, [reload])

  const awaitingShot = shots.find((s) => s.status === 'awaiting_direction')
  const generatingShot = shots.find((s) => s.status === 'generating')

  useEffect(() => {
    if (!generatingShot) return
    const id = setInterval(() => { void reload() }, 3000)
    return () => clearInterval(id)
  }, [generatingShot, reload])

  const generatingId = generatingShot?.id
  useEffect(() => {
    if (!generatingId) return
    const timer = window.setTimeout(() => {
      if (jobEventShot.current !== generatingId) void reload()
    }, 20_000)
    return () => window.clearTimeout(timer)
  }, [generatingId, reload])

  async function handleParse() {
    if (!script.trim() || !selectedModels.length) return
    setParsing(true)
    setParseError(null)
    try {
      const res = await fetch('/api/studio/parse', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          script,
          selectedModels,
          duration: targetDuration,
          mode,
          qualityTier: useStudioStore.getState().activeTier,
        }),
      })
      const data = await res.json() as { shots?: ShotPlanCard[]; totalCost?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Parse failed')
      const next = data.shots ?? []
      setShots(next)
      setTotalCost(data.totalCost ?? 0)
      onShotsReloaded?.(next)
    } catch (err) {
      console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:114", err instanceof Error ? { name: err.name, message: err.message } : err)

      setParseError(err instanceof Error ? err.message : 'Parse failed')
    } finally {
      setParsing(false)
    }
  }

  function noteShotFailure(shotId: string, res: Response, data: ShotActionJson, failLabel: string) {
    const plan = presentShotFailure(res.status, data, failLabel)
    setDirectError(plan.message)
    const nextStatus = plan.cardStatus
    if (nextStatus) {
      setShots((rows) => rows.map((sh) => (sh.id === shotId ? { ...sh, status: nextStatus } : sh)))
    }
  }

  async function handleDirect(args: DirectShotArgs) {
    if (submittingId) return
    setDirectError(null)
    setSubmittingId(args.shotId)
    try {
      const res = await fetch('/api/studio/shot/direct', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shotPlanId: args.shotId,
          projectId,
          mode,
          prompt: args.prompt,
          anchorSource: args.anchorSource,
          anchorFrameUrl: args.anchorFrameUrl,
          modelOverride: args.modelOverride,
          directionNotes: args.directionNotes,
          qualityTier: useStudioStore.getState().activeTier,
        }),
      })
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:153", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({ error: 'Request failed' }))
      }) as ShotActionJson
      if (!res.ok) {
        noteShotFailure(args.shotId, res, data, 'Could not direct shot')
        await reload()
        return
      }

      const jobId = data.jobId
      if (!jobId) {
        setDirectError('Could not direct shot')
        await reload()
        return
      }
      const shot = shots.find((s) => s.id === args.shotId)
      jobEventShot.current = null
      await reload()

      const markEvent = () => { jobEventShot.current = args.shotId }
      subscribeJobStream(jobId, {
        onProgress: markEvent,
        onComplete: (outputUrl) => {
          markEvent()
          void reload().then((fresh) => {
            const updated = fresh.find((s) => s.id === args.shotId)
            const playUrl = jobPlaybackPath(jobId) ?? outputUrl
            onShotCompleted(
              args.shotId,
              playUrl,
              updated?.duration ?? shot?.duration ?? 5,
              { jobId, posterUrl: updated?.lastFrame },
            )
          })
          setTimeout(() => { void reload() }, 1500)
        },
        onFailed: (error) => {
          markEvent()
          setDirectError(error || 'Could not direct shot')
          void reload()
        },
      })
    } finally {
      setSubmittingId(null)
    }
  }

  async function shotAction(
    url: string,
    failLabel: string,
    shotId?: string,
  ): Promise<{ ok: true; data: unknown } | { ok: false }> {
    const res = await fetch(url, { method: 'POST', credentials: 'include' })
    const data = await res.json().catch((err) => {
      console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:204", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    }) as ShotActionJson
    if (!res.ok) {
      if (shotId) noteShotFailure(shotId, res, data, failLabel)
      else setDirectError(typeof data.error === 'string' ? data.error : failLabel)
      await reload()
      return { ok: false }
    }
    return { ok: true, data }
  }

  async function handleRegenerate(shot: ShotPlanCard) {
    const result = await shotAction(
      `/api/studio/shot/${shot.id}/reset`,
      'Cannot reset this shot right now',
      shot.id,
    )
    if (!result.ok) return
    const data = result.data as { demotedShotIds?: string[] }
    onShotReset?.(data.demotedShotIds ?? [shot.id])
    await reload()
  }

  async function handleMarkFailed(shot: ShotPlanCard) {
    await shotAction(`/api/studio/shot/${shot.id}/fail`, 'Could not mark shot as failed', shot.id)
    await reload()
  }

  const completedCount = shots.filter((s) => s.status === 'completed' || s.status === 'manual').length

  return (
    <div className="flex flex-col border border-white/10 rounded-xl overflow-hidden bg-[#0d0d14]">
      {totalCost > 0 && (
        <div className="px-3 py-2 border-b border-white/8 flex justify-between text-[10px]">
          <span className="text-white/40">{completedCount}/{shots.length} shots ready</span>
          <span className="text-[#00e5c8]">~{totalCost} credits</span>
        </div>
      )}

      {awaitingShot && (
        <div className="flex-shrink-0 p-2 border-b border-white/8">
          <AwaitingDirectionCard
            shot={awaitingShot}
            projectId={projectId}
            selectedModels={selectedModels}
            onDirect={handleDirect}
            onAnchorChange={(id, url, source) =>
              setShots((s) => s.map((sh) =>
                sh.id === id ? { ...sh, anchorFrameUrl: url, anchorSource: source } : sh,
              ))
            }
          />
        </div>
      )}

      {submittingId && !generatingShot && (
        <div className="flex-shrink-0 px-3 py-2 bg-white/5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-white/50" />
            <span className="text-[11px] text-white/50">Sending shot…</span>
          </div>
        </div>
      )}

      {generatingShot && (
        <div className="flex-shrink-0 px-3 py-2 bg-yellow-900/20 border-b border-yellow-800/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />
              <span className="text-[11px] text-yellow-300">
                Generating Shot {generatingShot.shotNumber}…
              </span>
              <span
                className="text-[10px] text-white/40"
                title={generatingShot.delegationReason ?? generatingShot.assignedModel}
              >
                {generatingShot.modelOverride ?? generatingShot.assignedModel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleMarkFailed(generatingShot)}
              className="text-[9px] text-yellow-400/70 hover:text-yellow-300 underline"
            >
              Mark failed
            </button>
          </div>
        </div>
      )}

      {shots.filter((shot) => shot.chainBlock).map((shot) => (
        <ChainAttention
          key={shot.id}
          projectId={projectId}
          shot={shot}
          onDone={() => void reload()}
        />
      ))}

      <div className="max-h-[240px] overflow-y-auto px-2 py-2 space-y-1">
        {shots.length === 0 ? (
          <p className="text-[10px] text-white/30 text-center py-4">
            Parse your script to build a shot-by-shot direction plan
          </p>
        ) : (
          shots
            .filter((s) => s.status !== 'awaiting_direction')
            .map((shot) => (
              <CompactShotRow
                key={shot.id}
                shot={shot}
                projectId={projectId}
                onRegenerate={() => void handleRegenerate(shot)}
                onRated={() => void reload()}
              />
            ))
        )}
      </div>

      <div className="p-2 border-t border-white/8 space-y-1.5">
        {parseError && <p className="text-[10px] text-red-400 text-center">{parseError}</p>}
        {directError && <p className="text-[10px] text-red-400 text-center">{directError}</p>}
        <button
          type="button"
          onClick={() => void handleParse()}
          disabled={parsing || !script.trim() || !selectedModels.length}
          className="w-full py-2 rounded-lg bg-teal-600/80 hover:bg-teal-500 disabled:opacity-40 text-white text-[11px] font-semibold"
        >
          {parsing ? (
            <>
              <Loader2 className="inline w-3 h-3 animate-spin mr-1" />
              Planning…
            </>
          ) : (
            '✦ Parse & Plan Shots'
          )}
        </button>
      </div>
    </div>
  )
}

function ChainAttention({
  projectId,
  shot,
  onDone,
}: {
  projectId: string
  shot: ShotPlanCard
  onDone: () => void
}) {
  const [prompt, setPrompt] = useState(shot.prompt)
  const [error, setError] = useState<string | null>(null)
  const waiting = shot.chainBlock === 'await_approval'
  const reason = shot.directionNotes?.trim()
    || shot.lastError?.userMessage
    || (waiting
      ? `Shot ${shot.shotNumber} is waiting for a continuity decision.`
      : `Shot ${shot.shotNumber} failed. The next shot is waiting.`)
  async function act(action: 'retry' | 'alter' | 'break' | 'approve') {
    setError(null)
    const res = await fetch(`/api/studio/shot/${shot.id}/chain`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, projectId, prompt: action === 'alter' ? prompt : undefined }),
    })
    const data = await res.json().catch((err) => {
      console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:365", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    })
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not update the chain')
      return
    }
    if (action === 'retry' || action === 'alter') {
      const generated = await fetch('/api/studio/shot/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shotPlanId: shot.id,
          projectId,
          overridePrompt: action === 'alter' ? prompt : undefined,
        }),
      })
      const body = await generated.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:381", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      })
      if (!generated.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not regenerate this shot')
        return
      }
    }
    onDone()
  }
  return (
    <div className="mx-2 mt-2 rounded border border-amber-700/60 bg-amber-950/40 p-2 space-y-2">
      <p className="text-[11px] text-amber-100">{reason}</p>
      {(shot.anchorFrameUrl || shot.lastFrame) && (
        <div className="flex gap-2">
          {shot.anchorFrameUrl && (
            <img src={shot.anchorFrameUrl} alt="Previous shot end" className="h-16 w-28 object-cover rounded" />
          )}
          {shot.lastFrame && (
            <img src={shot.lastFrame} alt="This shot" className="h-16 w-28 object-cover rounded" />
          )}
        </div>
      )}
      {!waiting && shot.lastError && (
        <ShotFailActions shot={shot} projectId={projectId} onDone={onDone} />
      )}
      <textarea
        aria-label="Alter prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded p-1.5 text-[11px] text-white"
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void act('approve')} className="text-[10px] text-teal-300">Accept</button>
        <button type="button" onClick={() => void act('retry')} className="text-[10px] text-teal-300">Retry</button>
        <button type="button" onClick={() => void act('alter')} className="text-[10px] text-teal-300">Adjust</button>
        <button type="button" onClick={() => void act('break')} className="text-[10px] text-amber-200">Break chain and continue independently</button>
      </div>
      {error && <p className="text-[10px] text-red-300">{error}</p>}
    </div>
  )
}

function CompactShotRow({
  shot,
  projectId,
  onRegenerate,
  onRated,
}: {
  shot: ShotPlanCard
  projectId: string
  onRegenerate: () => void
  onRated: () => void
}) {
  const statusClass =
    shot.status === 'completed' ? 'bg-teal-900/60 text-teal-400'
    : shot.status === 'failed' ? 'bg-red-900/60 text-red-400'
    : shot.status === 'manual' ? 'bg-blue-900/60 text-blue-400'
    : shot.status === 'generating' ? 'bg-yellow-900/60 text-yellow-400'
    : 'bg-white/8 text-white/40'

  const thumb = shot.lastFrame ?? shot.videoUrl
  const finished = shot.status === 'completed' || shot.status === 'manual'
  const [rating, setRating] = useState(shot.rating)
  const [askWhy, setAskWhy] = useState(Boolean(shot.rating && !shot.rating.worked))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setRating(shot.rating)
    setAskWhy(Boolean(shot.rating && !shot.rating.worked))
  }, [shot.rating])

  async function rate(thumbs: 'up' | 'down', reason?: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/studio/shot/${shot.id}/rate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbs, reason }),
      })
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/ShotPlanPanel.tsx:463", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as {
        error?: string
        score?: number
        worked?: boolean
        reason?: string | null
      }
      if (!res.ok) return
      setRating({
        score: data.score ?? (thumbs === 'up' ? 5 : 1),
        worked: data.worked ?? thumbs === 'up',
        reason: data.reason ?? reason ?? null,
      })
      setAskWhy(thumbs === 'down')
      onRated()
    } finally {
      setBusy(false)
    }
  }

  async function moveToLibrary() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/studio/shot/${shot.id}/library`, { method: 'POST' })
      if (!res.ok) return
    } finally {
      setBusy(false)
    }
  }

  async function removeShot() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/studio/shot/${shot.id}/remove`, { method: 'POST' })
      if (!res.ok) return
      usePlaybackStore.getState().suppressShot(shot.id)
      onRated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-1.5 px-2 rounded hover:bg-white/5">
      <div className="flex items-center gap-2">
        <div className="w-10 h-7 rounded overflow-hidden bg-black/40 flex-shrink-0">
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30 text-[9px]">
              {shot.shotNumber}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-white/60">Shot {shot.shotNumber}</span>
          <p className="text-[9px] text-white/35 truncate">{shot.prompt?.slice(0, 60) ?? ''}</p>
          <p
            className="text-[9px] text-teal-500/70 truncate"
            title={shot.delegationReason ?? 'Why this model is shown after parse and auto-route.'}
          >
            {shot.modelOverride ?? shot.assignedModel}
            {shot.purpose ? ` · ${shot.purpose}` : ''}
          </p>
        </div>

        <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusClass}`}>
          {shot.status === 'awaiting_direction' ? 'controls' : shot.status === 'completed' ? 'review' : shot.status === 'pending' ? 'directing' : shot.status.replace('_', ' ')}
        </span>

        {finished && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void rate('up')}
              className={`text-[12px] px-1 ${rating?.worked ? 'text-teal-300' : 'text-white/35 hover:text-white/80'}`}
              title="This shot worked"
              aria-label="Rate shot up"
            >
              👍
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void rate('down')}
              className={`text-[12px] px-1 ${rating && !rating.worked ? 'text-red-300' : 'text-white/35 hover:text-white/80'}`}
              title="This shot missed"
              aria-label="Rate shot down"
            >
              👎
            </button>
          </div>
        )}

        {finished && (shot.videoUrl || shot.lastFrame) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void moveToLibrary()}
            className="text-[10px] text-teal-300/80 hover:text-teal-200 flex-shrink-0"
            title="Add this shot to the library"
          >
            Library
          </button>
        )}
        {finished && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void removeShot()}
            className="text-[10px] text-red-300/80 hover:text-red-200 flex-shrink-0"
            title="Delete this shot"
          >
            Delete
          </button>
        )}

        {(shot.status === 'completed' || shot.status === 'failed') && (
          <button
            type="button"
            onClick={onRegenerate}
            className={`text-[10px] flex-shrink-0 ${shot.status === 'failed' ? 'text-red-400 hover:text-red-300' : 'text-white/40 hover:text-white/70'}`}
            title={shot.status === 'failed' ? 'Re-generate this shot' : 'Re-open controls and render again'}
          >
            {shot.status === 'failed' ? 'Re-generate' : '↺'}
          </button>
        )}
      </div>
      {shot.status === 'failed' && shot.lastError && (
        <div className="pl-12 pt-1">
          <ShotFailActions shot={shot} projectId={projectId} onDone={onRegenerate} />
        </div>
      )}
      {finished && shot.lastQuality && shot.lastQuality.verdict !== 'pass' && (
        <p className="pl-12 pt-1 text-[10px] text-amber-200">
          Quality: {shot.lastQuality.reason ?? shot.lastQuality.dimension ?? shot.lastQuality.verdict}
        </p>
      )}
      {finished && askWhy && (
        <div className="pl-12 pt-1 space-y-1">
          <p className="text-[9px] text-white/45">{shot.ratingPrompt ?? 'What missed?'}</p>
          <div className="flex flex-wrap gap-1">
            {(shot.failReasons ?? [{ id: 'other', label: 'Other' }]).map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={busy}
                onClick={() => void rate('down', chip.id)}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  rating?.reason === chip.id
                    ? 'border-red-400/70 text-red-200'
                    : 'border-white/15 text-white/40 hover:text-white/70'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function actionLabel(action: string): string {
  switch (action) {
    case 'alter_prompt': return 'Alter prompt'
    case 'reduce_refs': return 'Edit refs'
    case 'change_model': return 'Change model'
    case 'wait_retry': return 'Retry'
    case 'reduce_duration': return 'Shorten duration'
    default: return 'Retry'
  }
}

function ShotFailActions({
  shot,
  projectId,
  onDone,
}: {
  shot: ShotPlanCard
  projectId: string
  onDone: () => void
}) {
  const err = shot.lastError
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!err) return null

  async function retry(overridePrompt?: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/studio/shot/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotPlanId: shot.id, projectId, overridePrompt }),
      })
      if (res.ok) onDone()
    } finally {
      setBusy(false)
    }
  }

  async function autofix() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/studio/shot/${shot.id}/error/autofix`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return
      await retry()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-red-200">{err.userMessage}</p>
      <div className="flex flex-wrap gap-2">
        {err.correctable && (
          <button type="button" disabled={busy} onClick={() => void autofix()} className="text-[10px] text-teal-300">
            Auto-fix & retry
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void retry()}
          className="text-[10px] text-teal-300"
        >
          {actionLabel(err.suggestedAction)}
        </button>
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-[10px] text-white/40">
          {advanced ? 'Hide details' : 'Technical details'}
        </button>
      </div>
      {advanced && (
        <pre className="text-[9px] text-white/40 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {err.rawError}
          {err.providerLogs?.length ? `\n\n${err.providerLogs.join('\n')}` : ''}
        </pre>
      )}
    </div>
  )
}
