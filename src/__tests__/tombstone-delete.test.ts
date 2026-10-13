import { readFileSync } from 'node:fs'

describe('deleting user work', () => {
  const files = [
    'src/app/api/library/delete/route.ts',
    'src/lib/vault/character.ts',
    'src/app/api/audio/track/[id]/route.ts',
    'src/app/api/playbooks/[id]/route.ts',
    'src/lib/media/BinManager.ts',
  ]

  it('retires the row and leaves the stored object', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toMatch(/\.delete\(/)
      expect(text).not.toMatch(/deleteMany\(/)
      expect(text).not.toMatch(/deleteFromR2/)
    }
    expect(readFileSync('src/app/api/library/delete/route.ts', 'utf8')).toMatch(/The file was kept/)
    expect(readFileSync('src/lib/vault/character.ts', 'utf8')).toMatch(/retiredAt/)
    expect(readFileSync('prisma/schema.prisma', 'utf8')).toMatch(/onDelete: Restrict/)
  })
})
