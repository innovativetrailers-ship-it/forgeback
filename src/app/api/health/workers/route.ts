import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.WORKER_HEALTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Workers publish heartbeats to Redis every 30s
    const workerKeys = await redis.keys('worker:heartbeat:*')
    const heartbeats: Record<string, unknown> = {}

    for (const key of workerKeys) {
      const val = await redis.get(key)
      const workerName = key.replace('worker:heartbeat:', '')
      heartbeats[workerName] = val ? JSON.parse(val) : null
    }

    const now = Date.now()
    const workerStatus = Object.entries(heartbeats).map(([name, hb]) => {
      const beat = hb as { ts?: number; pid?: number; hostname?: string } | null
      const alive = beat?.ts ? (now - beat.ts) < 60_000 : false
      return { name, alive, lastSeen: beat?.ts ? new Date(beat.ts).toISOString() : null, pid: beat?.pid }
    })

    const allAlive = workerStatus.every((w) => w.alive)
    return NextResponse.json(
      { ok: allAlive, workers: workerStatus, timestamp: new Date().toISOString() },
      { status: allAlive ? 200 : 503 }
    )
  } catch (err) {
    console.warn("[caught] src/app/api/health/workers/route.ts:36", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
