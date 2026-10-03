import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ServiceStatus {
  ok: boolean
  latencyMs?: number
  error?: string
}

async function checkDb(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    console.warn("[caught] src/app/api/health/route.ts:19", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { ok: false, error: (err as Error).message }
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await redis.ping()
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    console.warn("[caught] src/app/api/health/route.ts:29", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { ok: false, error: (err as Error).message }
  }
}

export async function GET() {
  const [dbStatus, redisStatus] = await Promise.all([checkDb(), checkRedis()])

  const allOk = dbStatus.ok && redisStatus.ok
  const status = allOk ? 200 : 503

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    },
    { status }
  )
}
