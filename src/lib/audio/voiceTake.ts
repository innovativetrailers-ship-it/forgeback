import { buildAudioPayload, buildVoiceTakePayload } from '@cinema/core'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { extractAudioUrl, runFal } from '@/lib/fal/client'
import { ensureMainFolder, ensureSceneFolder } from '@/lib/library/folders'
import { uploadToR2 } from '@/lib/storage/r2'
import { readDialogue, selectVoiceTake, type DialogueLine } from './dialogueIntent'

export interface VoiceTakeResult {
  skipped?: 'no-text' | 'no-voice'
  mediaId?: string
  mediaPath?: string
  storedUrl?: string
  takes?: string[]
}

export async function synthesiseVoiceTake(input: {
  userId: string
  projectId: string
  shotId: string
  sceneId?: string | null
  line: DialogueLine
}): Promise<VoiceTakeResult> {
  const text = input.line.text.trim()
  if (!text) return { skipped: 'no-text' }
  const voice = input.line.voiceId?.trim()
  if (!voice) {
    console.warn('[voice_take] no voice selected; shot stays silent', input.shotId)
    return { skipped: 'no-voice' }
  }
  const access = await checkAccess(input.userId, 1)
  if (!access.allowed) throw new Error(access.reason)
  const built = buildVoiceTakePayload({
    text,
    voice,
    model: input.line.params.model,
    stability: input.line.params.stability,
    similarity: input.line.params.similarity,
    style: input.line.params.style,
    speed: input.line.params.speed,
    emotion: input.line.params.emotion,
  })
  const data = await runFal(built.endpoint, built.payload, undefined, 180_000, undefined, undefined, 'voice.take')
  const audioUrl = extractAudioUrl(data)
  if (!audioUrl) throw new Error('Speech model returned no audio')
  const bytes = Buffer.from(await (await fetch(audioUrl)).arrayBuffer())
  const key = `uploads/${input.userId}/voice/${nanoid()}.mp3`
  const storedUrl = await uploadToR2(bytes, key, 'audio/mpeg')
  const folder = input.sceneId
    ? await ensureSceneFolder(input.projectId, input.sceneId, 'Scene')
    : await ensureMainFolder(input.projectId)
  const mediaId = nanoid()
  await db.asset.create({
    data: {
      id: mediaId,
      ownerId: input.userId,
      kind: 'voice',
      mediaKind: 'voice',
      label: text.slice(0, 80),
      sourcePrompt: text,
      sourceRefs: [key],
      contentType: 'audio/mpeg',
      folderId: folder.id,
      variationOf: input.line.lineId,
      appearsInShots: [input.shotId],
      resolutionState: 'generated',
    },
  })
  return { mediaId, mediaPath: `/api/media/${mediaId}`, storedUrl }
}

export async function rememberDialogueTake(input: {
  projectId: string
  shotId: string
  line: DialogueLine
  mediaId: string
  mediaPath: string
  storedUrl: string
}): Promise<DialogueLine[]> {
  const clip = await db.studioClip.findUnique({
    where: { id: input.shotId },
    select: { dialogue: true, scene: { select: { projectId: true } } },
  })
  const current = clip && clip.scene.projectId === input.projectId
    ? readDialogue(clip.dialogue)
    : readDialogue([input.line])
  const base = current.some((line) => line.lineId === input.line.lineId) ? current : [...current, input.line]
  const next = selectVoiceTake(base, input.line.lineId, input.mediaId)
  if (clip && clip.scene.projectId === input.projectId) {
    await db.studioClip.update({
      where: { id: input.shotId },
      data: { dialogue: JSON.parse(JSON.stringify(next)) },
    })
  }
  await db.audioTrack.upsert({
    where: { id: `voice_${input.shotId}_${input.line.lineId}` },
    create: {
      id: `voice_${input.shotId}_${input.line.lineId}`,
      projectId: input.projectId,
      type: 'DIALOGUE',
      provider: 'ELEVENLABS',
      status: 'READY',
      prompt: input.line.text,
      voiceId: input.line.voiceId,
      shotPlanId: input.shotId,
      url: input.storedUrl,
    },
    update: {
      status: 'READY',
      prompt: input.line.text,
      voiceId: input.line.voiceId,
      url: input.storedUrl,
      muted: false,
    },
  })
  return next
}

export async function alignTake(input: { audioUrl: string; text: string }): Promise<unknown> {
  const built = buildAudioPayload('align', { audioUrl: input.audioUrl, text: input.text })
  return runFal(built.endpoint, built.payload, undefined, 180_000, undefined, undefined, 'voice.align')
}
