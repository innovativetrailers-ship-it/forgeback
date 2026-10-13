import { trainerDef, type DatasetMedia, type TrainerDef } from './trainerRegistry'
import { isGenreFamily } from './genrePresets'

export const IMPORT_DOMAINS = ['movie', 'tv', 'anime', 'documentary', 'sport', 'racing'] as const
export type ImportDomain = (typeof IMPORT_DOMAINS)[number]

export const COPYRIGHT_CONSENT_DOMAINS: readonly ImportDomain[] = ['movie', 'tv', 'anime']

/** User content is never used to train platform models. */
export const PLATFORM_TRAINS_ON_USER_CONTENT = false

export interface ImportPrep {
  domain: ImportDomain
  captionGuidance: string
  trainerKey: string
  trainer: TrainerDef
  isolateSubject: boolean
  requiresOwnedOrLicensed: boolean
  requiresSubjectConsent: boolean
  rightsNotice: string
}

export function isImportDomain(value: string): value is ImportDomain {
  return (IMPORT_DOMAINS as readonly string[]).includes(value)
}

function pickTrainer(key: string): TrainerDef {
  const trainer = trainerDef(key)
  if (!trainer) throw new Error(`${key} trainer missing`)
  return trainer
}

function captionFor(domain: ImportDomain): string {
  switch (domain) {
    case 'movie':
      return 'Caption each clip with shot size, motivated light, and production design. Vary angles; keep grade consistent.'
    case 'tv':
      return 'Caption episodic coverage: character blocking, interior practicals, recurring set. Consistency across episodes is the point.'
    case 'anime':
      return 'Caption frames with line quality, palette, and motion (hold, smear, or pers). Own or licensed material only.'
    case 'documentary':
      return 'Caption handheld vs locked-off, available light, archival vs observational. Note narrator space if present.'
    case 'sport':
      return 'Caption play vs sideline vs crowd. Note lens length, slow-mo vs live, broadcast graphics if in frame (describe, do not copy marks).'
    case 'racing':
      return 'Caption onboard vs chase vs pit. Note speed smear, weather, and track vs cockpit.'
  }
}

function trainerKeyFor(domain: ImportDomain, kinds: Set<DatasetMedia>, tab?: string): string {
  if (tab === 'cast' || tab === 'assets') return 'h3-ref2va'
  if (tab === 'music') return 'stable-audio-3'
  if (domain === 'anime') {
    if (kinds.has('image') && !kinds.has('video')) return 'flux-2'
    return 'ltx-23-video'
  }
  if (domain === 'racing' || domain === 'sport') {
    if (kinds.has('audio') && !kinds.has('video') && !kinds.has('image')) return 'stable-audio-3'
    if (kinds.has('video')) return 'ltx-23-video'
    return 'h3-t2v'
  }
  if (kinds.has('image') && !kinds.has('video')) return 'flux-2'
  return 'h3-t2v'
}

export function importPrep(input: {
  domain: ImportDomain
  kinds?: DatasetMedia[]
  tab?: string
}): ImportPrep {
  const kinds = new Set(input.kinds ?? [])
  const trainerKey = trainerKeyFor(input.domain, kinds, input.tab)
  const requiresOwnedOrLicensed = COPYRIGHT_CONSENT_DOMAINS.includes(input.domain)
  const requiresSubjectConsent = input.tab === 'cast' || input.tab === 'voices'
  return {
    domain: input.domain,
    captionGuidance: captionFor(input.domain),
    trainerKey,
    trainer: pickTrainer(trainerKey),
    isolateSubject: input.tab === 'cast' || input.tab === 'assets',
    requiresOwnedOrLicensed,
    requiresSubjectConsent,
    rightsNotice: requiresOwnedOrLicensed
      ? 'Confirm you own or are licensed for this movie/TV/anime material. It is held only to train your LoRA. The platform does not train its models on it.'
      : 'Imported media is yours. It is held only to train your LoRA and is deleted with the asset. The platform does not train its models on it.',
  }
}

export function domainFromSubcategory(subcategory?: string): ImportDomain | null {
  if (subcategory && isImportDomain(subcategory)) return subcategory
  if (subcategory && isGenreFamily(subcategory)) return subcategory
  return null
}

export class TrainingConsentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrainingConsentError'
  }
}

export function assertTrainingConsent(input: {
  tab?: string
  subcategory?: string
  importDomain?: string
  ownedOrLicensed?: boolean
  subjectConsent?: boolean
  footageIncludesCopyrightedTitles?: boolean
}): void {
  const domain = input.importDomain && isImportDomain(input.importDomain)
    ? input.importDomain
    : domainFromSubcategory(input.subcategory)
  const copyrighted = Boolean(
    input.footageIncludesCopyrightedTitles
    || (domain && COPYRIGHT_CONSENT_DOMAINS.includes(domain)),
  )
  if (copyrighted && input.ownedOrLicensed !== true) {
    throw new TrainingConsentError(
      'Confirm you own or are licensed for this movie/TV/anime material before training',
    )
  }
  if ((input.tab === 'cast' || input.tab === 'voices') && input.subjectConsent !== true) {
    throw new TrainingConsentError(
      'Confirm the subject consents to a face LoRA or voice clone before training',
    )
  }
}

export function cameraPatchFromPreset(defaults: {
  angle?: string
  movement?: string
  shotSize?: string
  lens?: string
  speed?: string
}, current: {
  cameraAngle?: string | null
  cameraMove?: string | null
  shotSize?: string | null
  lensFeel?: string | null
  cameraSpeed?: string | null
}): {
  cameraAngle?: string
  cameraMove?: string
  shotSize?: string
  lensFeel?: string
  cameraSpeed?: string
} {
  return {
    ...(current.cameraAngle?.trim() ? {} : defaults.angle ? { cameraAngle: defaults.angle } : {}),
    ...(current.cameraMove?.trim() ? {} : defaults.movement ? { cameraMove: defaults.movement } : {}),
    ...(current.shotSize?.trim() ? {} : defaults.shotSize ? { shotSize: defaults.shotSize } : {}),
    ...(current.lensFeel?.trim() ? {} : defaults.lens ? { lensFeel: defaults.lens } : {}),
    ...(current.cameraSpeed?.trim() ? {} : defaults.speed ? { cameraSpeed: defaults.speed } : {}),
  }
}
