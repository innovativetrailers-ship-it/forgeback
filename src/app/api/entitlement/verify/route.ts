import { NextRequest, NextResponse } from 'next/server'
import { verifyEntitlementToken } from '@/lib/entitlement/resolve'

/** Confirms an HMAC entitlement token. Unsigned or expired tokens are rejected. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch((err) => {
    console.warn('[entitlement] verify', err instanceof Error ? err.message : err)
    return null
  }) as { token?: string } | null
  const token = body?.token?.trim() ?? ''
  const claims = token ? verifyEntitlementToken(token) : null
  if (!claims || claims.canUseDesktop !== true) {
    return NextResponse.json({ valid: false })
  }
  return NextResponse.json({
    valid: true,
    internal: claims.internal === true,
    userId: typeof claims.userId === 'string' ? claims.userId : null,
  })
}
