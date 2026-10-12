import { enforcePermission, type UpgradeKey } from '../lib/access/enforce'

describe('tier permissions are enforced', () => {
  it('refuses collaboration, voice clone, and pro export on the free tier', () => {
    const keys: UpgradeKey[] = ['collaborate', 'voice_clone', 'export_4k', 'export_prores']
    for (const key of keys) {
      expect(enforcePermission('free', key).allowed).toBe(false)
    }
    expect(enforcePermission('ultimate', 'collaborate').allowed).toBe(true)
    expect(enforcePermission('ultimate', 'export_4k').allowed).toBe(true)
  })
})
