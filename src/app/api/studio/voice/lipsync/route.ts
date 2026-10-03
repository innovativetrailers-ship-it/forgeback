import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { alignTake } from '@/lib/audio/voiceTake'
import { readAlignmentWords, applyLipSyncToShot } from '@/lib/orchestration/lipSyncPass'
import { db } from '@/lib/db'
import { signedUrlForStoredKey } from '@/lib/media/resolveStoredMedia'
import { objectKeyFromStored } from '@/lib/storage/r2'

const schema = z.object({
  projectId: z.string().min(1),
  shotId: z.string().min(1),
  text: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lip-sync request' }, { status: 400 })
  const line = await db.audioTrack.findFirst({
    where: { projectId: parsed.data.projectId, shotPlanId: parsed.data.shotId, type: 'DIALOGUE' },
  })
  if (!line?.url) return NextResponse.json({ error: 'Select a voice take first' }, { status: 400 })
  const key = objectKeyFromStored(line.url)
  const audioUrl = key ? await signedUrlForStoredKey(key) : line.url
  if (!audioUrl) return NextResponse.json({ error: 'Voice audio is not stored' }, { status: 404 })
  try {
    const aligned = await alignTake({ audioUrl, text: parsed.data.text })
    const words = readAlignmentWords((aligned as { words?: unknown }).words)
    console.log('[lipsync_alignment]', JSON.stringify({ shotId: parsed.data.shotId, words: words.length }))
    await db.audioTrack.update({
      where: { id: line.id },
      data: { alignmentWords: JSON.parse(JSON.stringify(words)), url: line.url },
    })
    const videoUrl = await applyLipSyncToShot(parsed.data.shotId, parsed.data.projectId, 'draft')
    return NextResponse.json({ videoUrl, words: words.length })
  } catch (err) {
    console.warn('[voice_lipsync]', err instanceof Error ? err.message : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. Lip-sync was not submitted.' }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : 'Lip-sync failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
