import { cleanContext, cleanText, parseKind, parseStatus } from '@/lib/features/request'

describe('feature requests', () => {
  it('strips markup and keeps only the context fields', () => {
    expect(cleanText('<script>alert(1)</script> A tool', 20)).toBe('alert(1) A tool')
    expect(parseKind('tool')).toBe('tool')
    expect(parseKind('exploit')).toBeNull()
    expect(parseStatus('planned')).toBe('planned')
    const context = cleanContext({ route: '/ultimate', screen: '<b>Director</b>', platform: 'desktop', email: 'a@b.c', version: 'web' })
    expect(context).toEqual({ route: '/ultimate', screen: 'Director', platform: 'desktop', version: 'web' })
    expect(JSON.stringify(context)).not.toContain('a@b.c')
  })
})
