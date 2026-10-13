import { listVoices } from '@/lib/engines/elevenLabs'
import { db }         from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: Request) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [stock, cloned] = await Promise.all([
    listVoices(),
    db.clonedVoice.findMany({ where: { userId } }),
  ])
  return Response.json({ stockVoices: stock, clonedVoices: cloned })
}
