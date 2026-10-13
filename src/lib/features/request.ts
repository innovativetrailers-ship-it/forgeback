const KINDS = ['feature', 'tool', 'bug', 'other'] as const
const STATUSES = ['new', 'reviewing', 'planned', 'in_progress', 'implemented', 'declined'] as const

export type FeatureKind = (typeof KINDS)[number]
export type FeatureStatus = (typeof STATUSES)[number]

export function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, max)
}

export function cleanContext(value: unknown): { route: string; screen: string; platform: 'web' | 'desktop'; version: string } {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    route: cleanText(row.route, 200),
    screen: cleanText(row.screen, 120),
    platform: row.platform === 'desktop' ? 'desktop' : 'web',
    version: cleanText(row.version, 40),
  }
}

export function parseKind(value: unknown): FeatureKind | null {
  return KINDS.includes(value as FeatureKind) ? value as FeatureKind : null
}

export function parseStatus(value: unknown): FeatureStatus | null {
  return STATUSES.includes(value as FeatureStatus) ? value as FeatureStatus : null
}
