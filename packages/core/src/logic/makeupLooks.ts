export const LOOK_CATEGORIES = ['age', 'creature', 'injury', 'prosthetic', 'beauty', 'fx'] as const
export type LookCategory = (typeof LOOK_CATEGORIES)[number]

export const LOOK_CATEGORY_LABEL: Record<LookCategory, string> = {
  age: 'Age & Time',
  creature: 'Creature & Fantasy',
  injury: 'Injury & Gore',
  prosthetic: 'Prosthetics & Augmentation',
  beauty: 'Beauty & Fashion',
  fx: 'Special FX',
}

export type LookRegion = 'face' | 'skin' | 'eyes' | 'hair' | 'hands' | 'body'
export type LookContinuity = 'persistent' | 'progressive' | 'one-shot'
export type LookSafety = 'normal' | 'graphic' | 'real-person-restricted'
export type LookMethod = 'bake' | 'video' | 'procedural'
export type LookStatus = 'live' | 'needs-model'

export interface MakeupLook {
  id: string
  category: LookCategory
  name: string
  intensity: number
  regions: LookRegion[]
  colour: string
  ageDelta: number
  severity: number
  coverage: number
  prompt: string
  negative: string
  continuity: LookContinuity
  safety: LookSafety
  methods: { bake: LookStatus; video: LookStatus; procedural: LookStatus }
}

export interface LookLayer {
  lookId: string
  intensity: number
  opacity: number
  hidden?: boolean
}

function look(partial: MakeupLook): MakeupLook {
  return partial
}

/** Bake is live through the registry image-edit path. Video tracking is not wired, so it stays needs-model. */
const BAKE = { bake: 'live' as const, video: 'needs-model' as const, procedural: 'needs-model' as const }
const FX = { bake: 'live' as const, video: 'needs-model' as const, procedural: 'live' as const }

export const MAKEUP_LOOKS: MakeupLook[] = [
  look({ id: 'age-older', category: 'age', name: 'Older', intensity: 0.6, regions: ['face', 'skin'], colour: '#c4a484', ageDelta: 30, severity: 0.4, coverage: 0.8, prompt: 'the same person visibly older, natural wrinkles', negative: 'different person, plastic skin', continuity: 'persistent', safety: 'real-person-restricted', methods: BAKE }),
  look({ id: 'age-younger', category: 'age', name: 'Younger', intensity: 0.5, regions: ['face'], colour: '#e7c2a4', ageDelta: -20, severity: 0.2, coverage: 0.7, prompt: 'the same person younger, smoother skin, identity kept', negative: 'different face, child if the source is an adult', continuity: 'persistent', safety: 'real-person-restricted', methods: BAKE }),
  look({ id: 'age-decay', category: 'age', name: 'Decay', intensity: 0.7, regions: ['skin', 'body'], colour: '#6b705c', ageDelta: 0, severity: 0.8, coverage: 0.9, prompt: 'weathered decaying skin on the same person', negative: 'cartoon, different identity', continuity: 'progressive', safety: 'graphic', methods: BAKE }),
  look({ id: 'creature-orc', category: 'creature', name: 'Orc', intensity: 0.8, regions: ['face', 'skin'], colour: '#4a7c59', ageDelta: 0, severity: 0.7, coverage: 1, prompt: 'orc features, tusks, green skin, same identity under the makeup', negative: 'a different creature with no likeness', continuity: 'persistent', safety: 'normal', methods: BAKE }),
  look({ id: 'creature-elf', category: 'creature', name: 'Elf', intensity: 0.6, regions: ['face', 'hair'], colour: '#d7c4a3', ageDelta: 0, severity: 0.4, coverage: 0.6, prompt: 'elf ears and refined features, identity kept', negative: 'generic fantasy face', continuity: 'persistent', safety: 'normal', methods: BAKE }),
  look({ id: 'creature-vampire', category: 'creature', name: 'Vampire', intensity: 0.7, regions: ['face', 'eyes'], colour: '#d9d3cf', ageDelta: 0, severity: 0.5, coverage: 0.8, prompt: 'pale vampire makeup, identity kept', negative: 'full monster replacement', continuity: 'persistent', safety: 'normal', methods: BAKE }),
  look({ id: 'injury-bruise', category: 'injury', name: 'Bruise', intensity: 0.5, regions: ['face', 'skin'], colour: '#5c4a7a', ageDelta: 0, severity: 0.4, coverage: 0.3, prompt: 'a bruise on the skin, same person', negative: 'gore beyond a bruise', continuity: 'progressive', safety: 'graphic', methods: BAKE }),
  look({ id: 'injury-cut', category: 'injury', name: 'Cut', intensity: 0.6, regions: ['face', 'skin'], colour: '#7a2430', ageDelta: 0, severity: 0.6, coverage: 0.2, prompt: 'a cut with stage blood, same person', negative: 'real medical imagery', continuity: 'progressive', safety: 'graphic', methods: BAKE }),
  look({ id: 'injury-burn', category: 'injury', name: 'Burn', intensity: 0.7, regions: ['skin', 'body'], colour: '#8c4a32', ageDelta: 0, severity: 0.8, coverage: 0.4, prompt: 'prosthetic burn makeup, same person', negative: 'documentary injury', continuity: 'progressive', safety: 'graphic', methods: BAKE }),
  look({ id: 'prosth-nose', category: 'prosthetic', name: 'Nose', intensity: 0.5, regions: ['face'], colour: '#e0b090', ageDelta: 0, severity: 0.3, coverage: 0.2, prompt: 'prosthetic nose, identity kept', negative: 'a different face', continuity: 'persistent', safety: 'normal', methods: BAKE }),
  look({ id: 'prosth-cyber', category: 'prosthetic', name: 'Cyber eye', intensity: 0.8, regions: ['eyes'], colour: '#3ec6ff', ageDelta: 0, severity: 0.6, coverage: 0.15, prompt: 'mechanical eye implant, rest of the face unchanged', negative: 'full robot replacement', continuity: 'persistent', safety: 'normal', methods: BAKE }),
  look({ id: 'beauty-glam', category: 'beauty', name: 'Glam', intensity: 0.7, regions: ['face', 'eyes', 'hair'], colour: '#c45c7a', ageDelta: 0, severity: 0.2, coverage: 0.5, prompt: 'editorial glam makeup, identity kept', negative: 'a different model', continuity: 'one-shot', safety: 'normal', methods: BAKE }),
  look({ id: 'beauty-tattoo', category: 'beauty', name: 'Tattoo', intensity: 0.6, regions: ['skin', 'body'], colour: '#1a1a1a', ageDelta: 0, severity: 0.3, coverage: 0.25, prompt: 'a tattoo on the skin, same person', negative: 'covering the face entirely', continuity: 'persistent', safety: 'normal', methods: BAKE }),
  look({ id: 'fx-glow', category: 'fx', name: 'Glow', intensity: 0.8, regions: ['eyes', 'skin'], colour: '#7af0ff', ageDelta: 0, severity: 0.5, coverage: 0.4, prompt: 'emissive glow on the skin, identity kept', negative: 'replacing the person with light', continuity: 'one-shot', safety: 'normal', methods: FX }),
  look({ id: 'fx-ember', category: 'fx', name: 'Ember', intensity: 0.7, regions: ['body', 'hair'], colour: '#ff6a2a', ageDelta: 0, severity: 0.6, coverage: 0.5, prompt: 'embers and heat haze around the same person', negative: 'the person replaced by fire', continuity: 'one-shot', safety: 'normal', methods: FX }),
]

export function looksIn(category: LookCategory): MakeupLook[] {
  return MAKEUP_LOOKS.filter((row) => row.category === category)
}

export function makeupLook(id: string): MakeupLook | undefined {
  return MAKEUP_LOOKS.find((row) => row.id === id)
}

export function lookConflict(activeIds: string[], shotIds: string[]): string | null {
  const missing = activeIds.filter((id) => {
    const row = makeupLook(id)
    return row?.continuity === 'persistent' && !shotIds.includes(id)
  })
  if (!missing.length) return null
  return `Persistent look missing on this shot: ${missing.join(', ')}. The shot was not changed.`
}
