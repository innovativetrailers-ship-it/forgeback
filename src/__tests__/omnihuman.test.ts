import { omniCredits, omniMaxSeconds, splitPerformance } from '@/lib/orchestration/omniHuman'

describe('omnihuman performance shots', () => {
  it('bills the verified per-second price and splits audio that exceeds the limit', () => {
    expect(omniCredits(10)).toBe(32)
    expect(omniMaxSeconds('1080p')).toBe(30)
    expect(omniMaxSeconds('720p')).toBe(60)
    expect(splitPerformance(75, '1080p')).toEqual([30, 30, 15])
    expect(splitPerformance(20, '1080p')).toEqual([20])
  })
})
