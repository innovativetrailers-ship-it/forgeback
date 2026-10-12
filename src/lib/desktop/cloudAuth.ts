import { type NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'

/** Desktop cloud relay. The caller must present a signed entitlement bearer. */
export async function validateDesktopCloudRequest(request: NextRequest): Promise<string | NextResponse> {
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return user.id
}
