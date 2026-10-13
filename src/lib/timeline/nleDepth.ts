import type { Clip, ClipColourGrade, ClipEffect, TimelineRecipe, Transition } from '@/lib/timeline/schema'

function nextId(): string {
  return `nle-${Math.random().toString(36).slice(2, 10)}`
}

export interface LookPreset {
  id: string
  name: string
  favourite: boolean
  colourGrade?: ClipColourGrade
  effects?: ClipEffect[]
  transition?: Transition
  /** A model op is never applied for free. */
  modelOp?: boolean
}

export function editPlaybackUrl(clip: Clip, editWithProxies: boolean | undefined): string {
  if (editWithProxies && clip.proxyUrl?.trim()) return clip.proxyUrl.trim()
  return clip.sourceUrl
}

export function exportPlaybackUrl(clip: Clip): string {
  return clip.sourceUrl
}

export function attachProxy(recipe: TimelineRecipe, clipId: string, proxyUrl: string): TimelineRecipe {
  return mapClip(recipe, clipId, (clip) => ({ ...clip, proxyUrl }))
}

export function setEditWithProxies(recipe: TimelineRecipe, enabled: boolean): TimelineRecipe {
  return { ...recipe, editWithProxies: enabled }
}

export function addAdjustment(recipe: TimelineRecipe, start: number, end: number, look: Pick<Clip, 'colourGrade' | 'effects'>): TimelineRecipe {
  const track = recipe.tracks.find((row) => row.type === 'video') ?? recipe.tracks[0]
  if (!track) return recipe
  const clip: Clip = {
    id: nextId(),
    trackId: track.id,
    startTime: start,
    endTime: Math.max(end, start + 0.5),
    sourceUrl: '',
    prompt: 'Adjustment',
    adjustment: true,
    colourGrade: look.colourGrade,
    effects: look.effects,
  }
  return {
    ...recipe,
    tracks: recipe.tracks.map((row) => row.id === track.id ? { ...row, clips: [...row.clips, clip] } : row),
  }
}

export function removeTimelineClip(recipe: TimelineRecipe, clipId: string): TimelineRecipe {
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== clipId),
    })),
  }
}

export function adjustmentsCovering(recipe: TimelineRecipe, start: number, end: number): Clip[] {
  return recipe.tracks.flatMap((track) => track.clips).filter((clip) =>
    clip.adjustment && clip.startTime < end && clip.endTime > start,
  )
}

export function mergeLook(clip: Clip, layers: readonly Clip[]): Clip {
  if (!layers.length) return clip
  const effects = [...(clip.effects ?? [])]
  let colourGrade = clip.colourGrade
  for (const layer of layers) {
    if (layer.effects?.length) effects.push(...layer.effects)
    if (layer.colourGrade) colourGrade = { ...colourGrade, ...layer.colourGrade }
  }
  return { ...clip, effects, colourGrade }
}

export function nestSequence(parent: TimelineRecipe, child: TimelineRecipe, start: number, end: number): TimelineRecipe {
  if (containsRecipe(child, parent.id, new Set())) {
    throw new Error('That sequence is already inside this one.')
  }
  const snapshot: TimelineRecipe = { ...child, id: child.id === parent.id ? `nest-${nextId()}` : child.id }
  const track = parent.tracks.find((row) => row.type === 'video') ?? parent.tracks[0]
  if (!track) return parent
  const clip: Clip = {
    id: nextId(),
    trackId: track.id,
    startTime: start,
    endTime: Math.max(end, start + 0.5),
    sourceUrl: '',
    prompt: child.id,
    nestRecipe: snapshot,
  }
  return {
    ...parent,
    tracks: parent.tracks.map((row) => row.id === track.id ? { ...row, clips: [...row.clips, clip] } : row),
  }
}

function containsRecipe(recipe: TimelineRecipe, id: string, seen: Set<string>): boolean {
  if (recipe.id === id) return true
  if (seen.has(recipe.id)) return true
  seen.add(recipe.id)
  return recipe.tracks.some((track) => track.clips.some((clip) => clip.nestRecipe && containsRecipe(clip.nestRecipe, id, seen)))
}

/** Full-res clips for the one renderer. Proxies are ignored. Adjustment clips stay looks, not media. */
export function expandForExport(recipe: TimelineRecipe, seen: string[] = []): TimelineRecipe {
  if (seen.includes(recipe.id)) {
    return { ...recipe, tracks: recipe.tracks.map((track) => ({ ...track, clips: [] })) }
  }
  const nextSeen = [...seen, recipe.id]
  const layers = recipe.tracks.flatMap((track) => track.clips.filter((clip) => clip.adjustment))
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => {
        if (clip.adjustment) return []
        if (!clip.nestRecipe) return [clip.sourceUrl ? { ...clip, sourceUrl: exportPlaybackUrl(clip) } : clip]
        const inner = expandForExport(clip.nestRecipe, nextSeen)
        return inner.tracks.flatMap((row) => row.clips).flatMap((row) => {
          if (!row.sourceUrl || row.adjustment) return []
          const start = clip.startTime + row.startTime
          const end = Math.min(clip.endTime, clip.startTime + row.endTime)
          if (end - start < 0.05) return []
          return [{ ...row, id: `${clip.id}:${row.id}`, trackId: track.id, startTime: start, endTime: end, sourceUrl: exportPlaybackUrl(row) }]
        })
      }).map((clip) => mergeLook(clip, layers.filter((layer) => layer.startTime < clip.endTime && layer.endTime > clip.startTime))),
    })),
  }
}

export function previewAt(recipe: TimelineRecipe, time: number): { clip: Clip; src: string } | null {
  const expanded = expandForExport({ ...recipe, editWithProxies: false })
  const clip = expanded.tracks.flatMap((track) => track.clips)
    .filter((row) => row.sourceUrl && row.startTime <= time && row.endTime > time)
    .sort((a, b) => b.startTime - a.startTime)[0]
  if (!clip) return null
  const original = recipe.tracks.flatMap((track) => track.clips).find((row) => clip.id === row.id || clip.id.startsWith(`${row.id}:`))
  const src = editPlaybackUrl(original?.proxyUrl ? original : clip, recipe.editWithProxies)
  return { clip, src: original?.proxyUrl && recipe.editWithProxies ? original.proxyUrl : src }
}

export function saveLookPreset(name: string, clip: Clip, modelOp = false): LookPreset {
  return {
    id: nextId(),
    name: name.trim() || 'Look',
    favourite: false,
    colourGrade: clip.colourGrade,
    effects: clip.effects,
    transition: clip.transition,
    modelOp: modelOp || clip.transition?.type === 'generative-bridge',
  }
}

export function applyLookPreset(clip: Clip, preset: LookPreset): { clip: Clip; metered: boolean } {
  if (preset.modelOp) return { clip, metered: true }
  return {
    metered: false,
    clip: {
      ...clip,
      colourGrade: preset.colourGrade ?? clip.colourGrade,
      effects: preset.effects ?? clip.effects,
      transition: preset.transition ?? clip.transition,
    },
  }
}

export function favouritePreset(presets: LookPreset[], id: string): LookPreset[] {
  return presets.map((preset) => preset.id === id ? { ...preset, favourite: !preset.favourite } : preset)
}

export function exportPresetJson(preset: LookPreset): string {
  return JSON.stringify(preset)
}

export function importPresetJson(raw: string): LookPreset | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LookPreset>
    if (!parsed || typeof parsed.name !== 'string') return null
    return {
      id: typeof parsed.id === 'string' ? parsed.id : nextId(),
      name: parsed.name,
      favourite: Boolean(parsed.favourite),
      colourGrade: parsed.colourGrade,
      effects: parsed.effects,
      transition: parsed.transition,
      modelOp: Boolean(parsed.modelOp),
    }
  } catch (err) {
    console.warn('[look-preset]', err instanceof Error ? err.message : err)
    return null
  }
}

function mapClip(recipe: TimelineRecipe, clipId: string, fn: (clip: Clip) => Clip): TimelineRecipe {
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId ? fn(clip) : clip),
    })),
  }
}
