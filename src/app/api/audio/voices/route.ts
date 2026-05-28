import { listVoices } from '@/lib/engines/elevenLabs'
import { db }         from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [stock, cloned] = await Promise.all([
    listVoices(),
    db.clonedVoice.findMany({ where: { userId } }),
  ])
  return Response.json({ stockVoices: stock, clonedVoices: cloned })
}
