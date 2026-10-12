import { NextResponse } from 'next/server'
import { authSecret } from '@/lib/auth/requiredEnv'
import { db } from '@/lib/db'
import { jwtVerify } from 'jose'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    const encodedUserId = (await requireUser(req))?.id ?? null

    let userId: string | undefined

    // Mobile JWT auth
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const secret = new TextEncoder().encode(authSecret())
      const { payload } = await jwtVerify(token, secret)
      userId = payload.sub
    }
    // Web session auth (x-user-id injected by middleware)
    else if (encodedUserId) {
      userId = Buffer.from(encodedUserId, 'base64').toString()
    }

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const jobs = await db.renderJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, type: true, status: true, progressPct: true,
        outputUrl: true, errorMessage: true, inputPayload: true,
        createdAt: true, updatedAt: true,
      },
    })

    const formatted = jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      progress: j.progressPct,
      outputUrl: j.outputUrl,
      message: j.errorMessage,
      payload: (j.inputPayload as Record<string, unknown>) ?? {},
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    }))

    return NextResponse.json({ jobs: formatted })
  } catch (err) {
    console.error('[jobs/list]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
