import type { ModelControlSurface } from '../types/provider'

/** Panels the direction card may open. A panel is included only when the live control surface has that capability. */
export type ToolPanel =
  | 'prompt'
  | 'camera_prompt'
  | 'camera_motion_brush'
  | 'camera_path'
  | 'camera_presets'
  | 'reference_images'
  | 'first_last_frame'
  | 'first_frame'
  | 'audio_native'
  | 'duration_resolution'

export const IDENTITY_REFERENCE_MODEL = 'seedance-2.0'

export function toolPanelsFor(control: ModelControlSurface, silentOnly: boolean): ToolPanel[] {
  const panels: ToolPanel[] = ['prompt', 'duration_resolution']
  if (control.cameraControl === 'prompt_only') panels.push('camera_prompt')
  if (control.motionBrush) panels.push('camera_motion_brush')
  if (control.cameraControl === 'full' || control.cameraControl === 'params') panels.push('camera_path')
  if (control.cameraControl === 'presets') panels.push('camera_presets')
  if (control.referenceClass === 'true_reference' || control.maxReferenceImages > 0) panels.push('reference_images')
  if (control.firstLastFrame) panels.push('first_last_frame')
  if (control.referenceClass !== 'none' || control.firstLastFrame) panels.push('first_frame')
  return panels
}

export interface ToolCharacterRef {
  id: string
  name: string
  referenceUrls: string[]
  voiceId?: string | null
}

export function linkedVoices(characters: ToolCharacterRef[]): Array<{ name: string; voiceId: string }> {
  return characters.flatMap((character) => {
    const voiceId = character.voiceId?.trim()
    return voiceId ? [{ name: character.name, voiceId }] : []
  })
}

export interface ToolLocationRef {
  label: string
  imageUrl: string
}

export interface PanelPreloads {
  panels: ToolPanel[]
  referenceSlots: Array<{ label: string; url: string }>
  firstFrameUrl?: string
  lastFrameUrl?: string
  /** Character refs are attached, and this model cannot keep identity across a new scene. */
  identityNeedsTrueReference: boolean
}

export function buildPanelPreloads(
  control: ModelControlSurface,
  silentOnly: boolean,
  input: {
    characters: ToolCharacterRef[]
    location?: ToolLocationRef | null
    anchorFrameUrl?: string | null
    endFrameUrl?: string | null
    /** Schema-confirmed reference. When false, reference slots stay empty. */
    referenceCapable?: boolean
  },
): PanelPreloads {
  const panels = toolPanelsFor(control, silentOnly)
  const referenceCapable = input.referenceCapable ?? control.referenceClass === 'true_reference'
  const slots: Array<{ label: string; url: string }> = []
  if (panels.includes('reference_images') && referenceCapable) {
    for (const character of input.characters) {
      for (const url of character.referenceUrls) {
        if (slots.length >= control.maxReferenceImages) break
        const trimmed = url.trim()
        if (trimmed) slots.push({ label: character.name, url: trimmed })
      }
      if (slots.length >= control.maxReferenceImages) break
    }
    const plate = input.location?.imageUrl.trim()
    if (plate && slots.length < control.maxReferenceImages) {
      slots.push({ label: input.location?.label || 'Location', url: plate })
    }
  }

  const hasIdentity = input.characters.some((character) => character.referenceUrls.some((url) => url.trim()))
  const identityNeedsTrueReference = hasIdentity && !referenceCapable
  let firstFrameUrl = input.anchorFrameUrl?.trim() || undefined
  if (!firstFrameUrl && control.referenceClass !== 'true_reference') {
    firstFrameUrl = input.location?.imageUrl.trim()
      || input.characters.flatMap((character) => character.referenceUrls).find((url) => url.trim())?.trim()
  }
  const lastFrameUrl = panels.includes('first_last_frame') && slots.length === 0
    ? input.endFrameUrl?.trim() || undefined
    : undefined

  return { panels, referenceSlots: slots, firstFrameUrl, lastFrameUrl, identityNeedsTrueReference }
}
