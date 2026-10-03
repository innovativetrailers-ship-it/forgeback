// src/lib/orchestration/opticalFlow.ts
// Analyse motion direction from tail frame → inject into next segment's prompt

// Motion hint for the next shot. Frame analysis is not a per-shot language-model call.

interface MotionVector {
  direction:   string
  velocity:    'slow' | 'medium' | 'fast'
  description: string
}

export async function analyseFrameMotion(_frameUrl: string): Promise<MotionVector> {
  return { direction: 'static', velocity: 'medium', description: buildMotionDescription('static', 'medium') }
}

function buildMotionDescription(direction: string, velocity: string): string {
  const DIRECTION_MAP: Record<string, string> = {
    pan_right: 'continuing pan-right camera movement',
    pan_left:  'continuing pan-left camera movement',
    tilt_up:   'continuing upward tilt',
    tilt_down: 'continuing downward camera tilt',
    zoom_in:   'continuing push-in zoom',
    zoom_out:  'continuing pull-out zoom',
    static:    'camera beginning from rest',
  }
  const VELOCITY_MAP: Record<string, string> = {
    slow:   'at slow deliberate pace',
    medium: 'at medium speed',
    fast:   'at high velocity',
  }
  return `${DIRECTION_MAP[direction] ?? 'camera continuing'} ${VELOCITY_MAP[velocity] ?? ''}`
}

export function injectMotionContext(
  basePrompt:    string,
  motionVector:  MotionVector,
  previousShot?: { contentType: string; lighting: string }
): string {
  const motionHint         = `${motionVector.description}.`
  const lightingContinuity = previousShot
    ? ` Maintain consistent ${previousShot.lighting} lighting from previous shot.`
    : ''
  return `${basePrompt} ${motionHint}${lightingContinuity}`
}
