export type CreativeLicense = 'faithful' | 'interpretive'

export function parseCreativeLicense(value: unknown): CreativeLicense {
  return value === 'interpretive' ? 'interpretive' : 'faithful'
}

export function nameAppearsInScript(name: string, script: string): boolean {
  const token = name.trim().toLowerCase()
  if (token.length < 3) return false
  const hay = script.toLowerCase()
  if (hay.includes(token)) return true
  const stem = token.replace(/(es|s)$/, '')
  return stem.length >= 4 && hay.includes(stem)
}
