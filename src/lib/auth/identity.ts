/** Identity headers are written only by the proxy from a verified session. Routes never read them. */

export const SPOOFED_IDENTITY_HEADERS = ['x-user-id', 'x-user-role', 'x-forge-desktop'] as const

const PUBLIC_API = [
  '/api/auth',
  '/api/webhooks',
  '/api/cron',
  '/api/desktop/link/start',
  '/api/desktop/link/poll',
  '/api/entitlement/heartbeat',
  '/api/entitlement/verify',
  '/api/desktop/releases',
]

export function stripSpoofedIdentity(headers: Headers): Headers {
  const next = new Headers(headers)
  for (const name of SPOOFED_IDENTITY_HEADERS) next.delete(name)
  return next
}

export function isPublicApi(pathname: string): boolean {
  return PUBLIC_API.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** True when an /api request has neither a session nor a bearer and is not on the public list. */
export function anonymousApiBlocked(pathname: string, hasSession: boolean, hasBearer: boolean): boolean {
  if (!pathname.startsWith('/api/')) return false
  if (isPublicApi(pathname)) return false
  return !hasSession && !hasBearer
}
