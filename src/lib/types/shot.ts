export type ShotStatus =
  | 'pending'
  | 'awaiting_direction'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'manual'

export type AnchorSourceUI = 'auto' | 'manual' | 'keyframe' | 'none'

export const SHOT_TRANSITIONS: Record<ShotStatus, ShotStatus[]> = {
  pending: ['awaiting_direction', 'manual'],
  awaiting_direction: ['generating', 'manual', 'pending'],
  generating: ['completed', 'failed'],
  completed: ['awaiting_direction', 'manual'],
  failed: ['awaiting_direction', 'manual'],
  manual: ['awaiting_direction'],
}

export function canTransition(from: ShotStatus, to: ShotStatus): boolean {
  return SHOT_TRANSITIONS[from]?.includes(to) ?? false
}

export interface DirectShotArgs {
  shotId: string
  prompt: string
  anchorSource?: AnchorSourceUI
  anchorFrameUrl?: string
  modelOverride?: string | null
  directionNotes?: string
}
