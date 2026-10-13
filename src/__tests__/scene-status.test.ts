import { canonicalAssetState } from '@/lib/reconcile/wave2Reasons'
import { sceneStatusFromClips } from '@/lib/studio/sceneStatus'

describe('scene status rollup', () => {
  it('marks a scene generated only when every clip finished', () => {
    expect(sceneStatusFromClips(['COMPLETED', 'MANUAL'])).toBe('GENERATED')
    expect(sceneStatusFromClips(['COMPLETED', 'FAILED'])).toBe('PARTIAL')
    expect(sceneStatusFromClips(['FAILED'])).toBe('FAILED')
    expect(sceneStatusFromClips(['PENDING', 'COMPLETED'])).toBe('PARTIAL')
    expect(sceneStatusFromClips(['AWAITING_DIRECTION', 'COMPLETED', 'FAILED'])).toBe('PARTIAL')
    expect(sceneStatusFromClips(['AWAITING_DIRECTION', 'FAILED'])).toBe('FAILED')
    expect(sceneStatusFromClips(['AWAITING_DIRECTION'])).toBe('PENDING')
    expect(sceneStatusFromClips(['GENERATING'])).toBe('GENERATING')
    expect(sceneStatusFromClips([])).toBe('PENDING')
  })

  it('maps legacy asset states onto the canonical set', () => {
    expect(canonicalAssetState({ resolutionState: 'needs_action' })).toEqual({ resolutionState: 'unresolved', needsAction: true })
    expect(canonicalAssetState({ resolutionState: 'resolved', kind: 'location', generatedImage: 'https://example.com/a.png' }).resolutionState).toBe('imported')
    expect(canonicalAssetState({ resolutionState: 'resolved', kind: 'character', generatedImage: 'https://example.com/a.png' }).resolutionState).toBe('generated')
  })
})
