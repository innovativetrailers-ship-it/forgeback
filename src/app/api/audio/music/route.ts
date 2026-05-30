import { generateMusic }                  from '@/lib/engines/suno'
import { uploadToR2 }                     from '@/lib/storage/r2'
import { deductCredits, OPERATION_COSTS } from '@/lib/credits'
import { db }                             from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    prompt?:        string
    style?:         string
    duration?:      number
    instrumental?:  boolean
    title?:         string
  }
  const { prompt, style, duration, instrumental, title } = body

  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 })

  const durationSecs = duration ?? 60
  const cost = Math.ceil(durationSecs / 30) * OPERATION_COSTS['suno_music_per_30s']

  await deductCredits(db, userId, cost, `Music: ${prompt.slice(0, 40)}`)

  const result   = await generateMusic({ prompt, style, duration: durationSecs, instrumental, title })
  const buffer   = await fetch(result.audioUrl).then(r => r.arrayBuffer())
  const audioUrl = await uploadToR2(
    Buffer.from(buffer),
    `music/${userId}/${Date.now()}.mp3`,
    'audio/mpeg',
  )

  return Response.json({ audioUrl, cost, jobId: result.jobId })
}
