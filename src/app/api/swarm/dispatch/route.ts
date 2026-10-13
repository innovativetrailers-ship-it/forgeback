import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ShotListRouter } from '@/lib/routing/ShotListRouter'

const DEPRECATION_HEADERS = {
  Deprecation: 'true',
  Link: '</api/generate/dispatch>; rel="successor-version"',
}
import { checkAndDeductCredits } from '@/lib/credits'
import { z } from 'zod'

const schema = z.object({
  shot_list: z.any(),
  projectId: z.string(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { shot_list, projectId } = parsed.data

  await checkAndDeductCredits(session.user.id, 'generate_standard', shot_list.estimated_total_credits)

  const router = new ShotListRouter()
  // Dispatch async — client polls via SSE on generate/{projectId}/stream
  router.dispatch({
    shotList: shot_list,
    userId: session.user.id,
    projectId,
  }).catch((err) => {
    console.warn("[caught] src/app/api/swarm/dispatch/route.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)
    console.error(err)
  })

  return NextResponse.json(
    { status: 'dispatched', projectId },
    { headers: DEPRECATION_HEADERS },
  )
}
