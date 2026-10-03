import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { readDialogue } from '@/lib/audio/dialogueIntent'
import { rememberDialogueTake, synthesiseVoiceTake } from '@/lib/audio/voiceTake'
import { db } from '@/lib/db'

const params = z.object({
  model: z.enum(['eleven_v3', 'flash']).default('eleven_v3'),
  emotion: z.number().default(0.5),
  stability: z.number().default(0.5),
  similarity: z.number().default(0.75),
  style: z.number().default(0),
  speed: z.number().default(1),
})

const schema = z.object({
  projectId: z.string().min(1),
  shotId: z.string().min(1),
  sceneId: z.string().optional(),
  lineId: z.string().min(1),
  text: z.string().default(''),
  characterId: z.string().optional(),
  voiceId: z.string().optional(),
  params,
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid voice take' }, { status: 400 })
  const project = await db.project.findFirst({ where: { id: parsed.data.projectId, userId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  let voiceId = parsed.data.voiceId?.trim()
  if (!voiceId && parsed.data.characterId) {
    const character = await db.vaultCharacter.findFirst({
      where: { id: parsed.data.characterId, projectId: parsed.data.projectId },
      select: { voiceId: true },
    })
    voiceId = character?.voiceId ?? undefined
  }
  const line = {
    lineId: parsed.data.lineId,
    text: parsed.data.text,
    characterId: parsed.data.characterId,
    voiceId,
    params: parsed.data.params,
    takes: readDialogue([{ lineId: parsed.data.lineId, text: parsed.data.text, params: parsed.data.params }])[0]?.takes ?? [],
  }
  try {
    const take = await synthesiseVoiceTake({
      userId,
      projectId: parsed.data.projectId,
      shotId: parsed.data.shotId,
      sceneId: parsed.data.sceneId,
      line,
    })
    if (take.skipped || !take.mediaId || !take.mediaPath || !take.storedUrl) {
      return NextResponse.json({ skipped: take.skipped ?? 'no-voice', dialogue: [line] })
    }
    const dialogue = await rememberDialogueTake({
      projectId: parsed.data.projectId,
      shotId: parsed.data.shotId,
      line,
      mediaId: take.mediaId,
      mediaPath: take.mediaPath,
      storedUrl: take.storedUrl,
    })
    return NextResponse.json({ mediaId: take.mediaId, mediaPath: take.mediaPath, dialogue })
  } catch (err) {
    console.warn('[voice_take]', err instanceof Error ? err.message : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. Voice was not submitted.' }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : 'Voice take failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
