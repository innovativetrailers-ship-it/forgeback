import type { AnchorPolicy, StructuredShot } from './types'

export interface AnchorContext {
  isVeryFirstClipOfFilm: boolean
}

function opensOnItsKeyframe(shot: StructuredShot): boolean {
  return shot.startsAtHardCut === true || shot.continuity === 'cut' || shot.isCut === true
}

export function resolveAnchorPolicy(
  shot: StructuredShot,
  ctx: AnchorContext,
): AnchorPolicy {
  if (opensOnItsKeyframe(shot) || ctx.isVeryFirstClipOfFilm) {
    return shot.storyboardUrl ? 'keyframe' : 'none'
  }
  return 'previous-frame'
}

export function resolveStartFrame(
  shot: StructuredShot,
  previousTail: string | undefined,
  ctx: AnchorContext,
  injectedStart?: string,
): string | undefined {
  const policy = resolveAnchorPolicy(shot, ctx)
  if (policy === 'keyframe') return shot.storyboardUrl
  if (policy === 'previous-frame') return previousTail ?? injectedStart
  return undefined
}

export function shotUsesI2V(
  shot: StructuredShot,
  previousTail: string | undefined,
  ctx: AnchorContext,
): boolean {
  return Boolean(resolveStartFrame(shot, previousTail, ctx))
}

export function shotExpectedUsesI2V(shot: StructuredShot, ctx: AnchorContext): boolean {
  const policy = resolveAnchorPolicy(shot, ctx)
  if (policy === 'none') return false
  if (policy === 'keyframe') return Boolean(shot.storyboardUrl)
  return true
}
