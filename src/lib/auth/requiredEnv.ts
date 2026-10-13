/** Fail at init with a named var — turns generic Configuration into an actionable log line. */
export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`AUTH MISCONFIG: ${name} is missing on this environment`)
  }
  return value
}

const isAuthBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

export function authSecret(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ?? process.env.NEXTAUTH_SECRET?.trim()
  if (secret) return secret
  if (isAuthBuildPhase) return 'build-phase-placeholder'
  throw new Error('AUTH MISCONFIG: AUTH_SECRET (or NEXTAUTH_SECRET) is missing')
}
