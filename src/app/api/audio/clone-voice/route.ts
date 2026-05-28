import { cloneVoice }                      from '@/lib/engines/elevenLabs'
import { deductCredits, OPERATION_COSTS }  from '@/lib/credits'
import { db }                              from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description, audioUrls } = await req.json() as {
    name:        string
    description: string
    audioUrls:   string[]
  }

  await deductCredits(db, userId, OPERATION_COSTS['elevenlabs_clone_voice'], `Clone voice: ${name}`)
  const { voiceId } = await cloneVoice({ name, description, audioUrls })
  await db.clonedVoice.create({ data: { userId, voiceId, name, description } })
  return Response.json({ voiceId })
}
