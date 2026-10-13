import { sniffMedia, opaqueObjectKey } from '../lib/upload/sniff'

describe('upload sniffing', () => {
  it('accepts a png and refuses svg or html', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffMedia(png)?.ext).toBe('png')
    expect(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffMedia(Buffer.from('<!DOCTYPE html><html></html>'))).toBeNull()
  })

  it('does not put a user id in a new object key', () => {
    expect(opaqueObjectKey('png')).toMatch(/^media\/[a-f0-9]{32}\.png$/)
    expect(opaqueObjectKey('png')).not.toMatch(/user/i)
  })
})
