import { clipReason } from '@/lib/reconcile/wave2Reasons'

describe('clip backlog reasons', () => {
  it('keeps a recoverable clip and does not pretend it rendered while generation is paused', () => {
    const paused = clipReason({ keyframeUrl: 'https://example.com/frame.jpg', prompt: 'a street', videoUrl: null }, true)
    expect(paused.retry).toBe(true)
    expect(paused.failed).toMatch(/paused/)
    expect(paused.failed).toMatch(/kept/)
  })

  it('fails a clip that has nothing to resubmit', () => {
    const empty = clipReason({ keyframeUrl: null, prompt: '   ', videoUrl: null }, true)
    expect(empty.retry).toBe(false)
    expect(empty.failed).toMatch(/kept/)
  })
})
