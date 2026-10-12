import { readFileSync } from 'node:fs'

describe('user data is kept', () => {
  it('retags a re-plan instead of deleting clips', () => {
    const text = readFileSync('src/lib/studio/sceneSync.ts', 'utf8')
    expect(text).not.toMatch(/studioClip\.deleteMany/)
    expect(text).not.toMatch(/studioScene\.delete\(/)
    expect(text).toMatch(/orphaned from plan/)
  })

  it('tombstones a removed shot without deleting the row', () => {
    const text = readFileSync('src/app/api/studio/shot/[id]/remove/route.ts', 'utf8')
    expect(text).not.toMatch(/studioClip\.delete/)
    expect(text).not.toMatch(/deleteFromR2/)
    expect(text).toMatch(/tombstone: true/)
  })

  it('indexes the stuck-shot and hold lookups', () => {
    const text = readFileSync('prisma/migrations/20261013054600_orphan_and_hot_indexes/migration.sql', 'utf8')
    expect(text).toMatch(/StudioClip_status_generatingAt_idx/)
    expect(text).toMatch(/CreditHold_status_idx/)
    expect(text).toMatch(/RenderJob_falRequestId_idx/)
  })
})
