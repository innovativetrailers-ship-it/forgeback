import { primaryCastTrainer, trainerDef, type DatasetMedia, type TrainerDef } from './trainerRegistry'
import { domainFromSubcategory, importPrep } from './importRights'

export const STUDIO_TABS = ['cast', 'styles', 'assets', 'voices', 'music'] as const
export type StudioTab = (typeof STUDIO_TABS)[number]

export interface StudioSubcategory {
  id: string
  label: string
}

export const STUDIO_SUBCATEGORIES: Record<StudioTab, StudioSubcategory[]> = {
  cast: [
    { id: 'lead', label: 'Lead' },
    { id: 'supporting', label: 'Supporting' },
    { id: 'creature', label: 'Creature' },
    { id: 'ensemble', label: 'Ensemble' },
  ],
  assets: [
    { id: 'vehicle', label: 'Vehicle' },
    { id: 'prop', label: 'Prop / weapon' },
    { id: 'product', label: 'Product' },
    { id: 'set-piece', label: 'Set piece' },
  ],
  styles: [
    { id: 'movie', label: 'Movie' },
    { id: 'tv', label: 'TV' },
    { id: 'anime', label: 'Anime' },
    { id: 'documentary', label: 'Documentary' },
    { id: 'sport', label: 'Sport' },
    { id: 'racing', label: 'Racing' },
  ],
  voices: [
    { id: 'dialogue', label: 'Dialogue' },
    { id: 'narration', label: 'Narrator' },
    { id: 'announcer', label: 'Announcer' },
  ],
  music: [
    { id: 'score', label: 'Score style' },
    { id: 'sfx', label: 'SFX palette' },
  ],
}

export function isStudioTab(value: string): value is StudioTab {
  return (STUDIO_TABS as readonly string[]).includes(value)
}

export function assetTypeForTab(tab: StudioTab): 'character' | 'style' | 'audio_style' {
  if (tab === 'styles') return 'style'
  if (tab === 'music') return 'audio_style'
  return 'character'
}

export function defaultSubcategory(tab: StudioTab): string {
  return STUDIO_SUBCATEGORIES[tab][0]?.id ?? ''
}

/**
 * Orchestrator handoff: the sidebar collects tab + subcategory + media.
 * This picks the verified trainer. The UI does not choose a raw FAL id.
 */
export function recommendTrainer(input: {
  tab: StudioTab
  subcategory?: string
  kinds?: DatasetMedia[]
}): { trainerKey: string; trainer: TrainerDef } {
  const kinds = new Set(input.kinds ?? [])
  if (input.tab === 'music') {
    const trainer = trainerDef('stable-audio-3')
    if (!trainer) throw new Error('stable-audio-3 trainer missing')
    return { trainerKey: 'stable-audio-3', trainer }
  }
  if (input.tab === 'styles') {
    const domain = domainFromSubcategory(input.subcategory)
    if (domain) {
      const prep = importPrep({ domain, kinds: input.kinds, tab: 'styles' })
      return { trainerKey: prep.trainerKey, trainer: prep.trainer }
    }
    if (kinds.has('video') || !kinds.size) {
      const trainer = trainerDef('wan-22')
      if (!trainer) throw new Error('wan-22 trainer missing')
      return { trainerKey: 'wan-22', trainer }
    }
    const trainer = trainerDef('flux-2')
    if (!trainer) throw new Error('flux-2 trainer missing')
    return { trainerKey: 'flux-2', trainer }
  }
  if (input.tab === 'voices') {
    throw new Error('Voices clone or design — they are not LoRA trainers')
  }
  const trainer = primaryCastTrainer()
  return { trainerKey: 'wan-22', trainer }
}
