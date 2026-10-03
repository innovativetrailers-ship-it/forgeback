import { capPromptText, composeShotPrompt, genrePreset, genreStyleFragment, mergeCameraDefaults, resolveModel, type PromptCamera, type PromptCharacter } from '@cinema/core'
import { db } from '@/lib/db'
import { falLog } from '@/lib/fal/falQueue'
import { getConstraints, promptCharLimit } from '@/lib/fal/schemaSync'
import { getWorkingState } from '@/lib/cognition/memory/working'
import type { ContinuityState } from '@/lib/cognition/agents/continuityAgent'

export interface ShotIdentityInput {
  prompt: string
  endpoint: string
  registryKey?: string
  characterIds?: string[]
  locationId?: string | null
  projectId?: string
  anchorFrameUrl?: string
  camera?: PromptCamera | null
  genrePresetId?: string | null
}

export interface NamedReference {
  name: string
  url: string
  kind: 'character' | 'location'
}

export interface ShotIdentity {
  prompt: string
  seed?: number
  referenceImages: string[]
  /** One primary image per character, then the location plate. Seedance composition uses this. */
  namedRefs: NamedReference[]
  imageUrl?: string
  supportsSeed: boolean
  supportsCharRef: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function descriptorFromAppearance(appearance: unknown, behavioralPrompt: string | null): string | undefined {
  if (behavioralPrompt?.trim()) return behavioralPrompt.trim()
  const row = asRecord(appearance)
  if (!row) return undefined
  const parts = [row.ageRange, row.hairColor, row.eyeColor, row.skinTone]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
  const features = Array.isArray(row.features) ? row.features.filter((part): part is string => typeof part === 'string') : []
  const text = [...parts, ...features].join(', ')
  return text || undefined
}

function locationDescriptor(plate: {
  type: string
  city: string | null
  country: string | null
}): string | undefined {
  const parts = [plate.type === 'street' ? 'street-level' : plate.type, plate.city, plate.country]
    .filter((part): part is string => Boolean(part && part.trim()))
  return parts.length ? parts.join(', ') : undefined
}

/**
 * Load the shot's characters and mirrored location plate, then build the
 * conditioning the payload builder applies. Location imageUrl is the R2 copy;
 * sourceUrl (raw Mapillary/satellite) is never sent to a model.
 */
export async function conditionShotIdentity(input: ShotIdentityInput): Promise<ShotIdentity> {
  let supportsSeed = false
  let supportsCharRef = false
  let attachCharacterRefs = false
  if (input.registryKey) {
    try {
      const def = resolveModel(input.registryKey)
      supportsSeed = def.supportsSeed
      supportsCharRef = def.supportsCharRef
      attachCharacterRefs = supportsCharRef || def.control.maxReferenceImages > 0
    } catch (err) {
      console.warn("[caught] src/lib/fal/shotIdentity.ts:77", err instanceof Error ? { name: err.name, message: err.message } : err)

      supportsSeed = false
      supportsCharRef = false
    }
  }

  const ids = input.characterIds?.filter(Boolean) ?? []
  const rows = ids.length
    ? await db.vaultCharacter.findMany({
        where: { id: { in: ids } },
        include: { wardrobe: { orderBy: { appliedAt: 'desc' }, take: 1 } },
      })
    : []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered = ids.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row))

  const continuity = input.projectId
    ? await getWorkingState<ContinuityState>(`project:${input.projectId}`).catch((err) => {
      console.warn("[caught] src/lib/fal/shotIdentity.ts:96", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    : null
  const characters: PromptCharacter[] = ordered.map((row) => {
    const remembered = continuity?.characters?.[row.name]?.wardrobe?.filter(Boolean).join(', ')
    return {
      name: row.name,
      descriptor: descriptorFromAppearance(row.styleJson ?? row.appearance, row.behavioralPrompt),
      wardrobe: row.wardrobe[0]?.prompt || remembered || undefined,
    }
  })

  const plate = input.locationId
    ? await db.locationPlate.findUnique({ where: { id: input.locationId } })
    : null
  const plateUrl = plate?.imageUrl?.trim() || undefined

  const place = plate
    ? {
        label: plate.displayName?.trim() || plate.city?.trim() || 'this location',
        descriptor: locationDescriptor(plate),
      }
    : null
  const stored = await getConstraints(input.endpoint).catch((err) => {
    console.warn("[caught] src/lib/fal/shotIdentity.ts:118", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  const maxChars = promptCharLimit(stored, input.endpoint)
  let genrePresetId = input.genrePresetId
  let playbookFragment = ''
  if (input.projectId) {
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: { userId: true, genrePresetId: true },
    })
    if (project) {
      const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(project.userId, input.projectId).catch((err) => {
        console.warn("[caught] src/lib/fal/shotIdentity.ts:128", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (null)
      })
      genrePresetId = genrePresetId?.trim() || playbook?.style?.genrePreset || project.genrePresetId
      playbookFragment = [
        playbook?.style?.grade ? `${playbook.style.grade} grade` : '',
        playbook?.style?.aspectRatio ? `framed ${playbook.style.aspectRatio}` : '',
        ...(playbook?.rules ?? []).filter((rule) => !/under \d|no on-screen|no dialogue in establishing|chains under/i.test(rule)),
      ].filter(Boolean).join('. ')
    }
  }
  const camera = mergeCameraDefaults(input.camera, genrePreset(genrePresetId)?.cameraDefaults)
  const style = [genreStyleFragment(genrePresetId), playbookFragment].filter(Boolean).join(' ')
  const assembled = composeShotPrompt(input.prompt, characters, place, camera, undefined, style)
  let prompt = maxChars
    ? composeShotPrompt(input.prompt, characters, place, camera, maxChars, style)
    : assembled
  const props = (continuity?.props ?? []).filter((prop) => prop.trim() && !prompt.toLowerCase().includes(prop.trim().toLowerCase()))
  const propsLine = props.length ? `Props in frame: ${props.join(', ')}.` : ''
  const full = propsLine ? `${assembled} ${propsLine}`.trim() : assembled
  if (propsLine) {
    const withProps = `${prompt} ${propsLine}`.trim()
    if (!maxChars || withProps.length <= maxChars) prompt = withProps
    else if (!prompt) prompt = capPromptText(propsLine, maxChars)
  }
  if (prompt.length < full.length) {
    falLog('info', 'prompt_truncated', {
      endpoint: input.endpoint,
      original: full.length,
      final: prompt.length,
    })
  }

  const referenceImages: string[] = []
  const namedRefs: NamedReference[] = []
  if (attachCharacterRefs) {
    for (const row of ordered) {
      let primary = ''
      for (const url of row.referenceUrls) {
        if (!url?.trim()) continue
        referenceImages.push(url)
        if (!primary) primary = url.trim()
      }
      if (primary) namedRefs.push({ name: row.name, url: primary, kind: 'character' })
    }
    if (supportsCharRef && plateUrl) {
      referenceImages.push(plateUrl)
      namedRefs.push({ name: place?.label ?? 'this location', url: plateUrl, kind: 'location' })
    }
  }

  const anchor = input.anchorFrameUrl?.trim() || undefined
  let imageUrl = anchor
  if (!supportsCharRef && !imageUrl && plateUrl) imageUrl = plateUrl

  const primary = ordered[0]
  const seed = supportsSeed && primary?.seed != null ? primary.seed : undefined

  return { prompt, seed, referenceImages, namedRefs, imageUrl, supportsSeed, supportsCharRef }
}
