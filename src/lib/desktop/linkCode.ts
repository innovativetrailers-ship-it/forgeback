import { createHash, randomBytes } from 'node:crypto'

export const LINK_TTL_MS = 10 * 60 * 1000
export const LINK_DEVICE_LIMIT = 5
export const LINK_DEVICE_WINDOW_MS = 60 * 60 * 1000
export const LINK_IP_LIMIT = 8
export const LINK_IP_WINDOW_MS = 10 * 60 * 1000

export function newDeviceCode(): string {
  return randomBytes(24).toString('base64url')
}

export function hashClientIp(ip: string): string {
  return createHash('sha256').update(`desktop-link:${ip}`).digest('hex')
}

export function linkExpired(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() <= now
}

export function rateLimitExceeded(count: number, limit: number): boolean {
  return count >= limit
}

/** A code can be approved and polled once, and only by the device that asked for it. */
export function linkPollDecision(input: {
  deviceId: string
  storedDeviceId: string
  expiresAt: Date
  consumedAt: Date | null
  approvedAt: Date | null
  now?: number
}): 'device' | 'expired' | 'used' | 'pending' | 'ready' {
  if (input.deviceId !== input.storedDeviceId) return 'device'
  if (input.consumedAt) return 'used'
  if (linkExpired(input.expiresAt, input.now ?? Date.now())) return 'expired'
  if (!input.approvedAt) return 'pending'
  return 'ready'
}
