import {
  blendCharacterMatch,
  firstPassCharacterMatch,
  qualityCheckFromChecks,
  type QualityCheck,
  type QualityChecks,
  type QualityIntent,
  type QualitySource,
  type QualityVerdict,
} from '@cinema/core'
import { db } from '@/lib/db'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { parseEmbeddingJson } from '@/lib/character/fccSchema'
import { currentGen, genLog } from './correlation'
import { recordShotOutcome } from '@/lib/cognition/learnOutcomes'

const VISION_SOURCE = 'diagnostics.quality'
const MAX_IMAGE_BYTES = 5_000_000
const DUPLICATE_MS = 30_000

export interface InspectInput {
  frameUrl: string
  lastFrame?: string
  videoUrl?: string
  shotId?: string
  userId?: string
  jobId?: string
  projectId?: string
  model?: string
  purpose?: string
  mode?: string
  prompt: string
  characterIds?: string[]
  cameraIntent?: string
  locationId?: string | null
  hasFaces?: boolean
  persist?: boolean
  skipVision?: boolean
  outputFaceEmbedding?: number[]
}

type ImagePart = {
  type: 'image'
  source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }
}

function clamp01(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  return undefined
}

function embeddingOf(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.filter((n): n is number => typeof n === 'number')
  return parseEmbeddingJson(raw)
}

function imageMediaType(
  contentType: string | null,
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  const ct = contentType?.toLowerCase() ?? ''
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'image/jpeg'
  if (ct.includes('png')) return 'image/png'
  if (ct.includes('webp')) return 'image/webp'
  if (ct.includes('gif')) return 'image/gif'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  return null
}

async function fetchImagePart(url: string): Promise<ImagePart | null> {
  const trimmed = url.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(trimmed, { signal: ctrl.signal })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null
    const media = imageMediaType(res.headers.get('content-type'), buf)
    if (!media) return null
    return {
      type: 'image',
      source: { type: 'base64', media_type: media, data: buf.toString('base64') },
    }
  } catch (err) {
    console.warn("[caught] src/lib/diagnostics/inspectQuality.ts:95", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseVisionChecks(raw: string): { checks: QualityChecks; reason?: string } | null {
  const text = raw.replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const onIntent = asBool(parsed.onIntent)
    const artifacts = asBool(parsed.artifacts)
    if (onIntent == null || artifacts == null) return null
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined
    return {
      checks: {
        onIntent,
        artifacts,
        characterMatch: clamp01(parsed.characterMatch),
        cameraMatch: asBool(parsed.cameraMatch),
        locationMatch: clamp01(parsed.locationMatch),
      },
      reason,
    }
  } catch (err) {
    console.warn("[caught] src/lib/diagnostics/inspectQuality.ts:123", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

async function loadCharacterRef(characterIds: string[] | undefined): Promise<{
  url?: string
  embedding: number[]
}> {
  const id = characterIds?.find((value) => value.trim())
  if (!id) return { embedding: [] }
  const row = await db.vaultCharacter.findUnique({
    where: { id },
    select: { referenceUrls: true, faceEmbedding: true },
  })
  if (!row) return { embedding: [] }
  return {
    url: row.referenceUrls[0],
    embedding: embeddingOf(row.faceEmbedding),
  }
}

async function loadLocationPlate(locationId: string | null | undefined): Promise<string | undefined> {
  if (!locationId) return undefined
  const row = await db.locationPlate.findUnique({
    where: { id: locationId },
    select: { imageUrl: true },
  })
  return row?.imageUrl || undefined
}

async function recentVisionLog(shotId: string) {
  return db.qualityLog.findFirst({
    where: {
      shotId,
      source: 'vision',
      createdAt: { gte: new Date(Date.now() - DUPLICATE_MS) },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function persistQualityLog(input: {
  check: QualityCheck
  source: QualitySource
  userId?: string
  jobId?: string
  mode?: string
}): Promise<string | null> {
  const { check } = input
  try {
    const row = await db.qualityLog.create({
      data: {
        shotId: check.shotId ?? null,
        userId: input.userId ?? null,
        jobId: input.jobId ?? null,
        model: check.model ?? 'unknown',
        purpose: check.purpose ?? null,
        mode: input.mode ?? null,
        source: input.source,
        verdict: check.verdict,
        dimension: check.dimension ?? null,
        reason: check.reason ?? null,
        onIntent: check.checks.onIntent,
        characterMatch: check.checks.characterMatch ?? null,
        cameraMatch: check.checks.cameraMatch ?? null,
        locationMatch: check.checks.locationMatch ?? null,
        artifacts: check.checks.artifacts,
        checks: JSON.parse(JSON.stringify(check.checks)),
        intent: JSON.parse(JSON.stringify(check.intent)),
      },
    })
    return row.id
  } catch (err) {
    genLog('warn', 'quality_log_persist_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function learnFromQuality(check: QualityCheck, userId?: string, jobId?: string): Promise<void> {
  if (!userId || check.verdict === 'pass' || !check.model) return
  await recordShotOutcome({
    userId,
    shotId: check.shotId,
    jobId,
    signal: 'regenerate',
    source: 'behaviour',
    reason: check.dimension ?? check.reason,
    model: check.model,
    purpose: check.purpose,
    reward: -1,
  }).catch((err) => {
    genLog('warn', 'quality_learn_skipped', {
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

function skippedCheck(meta: { shotId?: string; model?: string; purpose?: string }): null {
  genLog('info', 'quality_inspect_skipped', { shotId: meta.shotId, model: meta.model })
  return null
}

export async function inspectOutput(input: InspectInput): Promise<QualityCheck | null> {
  try {
    return await runInspect(input)
  } catch (err) {
    if (isGenerationPausedError(err)) return null
    genLog('warn', 'quality_inspect_failed', {
      error: err instanceof Error ? err.message : String(err),
      shotId: input.shotId,
    })
    return null
  }
}

async function runInspect(input: InspectInput): Promise<QualityCheck | null> {
  const ctx = currentGen()
  const shotId = input.shotId ?? ctx.shotId
  const userId = input.userId ?? ctx.userId
  const jobId = input.jobId ?? ctx.jobId
  const model = input.model ?? ctx.model
  const purpose = input.purpose ?? ctx.purpose
  const mode = input.mode ?? ctx.mode
  const intent: QualityIntent = {
    prompt: input.prompt,
    characterIds: input.characterIds,
    cameraIntent: input.cameraIntent,
    locationId: input.locationId ?? null,
  }
  const meta = { shotId, model, purpose }

  if (input.skipVision) return skippedCheck(meta)

  if (shotId && input.persist !== false) {
    const dup = await recentVisionLog(shotId)
    if (dup) {
      return {
        shotId,
        model: dup.model,
        purpose: dup.purpose ?? undefined,
        intent,
        checks: {
          onIntent: dup.onIntent ?? true,
          characterMatch: dup.characterMatch ?? undefined,
          cameraMatch: dup.cameraMatch ?? undefined,
          locationMatch: dup.locationMatch ?? undefined,
          artifacts: dup.artifacts ?? false,
        },
        verdict: dup.verdict as QualityVerdict,
        reason: dup.reason ?? undefined,
        dimension: dup.dimension as QualityCheck['dimension'],
      }
    }
  }

  const frameUrl = (input.lastFrame || input.frameUrl || input.videoUrl || '').trim()
  if (!frameUrl) return skippedCheck(meta)
  console.log('[quality] vision skipped', JSON.stringify({ shotId, reason: 'not on the generate path' }))
  return null
}

export async function inspectCompletedShot(input: InspectInput & { projectId: string }): Promise<QualityCheck | null> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { gateMode: true },
  })
  const gateMode = project?.gateMode ?? 'auto'
  if (gateMode === 'manual') {
    return inspectOutput({ ...input, skipVision: true })
  }
  return inspectOutput(input)
}
