import { continuityPriorityFor, shotContinuityFlag } from './chainContinuity'

export interface PremiseElement {
  id: string
  name: string
  description: string
}

/** Immutable who / what / where. Later stages may change how the film is told. */
export interface PremiseLock {
  characters: PremiseElement[]
  settings: PremiseElement[]
  story: string
  genre: string
  tone: string
}

export const SHOT_PURPOSES = [
  'hero',
  'fill',
  'camera',
  'consistency',
  'continuity',
  'dialogue',
  'motion',
  'draft',
  'stylized',
] as const

export type ShotPurpose = (typeof SHOT_PURPOSES)[number]

const STORY_ID = 'story'

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'onto', 'over',
  'under', 'through', 'about', 'after', 'before', 'their', 'they', 'them',
])

export interface PremiseShot {
  visualPrompt?: string
  premiseElementIds?: string[]
  purpose?: string
  contentType?: string
  shotIndex: number
  sceneNumber?: number
  startsAtHardCut?: boolean
  charactersPresent?: string[]
  locationsPresent?: string[]
}

export function premiseElements(lock: PremiseLock): PremiseElement[] {
  return [...lock.characters, ...lock.settings]
}

export function formatPremise(lock: PremiseLock): string {
  const who = lock.characters.map((el) => `${el.id} ${el.name}: ${el.description}`).join('\n') || 'none'
  const where = lock.settings.map((el) => `${el.id} ${el.name}: ${el.description}`).join('\n') || 'none'
  return [
    `WHO\n${who}`,
    `WHERE\n${where}`,
    `WHAT\n${lock.story}`,
    `GENRE ${lock.genre}`,
    `TONE ${lock.tone}`,
  ].join('\n\n')
}

function asElement(value: unknown, index: number, prefix: string): PremiseElement | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!name) return null
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `${prefix}${index + 1}`
  const description = typeof row.description === 'string' ? row.description.trim() : ''
  return { id, name, description }
}

export function parsePremiseLock(raw: unknown): PremiseLock | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const story = typeof row.story === 'string' ? row.story.trim() : ''
  if (!story) return null
  const characters = Array.isArray(row.characters)
    ? row.characters.map((item, index) => asElement(item, index, 'c')).filter((el): el is PremiseElement => Boolean(el))
    : []
  const settings = Array.isArray(row.settings)
    ? row.settings.map((item, index) => asElement(item, index, 's')).filter((el): el is PremiseElement => Boolean(el))
    : []
  return {
    characters,
    settings,
    story,
    genre: typeof row.genre === 'string' ? row.genre.trim() : '',
    tone: typeof row.tone === 'string' ? row.tone.trim() : '',
  }
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .filter((word) => word.length >= 3 && !STOP.has(word))
}

function mentions(hay: string, text: string): boolean {
  const words = tokens(text)
  if (!words.length) return hay.includes(text.toLowerCase().trim())
  return words.some((word) => hay.includes(word))
}

function knownIds(lock: PremiseLock): Map<string, PremiseElement | 'story'> {
  const map = new Map<string, PremiseElement | 'story'>()
  for (const el of premiseElements(lock)) map.set(el.id, el)
  map.set(STORY_ID, 'story')
  return map
}

/** Structural fidelity. A shot with no premise element, or a prompt that never features that element, is drift. */
export function groundingCheck(
  shot: { visualPrompt?: string; premiseElementIds?: string[] },
  premise: PremiseLock,
): { grounded: boolean; reason?: string } {
  const ids = (shot.premiseElementIds ?? []).map((id) => id.trim()).filter(Boolean)
  if (!ids.length) return { grounded: false, reason: 'shot serves no premise element' }
  const known = knownIds(premise)
  const hay = (shot.visualPrompt ?? '').toLowerCase()
  for (const id of ids) {
    const element = known.get(id)
    if (!element) return { grounded: false, reason: 'shot cites an element outside the premise' }
    if (element === 'story') {
      if (!mentions(hay, premise.story)) {
        return { grounded: false, reason: 'shot does not depict the locked story' }
      }
      continue
    }
    const featured = mentions(hay, element.name) || (element.description ? mentions(hay, element.description) : false)
    if (!featured) return { grounded: false, reason: 'shot does not feature its premise element' }
  }
  return { grounded: true }
}

export function cutUngrounded<T extends { visualPrompt?: string; premiseElementIds?: string[] }>(
  shots: T[],
  premise: PremiseLock,
): T[] {
  return shots.filter((shot) => groundingCheck(shot, premise).grounded)
}

/** Treatment may change mood and camera. It may not drop a premise name the shot already used. */
export function enrichmentKeepsPremise(before: string, after: string, premise: PremiseLock): boolean {
  const source = before.toLowerCase()
  const hay = after.toLowerCase()
  for (const el of premiseElements(premise)) {
    const words = tokens(el.name)
    for (const word of words) {
      if (source.includes(word) && !hay.includes(word)) return false
    }
  }
  const storyWords = tokens(premise.story).filter((word) => source.includes(word))
  const kept = storyWords.filter((word) => hay.includes(word))
  if (storyWords.length >= 2 && kept.length === 0) return false
  return true
}

export function purposeForContent(contentType: string, continues = false): ShotPurpose {
  if (continues) return 'continuity'
  switch (contentType) {
    case 'dialogue_closeup':
    case 'audio_native':
      return 'dialogue'
    case 'camera_control':
      return 'camera'
    case 'physical_action':
    case 'physics_simulation':
      return 'motion'
    case 'fast_draft':
      return 'draft'
    case 'character_emotion':
    case 'cgi_character':
      return 'consistency'
    case 'aerial_establishing':
    case 'environment_travel':
    case 'product_commercial':
    case 'crowd_urban':
      return 'fill'
    case 'stylized':
    case 'anime':
    case 'transition':
    case 'effects':
      return 'stylized'
    default:
      return 'hero'
  }
}

const SPECIFIC_CAMERA = /dolly|crane|orbit|tracking|handheld|whip.?pan|steadicam|push in|pull out|truck /

export function deriveShotPurpose(shot: {
  purpose?: string
  contentType?: string
  chainFrom?: string | null
  hasDialogue?: boolean
  cameraPrecision?: boolean
  cameraMove?: string
  charactersPresent?: string[]
  sceneNumber?: number
  prevSceneNumber?: number
  prevCharacters?: string[]
}): ShotPurpose {
  if (shot.purpose && isShotPurpose(shot.purpose)) return shot.purpose
  if (shot.chainFrom) return 'continuity'
  const newScene =
    shot.sceneNumber != null &&
    shot.prevSceneNumber != null &&
    shot.sceneNumber !== shot.prevSceneNumber
  const recurring =
    newScene &&
    (shot.charactersPresent ?? []).some((name) => (shot.prevCharacters ?? []).includes(name))
  if (recurring) return 'consistency'
  if (shot.hasDialogue) return 'dialogue'
  if (shot.cameraPrecision || SPECIFIC_CAMERA.test((shot.cameraMove ?? '').toLowerCase())) return 'camera'
  return purposeForContent(shot.contentType ?? '', false)
}

export function isShotPurpose(value: string): value is ShotPurpose {
  return (SHOT_PURPOSES as readonly string[]).includes(value)
}

function namesFor(ids: string[], elements: PremiseElement[]): string[] {
  const known = new Map(elements.map((el) => [el.id, el.name]))
  return ids.map((id) => known.get(id)).filter((name): name is string => Boolean(name))
}

export function applyShotSpec<T extends PremiseShot>(
  shots: T[],
  premise: PremiseLock,
): Array<T & { purpose: ShotPurpose; chainFrom: string | null; continuity: 'continuous' | 'cut'; premiseElementIds: string[] }> {
  const known = knownIds(premise)
  return shots.map((shot, index) => {
    const prev = shots[index - 1]
    const premiseElementIds = (shot.premiseElementIds ?? []).map((id) => id.trim()).filter((id) => known.has(id))
    const locationsPresent = shot.locationsPresent?.length
      ? shot.locationsPresent
      : namesFor(premiseElementIds, premise.settings)
    const prevLocations = prev?.locationsPresent?.length
      ? prev.locationsPresent
      : prev
        ? namesFor(prev.premiseElementIds ?? [], premise.settings)
        : []
    const left = locationsPresent.map((name) => name.trim().toLowerCase()).filter(Boolean).sort().join('|')
    const right = prevLocations.map((name) => name.trim().toLowerCase()).filter(Boolean).sort().join('|')
    const sameScene = Boolean(prev) && (shot.sceneNumber ?? 0) === (prev?.sceneNumber ?? 0)
    const low = continuityPriorityFor(shot.contentType ?? '') === 'low'
    const continuity = shotContinuityFlag({
      hasPrev: Boolean(prev),
      sameScene,
      sameLocation: !left || !right || left === right,
      hardCut: shot.startsAtHardCut === true,
      lowPriority: low,
    })
    const chainFrom = continuity === 'continuous' && prev ? `shot-${prev.shotIndex}` : null
    const purpose = deriveShotPurpose({
      ...shot,
      chainFrom,
      prevSceneNumber: prev?.sceneNumber,
      prevCharacters: prev?.charactersPresent,
    })
    const charactersPresent = shot.charactersPresent?.length
      ? shot.charactersPresent
      : namesFor(premiseElementIds, premise.characters)
    return {
      ...shot,
      premiseElementIds,
      purpose,
      continuity,
      chainFrom,
      charactersPresent,
      locationsPresent,
    }
  })
}
