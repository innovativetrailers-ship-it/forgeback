import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { readDialogue } from '@/lib/audio/dialogueIntent'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { rememberDialogueTake, synthesiseVoiceTake } from '@/lib/audio/voiceTake'
import { applyLipSyncToShot } from '@/lib/orchestration/lipSyncPass'
import { requireUser } from '@/lib/auth/requireUser'

const query = z.object({ itemId: z.string().min(1) })
const confirmBody = z.object({ itemId: z.string().min(1), confirm: z.literal(true) })

async function lookup(userId: string, itemId: string) {
  const item = await db.asset.findFirst({
    where: { id: itemId, ownerId: userId, mediaKind: 'video' },
  })
  if (!item) return null
  const shotId = item.appearsInShots[0]
  const clip = shotId
    ? await db.studioClip.findUnique({
      where: { id: shotId },
      include: { scene: { select: { projectId: true, project: { select: { userId: true } } } } },
    })
    : null
  const lines = readDialogue(clip?.dialogue)
  const line = lines.find((row) => row.text.trim())
  const voice = line
    ? await db.asset.findFirst({
      where: { ownerId: userId, mediaKind: 'voice', appearsInShots: { has: shotId } },
      select: { id: true },
    })
    : null
  const lipSyncReady = Boolean(clip?.rawVideoUrl && clip.videoUrl && clip.videoUrl !== clip.rawVideoUrl)
  const missingVoice = Boolean(line) && !voice
  const missingLip = Boolean(line) && !lipSyncReady
  return {
    item,
    clip,
    line,
    shotId,
    voiceId: voice?.id ?? null,
    dialogue: Boolean(line),
    voiceReady: Boolean(voice),
    lipSyncReady,
    estimateCredits: (missingVoice ? 1 : 0) + (missingLip ? 1 : 0),
  }
}

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = query.safeParse({ itemId: req.nextUrl.searchParams.get('itemId') ?? '' })
  if (!parsed.success) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
  const found = await lookup(userId, parsed.data.itemId)
  if (!found) return NextResponse.json({ dialogue: false, voiceReady: false, lipSyncReady: false, estimateCredits: 0 })
  return NextResponse.json({
    dialogue: found.dialogue,
    voiceReady: found.voiceReady,
    lipSyncReady: found.lipSyncReady,
    estimateCredits: found.estimateCredits,
    voiceMediaId: found.voiceId,
    shotId: found.shotId ?? null,
  })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = confirmBody.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Confirm the voice price before generating' }, { status: 400 })
  const found = await lookup(userId, parsed.data.itemId)
  if (!found?.clip || !found.line || !found.shotId) {
    return NextResponse.json({ dialogue: false, voiceMediaId: null })
  }
  if (found.clip.scene.project.userId !== userId) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  let voiceMediaId = found.voiceId
  try {
    if (!voiceMediaId) {
      let voiceId = found.line.voiceId
      if (!voiceId && found.line.characterId) {
        const character = await db.vaultCharacter.findFirst({
          where: { id: found.line.characterId },
          select: { voiceId: true },
        })
        voiceId = character?.voiceId ?? undefined
      }
      const take = await synthesiseVoiceTake({
        userId,
        projectId: found.clip.scene.projectId,
        shotId: found.shotId,
        sceneId: found.clip.sceneId,
        line: { ...found.line, voiceId },
      })
      if (take.skipped || !take.mediaId || !take.mediaPath || !take.storedUrl) {
        return NextResponse.json({ skipped: take.skipped ?? 'no-voice', voiceMediaId: null })
      }
      await rememberDialogueTake({
        projectId: found.clip.scene.projectId,
        shotId: found.shotId,
        line: { ...found.line, voiceId },
        mediaId: take.mediaId,
        mediaPath: take.mediaPath,
        storedUrl: take.storedUrl,
      })
      voiceMediaId = take.mediaId
    }
    let videoUrl: string | null = null
    if (!found.lipSyncReady && found.clip) {
      const projectId = found.clip.scene.projectId
      videoUrl = await withCreditHold(userId, Math.max(1, found.estimateCredits), () => applyLipSyncToShot(found.shotId, projectId, 'draft'))
    }
    return NextResponse.json({ voiceMediaId, videoUrl, estimateCredits: found.estimateCredits })
  } catch (err) {
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The video can still be placed silent.' }, { status: 503 })
    }
    console.warn('[library] compose failed', err instanceof Error ? err.message : err)
    const message = err instanceof Error ? err.message : 'Voice compose failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
