import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashReviewPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 32).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyReviewPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [kind, salt, hash] = stored.split(':')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const next = scryptSync(pin, salt, 32)
  const prev = Buffer.from(hash, 'hex')
  if (next.length !== prev.length) return false
  return timingSafeEqual(next, prev)
}

export const REVIEW_EXPIRY = ['24h', '7d', '30d', 'never'] as const
export type ReviewExpiry = (typeof REVIEW_EXPIRY)[number]

export function expiryDate(preset: ReviewExpiry, now = Date.now()): Date | null {
  if (preset === 'never') return null
  const hours = preset === '24h' ? 24 : preset === '7d' ? 168 : 720
  return new Date(now + hours * 60 * 60 * 1000)
}

export function watermarkLabel(name: string, showDate: boolean, now = new Date()): string {
  const who = name.trim() || 'Review'
  if (!showDate) return who
  return `${who} · ${now.toISOString().slice(0, 10)}`
}
