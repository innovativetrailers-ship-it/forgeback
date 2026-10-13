import { type NextRequest, NextResponse } from 'next/server'
import { getAgentHealth } from '@/lib/cognition'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest): Promise<NextResponse> {
  if ((await requireUser(req))?.role ?? null !== 'ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [episodic, semantic, policies, downModels] = await Promise.all([
    db.episodicMemory.count(),
    db.semanticMemory.count(),
    db.routingPolicy.count(),
    db.modelPerformance.count({ where: { status: 'down' } }),
  ])

  return NextResponse.json({
    agents: getAgentHealth(),
    memory: { episodic, semantic, routingPolicies: policies },
    routing: { modelsDown: downModels },
  })
}
