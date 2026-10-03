import { sceneStatusFromClips } from '@/lib/studio/sceneStatus'

describe('scene status rollup', () => {
  it('marks a scene generated only when every clip finished', () => {
    expect(sceneStatusFromClips(['COMPLETED', 'MANUAL'])).toBe('GENERATED')
    expect(sceneStatusFromClips(['COMPLETED', 'FAILED'])).toBe('PARTIAL')
    expect(sceneStatusFromClips(['FAILED'])).toBe('FAILED')
    expect(sceneStatusFromClips(['PENDING', 'COMPLETED'])).toBe('PENDING')
    expect(sceneStatusFromClips(['GENERATING'])).toBe('GENERATING')
    expect(sceneStatusFromClips([])).toBe('PENDING')
  })
})
