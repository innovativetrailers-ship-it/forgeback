import { NextRequest, NextResponse } from 'next/server'
import { openReviewLink, reviewPinFrom } from '@/lib/review/gate'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const opened = await openReviewLink(token, reviewPinFrom(req))
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status })
  if (!opened.link.proxyUrl) {
    return NextResponse.json({ error: 'This review has no proxy yet.' }, { status: 404 })
  }
  return NextResponse.redirect(opened.link.proxyUrl, { status: 302 })
}
