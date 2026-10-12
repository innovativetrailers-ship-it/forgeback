import { generateWithNanoBanana }          from '@/lib/engines/nanoBanana'
import { deductCredits, OPERATION_COSTS }  from '@/lib/credits'
import { db }                              from '@/lib/db'
import { checkAccess }                     from '@/lib/access/guard'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: Request) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await req.json() as { quality?: string; prompt?: string; [key: string]: unknown }
  if (!params.prompt) return Response.json({ error: 'prompt required' }, { status: 400 })

  const cost = params.quality === 'pro'
    ? OPERATION_COSTS['nano-banana-pro']
    : OPERATION_COSTS['nano-banana-2']

  const access = await checkAccess(userId, cost)
  if (!access.allowed) return Response.json({ error: access.reason }, { status: access.code })

  await deductCredits(db, userId, cost, `Image: ${params.prompt.slice(0, 60)}`)
  const result = await generateWithNanoBanana(params as Parameters<typeof generateWithNanoBanana>[0])
  return Response.json(result)
}
