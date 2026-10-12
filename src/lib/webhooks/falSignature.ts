import { createHmac, timingSafeEqual } from 'node:crypto'

const FAL_HOSTS = ['.fal.media', '.fal.ai']

function secret(): string {
  const key = process.env.FAL_WEBHOOK_SECRET?.trim()
  if (!key) throw new Error('FAL_WEBHOOK_SECRET is not set')
  return key
}

export function signFalWebhookToken(subjectId: string, ttlSec = 86_400, nowSec = Math.floor(Date.now() / 1000)): string {
  const key = secret()
  if (!key) throw new Error('NEXTAUTH_SECRET is not set')
  const body = `${subjectId}.${nowSec + ttlSec}`
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyFalWebhookToken(token: string, nowSec = Math.floor(Date.now() / 1000)): string | null {
  let key = ''
  try { key = secret() } catch (err) {
    console.warn('[fal-webhook]', err instanceof Error ? err.message : err)
    return null
  }
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [subjectId, expRaw, sig] = parts
  const exp = Number(expRaw)
  if (!subjectId || !Number.isFinite(exp) || exp < nowSec) return null
  const expected = createHmac('sha256', key).update(`${subjectId}.${expRaw}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return subjectId
}

export function falWebhookUrl(base: string, subjectId: string): string {
  const url = new URL(base)
  url.searchParams.set('token', signFalWebhookToken(subjectId))
  return url.toString()
}

/** Accept only media URLs hosted by the provider. */
export function isFalMediaUrl(raw: string | undefined): boolean {
  if (!raw) return false
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    return FAL_HOSTS.some((host) => url.hostname === host.slice(1) || url.hostname.endsWith(host))
  } catch (err) {
    console.warn('[fal-webhook]', err instanceof Error ? err.message : err)
    return false
  }
}
