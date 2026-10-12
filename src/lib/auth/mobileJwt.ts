import { jwtVerify } from 'jose'

export async function mobileUserId(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch (err) {
    console.warn('[auth] bearer', err instanceof Error ? err.message : err)
    return null
  }
}
