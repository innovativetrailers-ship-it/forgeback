import { readFileSync } from 'node:fs'

describe('consent records', () => {
  const routes = [
    ['src/app/api/vault/character/[id]/voice/route.ts', 'vault.character.voice'],
    ['src/app/api/vault/character/[id]/ingest/route.ts', 'vault.character.ingest'],
    ['src/app/api/audio/overdub/route.ts', 'audio.overdub'],
    ['src/app/api/casting/recast/route.ts', 'casting.recast'],
    ['src/app/api/makeup/apply/route.ts', 'makeup.apply'],
    ['src/app/api/studio/shot/[id]/lipsync/route.ts', 'studio.shot.lipsync'],
    ['src/app/api/studio/voice/lipsync/route.ts', 'studio.voice.lipsync'],
  ]

  it('writes a consent row before voice, ingest, overdub, recast, makeup, and lipsync', () => {
    for (const [file, scope] of routes) {
      const text = readFileSync(file, 'utf8')
      expect(text).toContain('recordConsent')
      expect(text).toContain(scope)
      expect(text).toContain('notMinor')
    }
  })

  it('records a deletion request without removing rows', () => {
    const text = readFileSync('src/app/api/account/delete/route.ts', 'utf8')
    expect(text).toContain('deletionRequestedAt')
    expect(text).toContain('Nothing was removed')
    expect(text).not.toMatch(/\.delete\(/)
    expect(readFileSync('src/app/(legal)/privacy/page.tsx', 'utf8')).toContain('lawyers')
    expect(readFileSync('src/app/api/auth/register/route.ts', 'utf8')).toContain('dateOfBirth')
  })
})
