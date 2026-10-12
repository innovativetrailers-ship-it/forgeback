import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  LINK_DEVICE_LIMIT,
  LINK_DEVICE_WINDOW_MS,
  LINK_IP_LIMIT,
  LINK_IP_WINDOW_MS,
  LINK_TTL_MS,
  hashClientIp,
  newDeviceCode,
  rateLimitExceeded,
} from '@/lib/desktop/linkCode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch((err) => {
    console.warn('[desktop-link] start', err instanceof Error ? err.message : err)
    return null
  }) as { deviceId?: string; deviceName?: string } | null
  const deviceId = body?.deviceId?.trim() ?? ''
  if (!deviceId || deviceId.length > 128) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  }
  const now = new Date()
  const deviceCount = await db.desktopLinkCode.count({
    where: { deviceId, createdAt: { gt: new Date(now.getTime() - LINK_DEVICE_WINDOW_MS) } },
  })
  if (rateLimitExceeded(deviceCount, LINK_DEVICE_LIMIT)) {
    return NextResponse.json({ error: 'Too many link codes for this computer. Wait and try again.' }, { status: 429 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipHash = hashClientIp(ip)
  const ipCount = await db.desktopLinkCode.count({
    where: { ipHash, createdAt: { gt: new Date(now.getTime() - LINK_IP_WINDOW_MS) } },
  })
  if (rateLimitExceeded(ipCount, LINK_IP_LIMIT)) {
    return NextResponse.json({ error: 'Too many link attempts. Wait and try again.' }, { status: 429 })
  }
  const code = newDeviceCode()
  const deviceName = body?.deviceName?.trim().slice(0, 80) || null
  await db.desktopLinkCode.create({
    data: {
      code,
      deviceId,
      deviceName,
      ipHash,
      expiresAt: new Date(now.getTime() + LINK_TTL_MS),
    },
  })
  return NextResponse.json({ code, expiresInSec: LINK_TTL_MS / 1000, deviceName })
}
