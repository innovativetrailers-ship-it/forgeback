import { requireUser } from '@/lib/auth/requireUser'
/**
 * POST /api/export/dcp — Digital Cinema Package (DCP) export
 * Calls the Python DCP microservice running on port 7433.
 * Output: DCP package folder (ASSETMAP, CPL, PKL, MXF video + audio)
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { checkAccess, checkTierAccess } from '@/lib/access/guard'
import { enforcePermission }            from '@/lib/access/enforce'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // DCP export requires Ultimate tier
  const exportGate = await checkAccess(userId, 0)
  if (!exportGate.allowed) return NextResponse.json({ error: exportGate.reason }, { status: exportGate.code })
  const exportPerm = enforcePermission(exportGate.tier, 'export_4k')
  if (!exportPerm.allowed) return NextResponse.json({ error: exportPerm.reason, upgrade: exportPerm.upgrade }, { status: 403 })
  const tierAccess = await checkTierAccess(userId, 'export_dcp')
  if (!tierAccess.allowed) {
    return NextResponse.json({
      error:        tierAccess.reason,
      requiredTier: tierAccess.requiredTier,
      upgradeUrl:   '/pricing',
    }, { status: 403 })
  }

  const body = await req.json() as {
    videoUrl:      string
    audioUrl?:     string
    subtitleUrl?:  string
    title:         string
    contentKind?:  'feature' | 'trailer' | 'short'
    rating?:       string   // e.g. "PG-13"
  }

  if (!body.videoUrl || !body.title) {
    return NextResponse.json({ error: 'videoUrl and title required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'dcp_export')

  const imfUrl = process.env.IMF_SERVICE_URL ?? 'http://localhost:7433'

  try {
    const res = await fetch(`${imfUrl}/export/dcp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, userId }),
      signal:  AbortSignal.timeout(600_000),  // 10 minute timeout for DCP creation
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`DCP service error: ${err}`)
    }

    const result = await res.json() as { dcpUrl: string; packageSize: number; assetList: string[] }
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 50, 'DCP export failed')
    console.error('[export/dcp]', err)
    return NextResponse.json({ error: 'DCP export failed — microservice unavailable' }, { status: 503 })
  }
}
