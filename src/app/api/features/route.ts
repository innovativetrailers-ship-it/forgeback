import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cleanContext, cleanText, parseKind } from '@/lib/features/request'

const HOUR = 60 * 60 * 1000
const LIMIT = 5

async function reviewer(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, isInternal: true } })
  return Boolean(user && (user.role === 'ADMIN' || user.isInternal))
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mine = await db.featureRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, kind: true, title: true, body: true, status: true, devNote: true, upvotes: true, createdAt: true },
  })
  return NextResponse.json({
    admin: await reviewer(userId),
    requests: mine.map((row) => ({ ...row, title: cleanText(row.title, 120), body: cleanText(row.body, 4000), devNote: row.devNote ? cleanText(row.devNote, 2000) : null })),
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[feature-request]', err instanceof Error ? err.message : err)
    return null
  }) as { kind?: unknown; title?: unknown; body?: unknown; context?: unknown } | null
  const kind = parseKind(body?.kind)
  const title = cleanText(body?.title, 120)
  const text = cleanText(body?.body, 4000)
  if (!kind || title.length < 3 || text.length < 8) {
    return NextResponse.json({ error: 'A request needs a kind, a title, and a short description' }, { status: 400 })
  }
  const recent = await db.featureRequest.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - HOUR) } },
  })
  if (recent >= LIMIT) return NextResponse.json({ error: 'Too many requests this hour' }, { status: 429 })
  const context = cleanContext(body?.context)
  const created = await db.featureRequest.create({
    data: { userId, kind, title, body: text, context },
    select: { id: true, status: true },
  })
  const notifyTo = process.env.FEATURE_REQUEST_NOTIFY_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (notifyTo && apiKey) {
    void fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.REVIEW_EMAIL_FROM ?? 'reviews@cinematicforge.ai',
        to: notifyTo,
        subject: `[Forge] ${kind}: ${title}`,
        text: `New ${kind} request ${created.id} from user ${userId}.\n\n${text}`,
      }),
    }).catch((err: unknown) => {
      console.warn('[feature-request] notify', err instanceof Error ? err.message : err)
    })
  }
  return NextResponse.json({ id: created.id, status: created.status, message: 'Thanks. The team will review this.' })
}
