import { logCaught } from '@/lib/diagnostics/caught'
// src/lib/orchestration/chainGeneration.ts
// Chains run in parallel across continuity groups; clips within each chain are strictly sequential.

import { consumeFromHold } from '@/lib/credits/escrow'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { extractVideoUrl } from '@/lib/fal/client'
import { pollFalResult } from '@/lib/fal/falQueue'
import { assertBudgetForSegment, BudgetCapReached } from './budget'
import { loadCheckpoint, saveCheckpoint } from './checkpoints'
import { resolveStartFrame } from './anchorPolicy'
import { callVideoModel, extractTailFrame, getModelTimeout, withTimeout } from './bridgedGeneration'
import { seedanceAssetRefs } from './seedanceRefs'
import type { GenerationMode } from './costGuard'
import { analyseFrameMotion, injectMotionContext }     from './opticalFlow'
import { continuityAgent, applyContinuity, type ContinuityState } from '@/lib/cognition/agents/continuityAgent'
import { gateChainLink, partitionContinuity, wanChainOutputSeconds, type GateMode } from '@cinema/core'
import { withGenContext, patchGen } from '@/lib/diagnostics/correlation'
import type { ContinuityChain, DAGNode, GeneratedSegment, PatientZeroAssets, StructuredShot } from './types'

const MAX_PARALLEL_CHAINS = 4 // legacy parallel path only

export class CanaryFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanaryFailure'
  }
}

export class ChainPaused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChainPaused'
  }
}

type ChainProgressFn = (
  shotIndex: number,
  status:    string,
  sub?:      { pct: number; message: string }
) => void

function segmentIdForShot(shotIndex: number): string {
  return `shot-${shotIndex}`
}

function chainCost(chain: ContinuityChain, dagByIndex: Map<number, DAGNode>): number {
  return chain.shots.reduce((sum, shot) => {
    const node = dagByIndex.get(shot.shotIndex)
    return sum + (node?.estimatedCost ?? 2)
  }, 0)
}

async function generateShot(
  shot:           StructuredShot,
  node:           DAGNode,
  assets:         PatientZeroAssets,
  anchorFrameUrl: string | undefined,
  continuity:     ContinuityState | null,
  onProgress:     ChainProgressFn,
  jobId:          string | undefined,
  onPoll:         (() => void | Promise<void>) | undefined,
  generationMode: GenerationMode,
  projectId?:     string,
  resolution?:    string,
  planIndex?:     number,
  chainFeed?:     { videos: string[]; images: Array<{ url: string; label?: string; role: 'character' | 'location'; primary?: boolean }>; duration: number },
): Promise<{ segment: GeneratedSegment; lastFrame: string | undefined; continuity: ContinuityState | null }> {
  const rowIndex = typeof planIndex === 'number' && Number.isFinite(planIndex)
    ? planIndex
    : (Number.isFinite(shot.shotIndex) ? shot.shotIndex : 0)
  const ordinal = Number.isFinite(shot.shotIndex) ? shot.shotIndex : rowIndex
  const segId = segmentIdForShot(ordinal)

  if (jobId) {
    const existing = await loadCheckpoint(jobId, segId)
    if (existing?.qaPassed) {
      const lastFrame = existing.anchorFrame ?? undefined
      if (projectId && existing.videoUrl) {
        const { markBatchClipCompleted } = await import('@/lib/studio/batchClipSync')
        await markBatchClipCompleted(projectId, rowIndex, existing.videoUrl, lastFrame).catch((err) => {
          console.warn('[director] checkpoint clip persist failed', err instanceof Error ? err.message : err)
        })
      }
      return {
        segment: {
          shotIndex:    ordinal,
          videoUrl:     existing.videoUrl,
          duration:     shot.duration,
          model:        existing.modelUsed,
          contentType:  shot.contentType,
          tailFrameUrl: lastFrame ?? '',
          qualityScore: 1.0,
          retryCount:   0,
        },
        lastFrame,
        continuity,
      }
    }
  }

  onProgress(ordinal, 'generating')

  if (projectId) {
    const { markBatchClipGenerating } = await import('@/lib/studio/batchClipSync')
    await markBatchClipGenerating(projectId, rowIndex).catch((err) => logCaught('lib/orchestration/chainGeneration', err))
  }

  if (jobId) {
    await assertBudgetForSegment(jobId, node.estimatedCost)
  }

  const rawPrompt = (shot.visualPrompt ?? (shot as { prompt?: string }).prompt ?? '').trim()
  if (!rawPrompt || rawPrompt.length < 3) {
    throw new Error(
      `Shot ${shot.shotIndex}: visualPrompt is empty or missing — check script breakdown`,
    )
  }
  let prompt = rawPrompt
  if (shot.playbookFragment) {
    prompt = `${prompt} ${shot.playbookFragment}`.trim()
  }
  if (node.shotMemory.length) {
    prompt = `${prompt}\n\nPROJECT CONTEXT: ${node.shotMemory.join(' ')}`
  }

  const feeding = Boolean(chainFeed)
  const anchorCtx = {
    isVeryFirstClipOfFilm: shot.isChainStart === true && !anchorFrameUrl && !shot.startsAtHardCut,
  }
  const startFrame = feeding ? undefined : resolveStartFrame(shot, anchorFrameUrl, anchorCtx)
  if (startFrame && startFrame === anchorFrameUrl && anchorFrameUrl) {
    try {
      const motion = await analyseFrameMotion(anchorFrameUrl)
      prompt = injectMotionContext(prompt, motion, { contentType: shot.contentType, lighting: shot.lighting })
    } catch (err) {
      console.warn("[caught] src/lib/orchestration/chainGeneration.ts:136", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ }
  }

  let nextContinuity = continuityAgent.fallback({ shotPrompt: shot.visualPrompt, prior: continuity })
  prompt = applyContinuity(prompt, nextContinuity)

  const present = shot.charactersPresent ?? []
  const characterRef = present.length > 0
    ? (assets.characters ?? []).find(c => c.name === present[0])?.imageUrl
    : undefined
  const keyframe = shot.storyboardUrl?.trim()
  const continueExactFrame = !keyframe && !feeding && Boolean(startFrame && anchorFrameUrl && startFrame === anchorFrameUrl)
  const baseRefs = feeding ? chainFeed?.images : (continueExactFrame ? undefined : seedanceAssetRefs(shot, assets))
  const referenceImages = keyframe
    ? [{ url: keyframe, role: 'location' as const, label: 'the opening frame' }, ...(baseRefs ?? [])]
    : baseRefs

  let videoUrl = ''
  const timeoutMs = getModelTimeout(node.assignedModel)
  try {
    if (projectId) {
      const { readPriorFal } = await import('@/lib/studio/recoverFalClip')
      const prior = await readPriorFal(projectId, rowIndex)
      if (prior.kind === 'video') {
        videoUrl = prior.url
        console.log('[director] fal_recovered', { projectId, planIndex: rowIndex, requestId: prior.submission.requestId })
      } else if (prior.kind === 'open') {
        const result = await withTimeout(
          pollFalResult(prior.submission, { timeoutMs, jobId }),
          timeoutMs,
          `Shot ${ordinal} resume`,
        )
        videoUrl = extractVideoUrl(result.data)?.trim() ?? ''
      } else if (prior.kind === 'failed') {
        throw new Error(`Shot ${ordinal}: existing FAL request failed`)
      }
    }

    if (!videoUrl) {
      const { rememberFalSubmission } = await import('@/lib/studio/recoverFalClip')
      videoUrl = await withTimeout(
        callVideoModel({
          model:          node.assignedModel,
          prompt,
          duration:       chainFeed?.duration ?? shot.duration,
          imageUrl:       keyframe || startFrame,
          patientZeroUrl: feeding ? undefined : characterRef,
          continueExactFrame,
          referenceImages,
          referenceVideos: feeding ? chainFeed?.videos.map((url) => ({ url, role: 'continuation' as const })) : undefined,
          jobId,
          shotIndex:      ordinal,
          generationMode,
          resolution,
          onSubProgress:  (s) => onProgress(ordinal, 'generating', { pct: s.pct, message: s.message }),
          onPoll,
          onSubmission: projectId
            ? (submission) => rememberFalSubmission(projectId, rowIndex, submission)
            : undefined,
        }),
        timeoutMs,
        `Shot ${ordinal} (${node.assignedModel})`,
      )
    }
  } catch (err) {
    if (err instanceof BudgetCapReached || isGenerationPausedError(err)) throw err
    if (projectId && !videoUrl.trim()) {
      const { readPriorFal } = await import('@/lib/studio/recoverFalClip')
      const again = await withTimeout(
        readPriorFal(projectId, rowIndex),
        20_000,
        `Shot ${ordinal} recover`,
      ).catch((err) => {
        console.warn("[caught] src/lib/orchestration/chainGeneration.ts:214", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (null)
      })
      if (again?.kind === 'video') {
        videoUrl = again.url
        console.log('[director] fal_recovered', { projectId, planIndex: rowIndex, requestId: again.submission.requestId })
      }
    }
    if (!videoUrl.trim()) {
      const reason = err instanceof Error ? err.message : String(err)
      if (projectId) {
        const { markBatchClipFailed } = await import('@/lib/studio/batchClipSync')
        await markBatchClipFailed(projectId, rowIndex).catch((err) => logCaught('lib/orchestration/chainGeneration', err))
      }
      console.warn('[director] shot_failed_continue', { projectId, planIndex: rowIndex, error: reason })
      throw err
    }
  }

  let lastFrame: string | undefined
  try {
    lastFrame = await extractTailFrame(videoUrl)
    if (lastFrame) {
      const { falLog } = await import('@/lib/fal/falQueue')
      falLog('info', 'anchor_extracted', {
        shotIndex: shot.shotIndex,
        jobId,
        lastFrame: lastFrame.slice(0, 80),
      })
    }
  } catch (err) {
    const { falLog } = await import('@/lib/fal/falQueue')
    falLog('warn', 'anchor_extract_failed', {
      shotIndex: shot.shotIndex,
      jobId,
      error: err instanceof Error ? err.message : String(err),
      note: 'Next shot will generate without start frame anchor',
    })
    lastFrame = undefined
  }

  if (jobId) {
    try {
      await saveCheckpoint({
        jobId,
        segmentId: segId,
        shotId: ordinal,
        videoUrl,
        modelUsed: node.assignedModel,
        cost: node.estimatedCost,
        qaPassed: true,
        anchorFrame: lastFrame,
      })
      await consumeFromHold(jobId, segId, node.estimatedCost)
    } catch (err) {
      const { falLog } = await import('@/lib/fal/falQueue')
      falLog('warn', 'checkpoint_save_failed', {
        shotIndex: shot.shotIndex,
        jobId,
        error: err instanceof Error ? err.message : String(err),
        note: 'Continuing — shot completed but checkpoint may not resume',
      })
    }
  }

  let mediaPath: string | null = null
  if (projectId) {
    const { markBatchClipCompleted } = await import('@/lib/studio/batchClipSync')
    mediaPath = await markBatchClipCompleted(projectId, rowIndex, videoUrl, lastFrame).catch((err) => {
      console.warn('[director] clip persist failed', err instanceof Error ? err.message : err)
      return null
    })
  }

  return {
    segment: {
      shotIndex:    ordinal,
      videoUrl,
      mediaPath:    mediaPath ?? undefined,
      duration:     shot.duration,
      model:        node.assignedModel,
      contentType:  shot.contentType,
      tailFrameUrl: lastFrame ?? '',
      qualityScore: 1.0,
      retryCount:   0,
    },
    lastFrame,
    continuity: nextContinuity,
  }
}

/** Sequential clip dispatch — each shot awaits the prior shot's tail frame. */
async function generateChain(
  chain:          ContinuityChain,
  dagByIndex:     Map<number, DAGNode>,
  assets:         PatientZeroAssets,
  onProgress:     ChainProgressFn,
  jobId?:         string,
  onPoll?:        () => void | Promise<void>,
  generationMode: GenerationMode = 'draft',
): Promise<GeneratedSegment[]> {

  const results: GeneratedSegment[] = []
  let anchorFrameUrl: string | undefined
  let continuity: ContinuityState | null = null

  for (const shot of chain.shots) {
    const node = dagByIndex.get(shot.shotIndex)
    if (!node) continue

    const { segment, lastFrame, continuity: updated } = await generateShot(
      shot, node, assets, anchorFrameUrl, continuity, onProgress, jobId, onPoll, generationMode,
    )
    anchorFrameUrl = lastFrame
    continuity = updated
    results.push(segment)
    onProgress(shot.shotIndex, 'complete')
  }

  return results
}

/** Hybrid schedule: video and still chains are sequential; cuts and low-continuity shots run alongside. */
export async function generateAllScenes(
  shots:      StructuredShot[],
  dag:        DAGNode[],
  assets:     PatientZeroAssets,
  onProgress: (data: { shotIndex: number; totalShots: number; status: string; subProgress?: number; subMessage?: string }) => void,
  options?:   {
    jobId?:           string
    projectId?:       string
    userId?:          string
    onPoll?:          () => void | Promise<void>
    onPhase?:         (phase: string, detail: string) => void
    generationMode?:  GenerationMode
    resolution?:      string
    selectedModels?:  string[]
    gateMode?:        GateMode
  },
): Promise<GeneratedSegment[]> {
  const dagByIndex = new Map(dag.map((n) => [n.shot.shotIndex, n]))
  const totalShots = shots.length
  const positionByShot = new Map(shots.map((shot, index) => [shot.shotIndex, index + 1]))
  const all: GeneratedSegment[] = []
  const jobId = options?.jobId
  const projectId = options?.projectId
  const onPoll = options?.onPoll
  const generationMode = options?.generationMode ?? 'draft'
  const selectedModels = options?.selectedModels ?? dag.map((n) => n.assignedModel)

  if (projectId) {
    const { invalidateBatchClipCache } = await import('@/lib/studio/batchClipSync')
    invalidateBatchClipCache(projectId)
  }

  const { annotateContinuity } = await import('./chainPlan')
  const reroutes = annotateContinuity(shots, dag, selectedModels)
  for (const reroute of reroutes) {
    console.log('[chain] reroute', reroute)
    const position = positionByShot.get(reroute.shotIndex) ?? 1
    options?.onPhase?.('chain_reroute', `Shot ${position} uses ${reroute.to} so the sequence can chain`)
  }
  if (projectId) {
    const { persistChainLinks } = await import('./chainPlan')
    await persistChainLinks(projectId, shots).catch((err) => {
      console.warn('[chain] link persist skipped', err instanceof Error ? err.message : err)
    })
  }

  const byId = new Map(shots.map((shot) => [`shot-${shot.shotIndex}`, shot]))
  const scheduled = [...shots]
    .sort((a, b) => a.shotIndex - b.shotIndex)
    .map((shot) => ({ id: `shot-${shot.shotIndex}`, link: shot.chainLink ?? 'none' as const }))
  const { chains, independents } = partitionContinuity(scheduled)
  const gateMode = options?.gateMode ?? 'auto'
  const userId = options?.userId
  const threadAnchors = new Map<string, { mediaPath: string; lastFrame?: string; shotIndex: number; label: string }>()

  function threadKeys(shot: StructuredShot): string[] {
    const locations = (shot.locationsPresent ?? []).map((name) => name.trim()).filter(Boolean)
    if (locations.length) return locations.map((name) => `location:${name.toLowerCase()}`)
    return (shot.charactersPresent ?? []).map((name) => name.trim()).filter(Boolean).map((name) => `entity:${name.toLowerCase()}`)
  }

  function sharesThread(a: StructuredShot, b: StructuredShot): boolean {
    const left = new Set(threadKeys(a))
    return threadKeys(b).some((key) => left.has(key))
  }

  function anchorFor(shot: StructuredShot) {
    for (const key of threadKeys(shot)) {
      const found = threadAnchors.get(key)
      if (found) return found
    }
    return undefined
  }

  function rememberThread(shot: StructuredShot, segment: GeneratedSegment, lastFrame?: string) {
    if (!segment.mediaPath?.startsWith('/api/media/')) return
    const label = shot.locationsPresent?.[0]?.trim() || shot.charactersPresent?.[0]?.trim() || 'thread'
    const anchor = { mediaPath: segment.mediaPath, lastFrame, shotIndex: shot.shotIndex, label }
    for (const key of threadKeys(shot)) threadAnchors.set(key, anchor)
  }

  async function recordBehaviour(shot: StructuredShot, model: string | undefined, signal: string) {
    if (!userId) return
    try {
      const { recordShotOutcome } = await import('@/lib/cognition/learnOutcomes')
      let shotId: string | undefined
      if (projectId) {
        const { db } = await import('@/lib/db')
        const { getOrderedClips } = await import('@/lib/studio/advanceChain')
        const ordered = await getOrderedClips(db, projectId)
        shotId = ordered.find((clip) => clip.shotNumber - 1 === shot.shotIndex)?.id
      }
      await recordShotOutcome({
        userId,
        shotId,
        jobId,
        signal,
        model,
        purpose: shot.purpose,
        mode: shot.delegatedMode,
        contentType: shot.contentType,
      })
    } catch (err) {
      console.warn("[caught] src/lib/orchestration/chainGeneration.ts:401", err instanceof Error ? { name: err.name, message: err.message } : err)

      // Learning is additive; a missed signal must not fail the film.
    }
  }

  options?.onPhase?.(
    'chain_plan',
    chains.length
      ? `${chains.length} chain${chains.length === 1 ? '' : 's'} run one shot at a time. ${independents.length} independent shot${independents.length === 1 ? '' : 's'} run alongside.`
      : `${independents.length} independent shots run in parallel.`,
  )

  const runIndexed = async (
    shot: StructuredShot,
    anchorFrameUrl: string | undefined,
    chainFeed?: { videos: string[]; images: Array<{ url: string; label?: string; role: 'character' | 'location'; primary?: boolean }>; duration: number },
    waiting = false,
  ) => {
    const node = dagByIndex.get(shot.shotIndex)
    if (!node) throw new Error(`Shot ${shot.shotIndex} has no routed model`)
    const progressWrapper: ChainProgressFn = (shotIndex, status, sub) => {
      const wait = waiting ? 'waiting on the previous shot' : status
      const position = positionByShot.get(shotIndex) ?? 1
      onProgress({
        shotIndex: position - 1,
        totalShots,
        status,
        subProgress: sub?.pct,
        subMessage: sub
          ? `Shot ${position}/${totalShots}: ${sub.message}`
          : (shot.chainLink === 'video' ? `Shot ${position}/${totalShots}: ${wait}` : `Shot ${position}/${totalShots}: ${wait}`),
      })
    }
    patchGen({ model: node.assignedModel, mode: shot.delegatedMode, purpose: shot.purpose, stage: 'submit' })
    return withGenContext({
      shotId: undefined,
      jobId,
      userId,
      model: node.assignedModel,
      mode: shot.delegatedMode,
      purpose: shot.purpose,
      stage: 'submit',
    }, () => generateShot(
      shot,
      node,
      assets,
      anchorFrameUrl,
      null,
      progressWrapper,
      jobId,
      onPoll,
      generationMode,
      projectId,
      options?.resolution,
      shot.shotIndex,
      chainFeed,
    ).catch(async (err) => {
      await recordBehaviour(shot, node.assignedModel, 'failed')
      throw err
    }))
  }

  const imagesFor = (shot: StructuredShot, still?: string) => {
    const images: Array<{ url: string; label?: string; role: 'character' | 'location'; primary?: boolean }> = []
    if (still) images.push({ url: still, role: 'location', label: 'previous frame' })
    for (const name of shot.charactersPresent ?? []) {
      const url = assets.characters.find((character) => character.name === name)?.imageUrl
      if (url) images.push({ url, role: 'character', label: name, primary: !images.some((image) => image.role === 'character') })
    }
    for (const name of shot.locationsPresent ?? []) {
      const url = assets.locations.find((location) => location.name === name)?.imageUrl
      if (url) images.push({ url, role: 'location', label: name })
    }
    return images.slice(0, 9)
  }

  const runGroup = async (group: StructuredShot[], linked: boolean, seedAnchor?: string) => {
    let anchor: string | undefined = seedAnchor
    let previous: { shot: StructuredShot; segment: GeneratedSegment; lastFrame?: string } | undefined
    let regenerations = 0
    for (let i = 0; i < group.length; i++) {
      const shot = group[i]
      const resumed = anchorFor(shot)
      const adjacentSame = Boolean(previous && sharesThread(shot, previous.shot))
      const videoLink = linked && adjacentSame && i > 0 && shot.chainLink === 'video' && shot.continuity !== 'cut' && !shot.isCut
      const threadLink = Boolean(resumed && !adjacentSame)
      const source = videoLink && previous
        ? {
            mediaPath: previous.segment.mediaPath,
            lastFrame: previous.lastFrame,
            shotIndex: previous.shot.shotIndex,
            label: previous.shot.locationsPresent?.[0] ?? previous.shot.charactersPresent?.[0] ?? 'previous',
            bridge: 'adjacent' as const,
          }
        : threadLink && resumed
          ? { ...resumed, bridge: 'thread-anchor' as const }
          : null
      if (!source) {
        console.log('[chain_feed]', {
          shotIndex: shot.shotIndex,
          reference: null,
          reason: shot.continuity === 'cut' || shot.isCut ? 'cut' : (shot.chainLink ?? 'none'),
        })
      }
      if (source?.mediaPath) {
        const model = dagByIndex.get(shot.shotIndex)?.assignedModel
        const reference = source.mediaPath
        if (!projectId || !reference.startsWith('/api/media/')) {
          const reason = `Shot ${shot.shotIndex + 1} has no durable reference from the previous shot`
          console.log('[chain_feed]', { shotIndex: shot.shotIndex, reference: null, reason })
          throw new ChainPaused(reason)
        }
        const clipId = reference.slice('/api/media/'.length)
        const { durableChainReference } = await import('./chainReference')
        const owned = await durableChainReference(clipId)
        if (!owned) {
          const reason = `Shot ${shot.shotIndex + 1} could not read ${reference}`
          console.log('[chain_feed]', { shotIndex: shot.shotIndex, reference, reason })
          throw new ChainPaused(reason)
        }
        console.log('[chain_feed]', {
          shotIndex: shot.shotIndex,
          priorShot: source.shotIndex,
          reference: owned.mediaPath,
          model,
          thread: source.label,
          bridge: source.bridge,
        })
        if (source.bridge === 'thread-anchor' && projectId) {
          const note = `Shot ${shot.shotIndex + 1} references the last ${source.label} frame, shot ${source.shotIndex + 1}`
          const { db } = await import('@/lib/db')
          const { getOrderedClips } = await import('@/lib/studio/advanceChain')
          const ordered = await getOrderedClips(db, projectId)
          const clip = ordered.find((row) => row.shotNumber - 1 === shot.shotIndex)
          if (clip) {
            await db.studioClip.update({ where: { id: clip.id }, data: { directionNotes: note } }).catch((err) => {
              console.warn('[chain_bridge] note skipped', err instanceof Error ? err.message : err)
            })
          }
          console.log('[chain_bridge]', { shotIndex: shot.shotIndex, note })
        }
        console.log('[chain_model]', { shotIndex: shot.shotIndex, model })
        const duration = model === 'wan-3.0'
          ? wanChainOutputSeconds(shot.duration)
          : shot.duration
        const feed = {
          videos: [owned.fetchUrl],
          images: imagesFor(shot, source.lastFrame),
          duration,
        }
        let fed = await runIndexed(shot, undefined, feed, true)
        let autoPassed: boolean | null = true
        if (gateMode === 'auto' || gateMode === 'both') {
          const { extractVideoFrame } = await import('@/lib/fal/frameExtract')
          const nextFrame = fed.segment.videoUrl
            ? await extractVideoFrame(fed.segment.videoUrl, { frameType: 'first' }).catch((err) => {
              console.warn('[chain_consistency] first frame', err instanceof Error ? err.message : err)
              return ''
            })
            : ''
          const { scoreChainLink } = await import('./chainConsistency')
          const score = await scoreChainLink(source.lastFrame, nextFrame)
          autoPassed = score.passed
          console.log('[chain_consistency]', {
            shotIndex: shot.shotIndex,
            score: score.score,
            passed: score.passed,
            reason: score.reason,
          })
          if (!score.passed) {
            const decision = gateChainLink(gateMode, false, regenerations)
            if (decision === 'regenerate') {
              regenerations += 1
              await recordBehaviour(shot, model, 'regenerate')
              fed = await runIndexed(shot, undefined, feed, true)
              const againFrame = await extractVideoFrame(fed.segment.videoUrl, { frameType: 'first' }).catch((err) => {
                console.warn('[chain_consistency] first frame', err instanceof Error ? err.message : err)
                return ''
              })
              const again = await scoreChainLink(source.lastFrame, againFrame)
              autoPassed = again.passed
              console.log('[chain_consistency]', {
                shotIndex: shot.shotIndex,
                score: again.score,
                passed: again.passed,
                reason: again.reason,
                retry: true,
              })
            }
          }
        }
        const decision = gateChainLink(gateMode, autoPassed, regenerations)
        if (decision === 'await_user') {
          const reason = gateMode === 'manual'
            ? `Shot ${shot.shotIndex + 1} is waiting for approval before the next shot`
            : `continuity drift on shot ${shot.shotIndex + 1}`
          if (projectId) {
            const { markChainBlock } = await import('@/lib/studio/batchClipSync')
            await markChainBlock(
              projectId,
              shot.shotIndex,
              gateMode === 'manual' ? 'await_approval' : 'needs_attention',
              reason,
              source.lastFrame,
            )
          }
          throw new ChainPaused(reason)
        }
        await recordBehaviour(shot, model, 'approved_at_gate')
        rememberThread(shot, fed.segment, fed.lastFrame)
        anchor = fed.lastFrame
        previous = { shot, segment: fed.segment, lastFrame: fed.lastFrame }
        all.push(fed.segment)
        continue
      }
      try {
        const stillLink = linked && i > 0 && shot.chainLink === 'still'
        const inheritAnchor = i === 0 && Boolean(anchor) && shot.chainLink === 'video' && !shot.startsAtHardCut && !shot.isCut
        const fed = await runIndexed(shot, (stillLink || inheritAnchor) ? anchor : undefined, undefined, false)
        await recordBehaviour(shot, dagByIndex.get(shot.shotIndex)?.assignedModel, 'approved_at_gate')
        rememberThread(shot, fed.segment, fed.lastFrame)
        anchor = fed.lastFrame
        previous = { shot, segment: fed.segment, lastFrame: fed.lastFrame }
        all.push(fed.segment)
      } catch (err) {
        if (err instanceof BudgetCapReached || isGenerationPausedError(err) || err instanceof ChainPaused) throw err
        if (linked && group.length > 1) {
          const reason = err instanceof Error ? err.message : String(err)
          if (projectId) {
            const { markChainBlock } = await import('@/lib/studio/batchClipSync')
            await markChainBlock(projectId, shot.shotIndex, 'needs_attention', reason)
          }
          throw new ChainPaused(`Shot ${shot.shotIndex + 1} failed: ${reason}`)
        }
        console.warn('[director] shot_failed_continue', {
          planIndex: shot.shotIndex,
          error: err instanceof Error ? err.message : String(err),
        })
        onProgress({ shotIndex: shot.shotIndex, totalShots, status: 'failed' })
      }
    }
    return anchor
  }

  const chainGroups = chains.map((group) => group.shots.map((shot) => byId.get(shot.id)).filter((shot): shot is StructuredShot => Boolean(shot)))
  const independentShots = independents.map((shot) => byId.get(shot.id)).filter((shot): shot is StructuredShot => Boolean(shot))

  const limit = 4
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, Math.max(independentShots.length, 1)) }, async () => {
    while (cursor < independentShots.length) {
      const shot = independentShots[cursor++]
      await runGroup([shot], false)
    }
  })
  let carriedAnchor: string | undefined
  for (const group of chainGroups) {
    const first = group[0]
    const continuing = Boolean(first && first.chainLink === 'video' && !first.startsAtHardCut && !first.isCut)
    carriedAnchor = await runGroup(group, true, continuing ? carriedAnchor : undefined)
  }
  await Promise.all(workers)

  return all.sort((a, b) => a.shotIndex - b.shotIndex)
}

/** @deprecated Use generateAllScenes — parallel chains violate sequential scene policy. */
export async function generateParallel(
  chains:     ContinuityChain[],
  dag:        DAGNode[],
  assets:     PatientZeroAssets,
  onProgress: (data: { shotIndex: number; totalShots: number; status: string; subProgress?: number; subMessage?: string }) => void,
  options?:   {
    jobId?:           string
    onPoll?:          () => void | Promise<void>
    onPhase?:         (phase: string, detail: string) => void
    generationMode?:  GenerationMode
  },
): Promise<GeneratedSegment[]> {

  const dagByIndex = new Map(dag.map(n => [n.shot.shotIndex, n]))
  const ordered = chains.flatMap((chain) => chain.shots)
  const totalShots = ordered.length
  const positionByShot = new Map(ordered.map((shot, index) => [shot.shotIndex, index + 1]))
  const all: GeneratedSegment[] = []
  const jobId = options?.jobId
  const onPoll = options?.onPoll
  const generationMode = options?.generationMode ?? 'draft'

  const progressWrapper = (chain: ContinuityChain) =>
    (shotIndex: number, status: string, sub?: { pct: number; message: string }) => {
      const position = positionByShot.get(shotIndex) ?? 1
      onProgress({
        shotIndex: position - 1,
        totalShots,
        status,
        subProgress: sub?.pct,
        subMessage: sub
          ? `Shot ${position}/${totalShots}: ${sub.message}`
          : `Shot ${position}/${totalShots}: ${status}`,
      })
    }

  const sorted = [...chains].sort((a, b) => chainCost(a, dagByIndex) - chainCost(b, dagByIndex))
  const canary = sorted[0]
  const rest   = sorted.slice(1)

  if (canary) {
    const firstShot = canary.shots[0]?.shotIndex ?? 0
    options?.onPhase?.('canary_start', `Validating pipeline with shot ${firstShot + 1}`)
    try {
      const canaryResults = await generateChain(
        canary, dagByIndex, assets, progressWrapper(canary), jobId, onPoll, generationMode,
      )
      all.push(...canaryResults)
    } catch (err) {
      if (err instanceof Error && err.name === 'NeedsAttentionError') throw err
      throw new CanaryFailure(
        `Pipeline validation failed on cheapest shot: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    options?.onPhase?.('canary_passed', 'Pipeline validated — generating remaining shots')
  }

  for (const chain of rest) {
    const chainResults = await generateChain(
      chain, dagByIndex, assets, progressWrapper(chain), jobId, onPoll, generationMode,
    )
    all.push(...chainResults)
  }

  return all.sort((a, b) => a.shotIndex - b.shotIndex)
}
