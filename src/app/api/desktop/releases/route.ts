import { NextResponse } from 'next/server'
import { getDesktopReleaseStatus } from '@/lib/desktop/releases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getDesktopReleaseStatus()
  return NextResponse.json({
    version: status.version,
    available: status.available,
    macNotarized: status.macNotarized,
    signed: status.signed,
    notarized: status.notarized,
    windowsSigned: status.windowsSigned,
    verifiedAt: status.verifiedAt,
    feedBase: status.feedBase,
    message: status.message,
    downloads: {
      mac_arm: '/api/desktop/download?platform=mac_arm',
      mac_intel: '/api/desktop/download?platform=mac_intel',
      windows: '/api/desktop/download?platform=windows',
    },
  })
}
