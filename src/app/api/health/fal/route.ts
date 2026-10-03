/**
 * fal.ai account health — zero-cost queue probes (no generation spend).
 * GET /api/health/fal
 */
import { NextResponse } from 'next/server'
import { checkFalAccountHealth } from '@/lib/fal/accountStatus'
import { hasFalKey } from '@/lib/config/keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!hasFalKey()) {
    return NextResponse.json({
      ok: false,
      error: 'FAL_KEY is not configured on this deployment',
    }, { status: 503 })
  }

  try {
    const health = await checkFalAccountHealth()
    return NextResponse.json({
      ok: health.ok,
      keyPrefix: health.keyPrefix,
      working: health.working,
      locked: health.locked,
      message: health.message,
      probes: health.probes.map((p) => ({
        endpoint: p.endpoint,
        status: p.status,
        code: p.code,
      })),
    }, { status: health.ok ? 200 : 503 })
  } catch (err) {
    console.warn("[caught] src/app/api/health/fal/route.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
