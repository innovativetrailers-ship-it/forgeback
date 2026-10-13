import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function redactDesktop(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+/g, '/Users/redacted')
    .replace(/\/home\/[^/\s]+/g, '/home/redacted')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\redacted')
    .replace(/projectId["']?\s*[:=]\s*["'][^"']+["']/gi, 'projectId=redacted')
}

export const maxDuration = 30

/** Receives V3 desktop crash reports (JSON from crash.ts upload). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') ?? ''
  let payload: unknown

  if (contentType.includes('application/json')) {
    payload = await request.json()
  } else {
    payload = await request.text()
  }

  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const message = typeof body.message === 'string' && body.message.trim()
    ? body.message.trim()
    : 'Desktop crash'
  const kind = typeof body.kind === 'string' ? body.kind : 'desktop'
  const version = typeof body.version === 'string' ? body.version : 'unknown'
  const platform = typeof body.platform === 'string' ? body.platform : 'unknown'
  const arch = typeof body.arch === 'string' ? body.arch : 'unknown'
  const channel = typeof body.channel === 'string' ? body.channel : 'stable'
  const stack = redactDesktop(typeof body.stack === 'string' ? body.stack : message)
  const safeMessage = redactDesktop(message)
  const signature = createHash('sha256').update(`${channel}:${kind}:${safeMessage}`).digest('hex').slice(0, 32)
  const report = { version, platform, arch, channel, kind, message: safeMessage, stack }
  console.error('[V3 crash]', JSON.stringify({ version, platform, arch, channel, kind }))
  await db.shotError.create({
    data: {
      model: 'desktop',
      endpoint: 'desktop/crash',
      stage: kind,
      rawError: stack,
      userMessage: safeMessage,
      suggestedAction: 'Retry the last action. The crash is in the error list with the desktop version and channel.',
      category: 'desktop_crash',
      correctable: false,
      interpretedBy: 'desktop-crash',
      signature,
      providerLogs: report,
    },
  }).catch((err) => {
    console.warn('[V3 crash] shot error', err instanceof Error ? err.message : err)
  })

  return NextResponse.json({ received: true })
}
