import { db } from '@/lib/db'
import { verifyReviewPin } from '@/lib/review/pin'

export async function openReviewLink(token: string, pin: string | null) {
  const link = await db.reviewLink.findUnique({
    where: { token },
    include: { comments: { orderBy: { createdAt: 'asc' as const } } },
  })
  if (!link) return { ok: false as const, status: 404, error: 'Review portal not found' }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { ok: false as const, status: 410, error: 'Review link expired' }
  }
  if (link.pinHash) {
    if (!pin) return { ok: false as const, status: 401, error: 'PIN required' }
    if (!verifyReviewPin(pin, link.pinHash)) return { ok: false as const, status: 401, error: 'Wrong PIN' }
  }
  return { ok: true as const, link }
}

export function reviewPinFrom(req: { headers: { get(name: string): string | null } }): string | null {
  const header = req.headers.get('x-review-pin')
  return header?.trim() || null
}
