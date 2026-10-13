/** Display names for keymap presets. Internal ids stay stable so saved maps still load. */

export const KEYMAP_PRESET_IDS = ['premiere', 'resolve', 'fcp', 'forge'] as const
export type KeymapPresetId = (typeof KEYMAP_PRESET_IDS)[number]

export const KEYMAP_PRESET_LABELS: Record<KeymapPresetId, string> = {
  premiere: 'Studio Track Editor',
  resolve: 'Colour & Finishing',
  fcp: 'Magnetic Timeline',
  forge: 'Forge',
}

export const KEYMAP_PRESET_BLURBS: Record<KeymapPresetId, string> = {
  premiere: 'Track-based layout and shortcuts for traditional timeline editors.',
  resolve: 'Page-style workflow and shortcuts for grading and finishing.',
  fcp: 'Magnetic-timeline workflow and shortcuts.',
  forge: "Forge's own keymap.",
}

const LEGACY_PRESET_IDS: Record<string, KeymapPresetId> = {
  Premiere: 'premiere',
  Resolve: 'resolve',
  'Final Cut': 'fcp',
  Forge: 'forge',
  premiere: 'premiere',
  resolve: 'resolve',
  fcp: 'fcp',
  forge: 'forge',
  davinci: 'resolve',
  finalcut: 'fcp',
  avid: 'premiere',
}

export function migrateKeymapPreset(saved: string | null | undefined): KeymapPresetId {
  if (saved && LEGACY_PRESET_IDS[saved]) return LEGACY_PRESET_IDS[saved]
  return 'forge'
}
