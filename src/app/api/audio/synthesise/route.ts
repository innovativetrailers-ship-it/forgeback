import { synthesiseVoice }                from '@/lib/engines/elevenLabs'
import { uploadToR2 }                     from '@/lib/storage/r2'
import { deductCredits, OPERATION_COSTS } from '@/lib/credits'
import { db }                             from '@/lib/db'
import { checkAccess }                    from '@/lib/access/guard'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: Request) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, voiceId, stability, similarity } = await req.json() as {
    text:        string
    voiceId?:    string
    stability?:  number
    similarity?: number
  }

  if (!text?.trim()) return Response.json({ error: 'text is required' }, { status: 400 })

  const cost = Math.max(1, Math.ceil(text.length / 100)) * OPERATION_COSTS['elevenlabs_tts_per_100_chars']

  const access = await checkAccess(userId, cost)
  if (!access.allowed) return Response.json({ error: access.reason }, { status: access.code })

  await deductCredits(db, userId, cost, `TTS: ${text.slice(0, 40)}`)

  // Long scripts (>2500 chars) — queue as a job so the frontend can track progress
  if (text.length > 2500) {
    const job = await db.renderJob.create({
      data: {
        userId,
        status:        'QUEUED',
        mode:          'voice',
        prompt:        text.slice(0, 100),
        progressPct:   0,
        statusMessage: 'Queued',
        metadata:      { voiceId, stability, similarity, cost },
      },
    })
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add('voice', { jobId: job.id, userId, text, voiceId, stability, similarity }, { attempts: 1 })
    return Response.json({ jobId: job.id, queued: true, cost })
  }

  // Short text — synchronous, returns the audio URL immediately
  const buf = await synthesiseVoice({ text, voiceId, stability, similarity })
  const url = await uploadToR2(buf, `audio/${userId}/${Date.now()}.mp3`, 'audio/mpeg')
  return Response.json({ audioUrl: url, cost })
}
