import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { extractImageUrl, IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { loadDecompositionCheckpoint, loadKeyframeCheckpoint, loadWizardRefs, saveDecompositionCheckpoint, saveKeyframeCheckpoint, saveWizardRefs } from '@/lib/orchestration/checkpoints'
import { promptHasSequence, readTransition } from '@/lib/orchestration/scriptBreakdown'
import { parseWizard } from '@/lib/orchestration/wizardState'
import type { StructuredShot } from '@/lib/orchestration/types'
import { requireUser } from '@/lib/auth/requireUser'

async function ownedJob(jobId: string, userId: string) {
  return db.renderJob.findFirst({
    where: { id: jobId, userId },
    select: { id: true, phase: true, statusMessage: true, metadata: true },
  })
}

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const jobId = req.nextUrl.searchParams.get('jobId')?.trim()
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  const job = await ownedJob(jobId, userId)
  if (!job) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const meta = (job.metadata && typeof job.metadata === 'object' ? job.metadata : {}) as Record<string, unknown>
  const wizard = parseWizard(meta.wizard)
  const stored = (await loadDecompositionCheckpoint(jobId) ?? []) as StructuredShot[]
  const shots = await Promise.all(stored.map(async (shot, index) => {
    const frame = await loadKeyframeCheckpoint(jobId, shot.shotIndex ?? index)
    return frame ? { ...shot, storyboardUrl: frame } : shot
  }))
  const references = await loadWizardRefs(jobId)
  const library = await db.asset.findMany({
    where: { ownerId: userId, usableAsReference: true, generatedImage: { not: null } },
    select: { label: true, kind: true, generatedImage: true },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  })
  const selectedModels = Array.isArray(meta.selectedModels)
    ? meta.selectedModels.filter((id): id is string => typeof id === 'string')
    : []
  return NextResponse.json({
    jobId,
    phase: job.phase,
    message: job.statusMessage,
    spendCredits: wizard?.spendCredits ?? 0,
    ownLicence: wizard?.ownLicence ?? false,
    subjectConsent: wizard?.subjectConsent ?? false,
    wizard,
    references,
    library: library.flatMap((row) => row.generatedImage ? [{ name: row.label || row.kind, kind: row.kind, imageUrl: row.generatedImage }] : []),
    selectedModels,
    shots,
    sequenceFlags: shots.map((shot) => promptHasSequence(shot.visualPrompt ?? '')),
  })
}

export async function PATCH(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[wizard] run body', err instanceof Error ? err.message : err)
    return null
  }) as {
    jobId?: string
    shots?: unknown
    importRef?: { name?: string; kind?: string; imageUrl?: string; shotIndex?: number }
    keyframe?: { shotIndex?: number; imageUrl?: string }
    deleteRef?: { name?: string; kind?: string }
    videoFrame?: { videoUrl?: string; name?: string; kind?: string }
    saveLibrary?: { name?: string; kind?: string; imageUrl?: string; notes?: string; usableAsReference?: boolean; trainable?: boolean }
    consent?: boolean
  } | null
  const jobId = body?.jobId?.trim()
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  const job = await ownedJob(jobId, userId)
  if (!job) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  if (body?.importRef) {
    if (!body.consent) return NextResponse.json({ error: 'Consent is required before importing a reference' }, { status: 400 })
    const name = body.importRef.name?.trim()
    const imageUrl = body.importRef.imageUrl?.trim()
    const kind = body.importRef.kind === 'location' ? 'location' : 'character'
    if (!name || !imageUrl?.startsWith('http')) {
      return NextResponse.json({ error: 'A name and an image URL are required' }, { status: 400 })
    }
    const current = await loadWizardRefs(jobId) ?? { characters: [], locations: [] }
    const bucket = kind === 'location' ? current.locations : current.characters
    bucket.push({ name, imageUrl })
    await saveWizardRefs(jobId, current)
    await db.asset.create({
      data: {
        ownerId: userId,
        kind,
        sourceRefs: [imageUrl],
        generatedImage: imageUrl,
        usableAsReference: true,
        isPrimary: true,
        label: name,
        mediaKind: 'image',
      },
    })
    if (typeof body.importRef.shotIndex === 'number' && Number.isFinite(body.importRef.shotIndex)) {
      await saveKeyframeCheckpoint(jobId, body.importRef.shotIndex, imageUrl)
    }
    return NextResponse.json({ references: current })
  }

  if (body?.saveLibrary) {
    const name = body.saveLibrary.name?.trim()
    const imageUrl = body.saveLibrary.imageUrl?.trim()
    const allowed = ['character', 'location', 'asset', 'style', 'voice'] as const
    const kind = allowed.find((item) => item === body.saveLibrary?.kind) ?? 'asset'
    if (!name || !imageUrl?.startsWith('http')) {
      return NextResponse.json({ error: 'A name and an image URL are required' }, { status: 400 })
    }
    await db.asset.create({
      data: {
        ownerId: userId,
        kind,
        sourceRefs: [imageUrl],
        generatedImage: imageUrl,
        usableAsReference: body.saveLibrary.usableAsReference !== false,
        isPrimary: true,
        label: name,
        mediaKind: 'image',
        resolutionState: 'imported',
        sourcePrompt: body.saveLibrary.notes?.trim() || name,
        boundary: {
          trainable: body.saveLibrary.trainable !== false,
          notes: body.saveLibrary.notes?.trim() || null,
        },
      },
    })
    return NextResponse.json({ saved: true, name, kind })
  }

  if (body?.keyframe) {
    if (!body.consent) return NextResponse.json({ error: 'Consent is required before setting a keyframe' }, { status: 400 })
    const imageUrl = body.keyframe.imageUrl?.trim()
    const shotIndex = body.keyframe.shotIndex
    if (!imageUrl?.startsWith('http') || typeof shotIndex !== 'number' || !Number.isFinite(shotIndex)) {
      return NextResponse.json({ error: 'A shot and an image are required' }, { status: 400 })
    }
    await saveKeyframeCheckpoint(jobId, shotIndex, imageUrl)
    return NextResponse.json({ shotIndex, imageUrl })
  }

  if (body?.deleteRef?.name) {
    const kind = body.deleteRef.kind === 'location' ? 'location' : 'character'
    const current = await loadWizardRefs(jobId) ?? { characters: [], locations: [] }
    const bucket = kind === 'location' ? 'locations' : 'characters'
    current[bucket] = current[bucket].filter((row) => row.name !== body.deleteRef?.name)
    await saveWizardRefs(jobId, current)
    return NextResponse.json({ references: current })
  }

  if (body?.videoFrame) {
    if (!body.consent) return NextResponse.json({ error: 'Consent is required before extracting a frame' }, { status: 400 })
    const videoUrl = body.videoFrame.videoUrl?.trim()
    const name = body.videoFrame.name?.trim()
    if (!videoUrl?.startsWith('http') || !name) {
      return NextResponse.json({ error: 'A video URL and a name are required' }, { status: 400 })
    }
    const access = await checkAccess(userId, 1)
    if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
    const result = await runFal<unknown>(
      falEndpoint('ffmpeg-api/extract-frame'),
      { video_url: videoUrl, frame_type: 'first' },
      undefined,
      IMAGE_FAL_TIMEOUT_MS,
      undefined,
      undefined,
      'wizard.frame',
    )
    const remote = extractImageUrl(result)?.trim()
    if (!remote) return NextResponse.json({ error: 'Frame extract returned no image' }, { status: 502 })
    const bytes = Buffer.from(await (await fetch(remote)).arrayBuffer())
    const stored = await uploadToR2(bytes, `assets/${userId}/frames/${Date.now()}.jpg`, 'image/jpeg')
    const kind = body.videoFrame.kind === 'location' ? 'location' : 'character'
    const current = await loadWizardRefs(jobId) ?? { characters: [], locations: [] }
    const bucket = kind === 'location' ? current.locations : current.characters
    bucket.push({ name, imageUrl: stored })
    await saveWizardRefs(jobId, current)
    return NextResponse.json({ references: current })
  }

  if (!Array.isArray(body?.shots)) {
    return NextResponse.json({ error: 'jobId and shots are required' }, { status: 400 })
  }
  const stored = (await loadDecompositionCheckpoint(jobId) ?? []) as StructuredShot[]
  const byIndex = new Map(stored.map((shot) => [shot.shotIndex, shot]))
  const next: StructuredShot[] = []
  for (const [index, raw] of body.shots.entries()) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Partial<StructuredShot>
    const base = byIndex.get(typeof row.shotIndex === 'number' ? row.shotIndex : index) ?? stored[index]
    const visualPrompt = typeof row.visualPrompt === 'string' ? row.visualPrompt.trim() : base?.visualPrompt ?? ''
    if (!visualPrompt) continue
    const duration = typeof row.duration === 'number' && row.duration > 0 ? row.duration : base?.duration ?? 5
    const transition = readTransition(row.transition) ?? base?.transition
    next.push({
      ...(base ?? {
        shotIndex: index,
        startSeconds: 0,
        endSeconds: duration,
        contentType: 'physical_action',
        motionLevel: 'medium',
        hasDialogue: false,
        hasFaces: false,
        hasAudio: false,
        hasCGI: false,
        charactersPresent: [],
        locationsPresent: [],
        lighting: 'natural_day',
        mood: 'calm',
        bridgeRequired: index > 0,
        continuityGroup: 0,
        isChainStart: index === 0,
      }),
      ...row,
      shotIndex: index,
      visualPrompt,
      duration,
      endSeconds: (base?.startSeconds ?? 0) + duration,
      cameraMove: typeof row.cameraMove === 'string' ? row.cameraMove : base?.cameraMove ?? 'static',
      cameraAngle: typeof row.cameraAngle === 'string' ? row.cameraAngle : base?.cameraAngle,
      shotSize: typeof row.shotSize === 'string' ? row.shotSize : base?.shotSize,
      transition: transition ?? undefined,
      charactersPresent: Array.isArray(row.charactersPresent) ? row.charactersPresent.filter((name): name is string => typeof name === 'string') : base?.charactersPresent ?? [],
      locationsPresent: Array.isArray(row.locationsPresent) ? row.locationsPresent.filter((name): name is string => typeof name === 'string') : base?.locationsPresent ?? [],
    })
  }
  if (!next.length) return NextResponse.json({ error: 'At least one shot needs a prompt' }, { status: 400 })
  await saveDecompositionCheckpoint(jobId, next)
  return NextResponse.json({
    shots: next,
    sequenceFlags: next.map((shot) => promptHasSequence(shot.visualPrompt)),
  })
}
