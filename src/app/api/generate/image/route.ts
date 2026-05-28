import { generateWithNanoBanana }          from '@/lib/engines/nanoBanana'
import { deductCredits, OPERATION_COSTS }  from '@/lib/credits'
import { db }                              from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await req.json() as { quality?: string; prompt?: string }
  const cost   = params.quality === 'pro'
    ? OPERATION_COSTS['nano-banana-pro']
    : OPERATION_COSTS['nano-banana-2']

  await deductCredits(db, userId, cost, `Image: ${params.prompt?.slice(0, 60) ?? ''}`)
  const result = await generateWithNanoBanana(params)
  return Response.json(result)
}
