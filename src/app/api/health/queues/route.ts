import { NextRequest, NextResponse } from 'next/server'
import { renderQueue, trainingQueue, exportQueue } from '@/lib/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifyWorkerToken(req: NextRequest): boolean {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  return token === process.env.WORKER_HEALTH_TOKEN
}

export async function GET(req: NextRequest) {
  if (!verifyWorkerToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [renderCounts, trainingCounts, exportCounts] = await Promise.all([
      renderQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      trainingQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      exportQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    ])

    return NextResponse.json({
      queues: {
        render: renderCounts,
        training: trainingCounts,
        export: exportCounts,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.warn("[caught] src/app/api/health/queues/route.ts:32", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
