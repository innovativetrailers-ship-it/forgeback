import { readFileSync } from 'node:fs'

describe('parent delete', () => {
  it('refuses a cascade from a scene onto its clips', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')
    const clip = schema.slice(schema.indexOf('model StudioClip'), schema.indexOf('model VaultCharacter'))
    expect(clip).toMatch(/scene\s+StudioScene[\s\S]*onDelete: Restrict/)
    const sql = readFileSync('prisma/migrations/20261013073000_retire_user_work/migration.sql', 'utf8')
    expect(sql).toMatch(/ON DELETE RESTRICT/)
    expect(sql).not.toMatch(/DROP TABLE/)
    expect(sql).not.toMatch(/DROP COLUMN/)
  })
})
