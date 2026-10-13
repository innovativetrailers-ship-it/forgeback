import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const PRIVATE = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1|fc|fd|fe80)/i

export function hostAllowed(hostname: string, allow: readonly string[]): boolean {
  const host = hostname.toLowerCase()
  return allow.some((item) => host === item.toLowerCase())
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname) && PRIVATE.test(hostname)) throw new Error('Private address refused')
  const records = await lookup(hostname, { all: true })
  for (const record of records) {
    if (PRIVATE.test(record.address) || record.address === '169.254.169.254') {
      throw new Error('Private address refused')
    }
  }
}

const MAX_BYTES = 26_214_400

export async function safeFetch(url: string, allow: readonly string[], init?: RequestInit): Promise<Response> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported protocol')
  if (allow.length > 0 && !hostAllowed(parsed.hostname, allow)) throw new Error('Host is not allowed')
  await assertPublicHost(parsed.hostname)
  const res = await fetch(parsed, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (res.status >= 300 && res.status < 400) throw new Error('Redirects are not followed')
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) throw new Error('Response is too large')
  return res
}
