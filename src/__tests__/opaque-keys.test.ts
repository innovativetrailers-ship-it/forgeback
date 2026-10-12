import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { objectKeyFromStored, renderVideoKey } from '../lib/storage/keys'
import { opaqueObjectKey } from '../lib/upload/sniff'

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (name.endsWith('.ts')) acc.push(full)
  }
  return acc
}

describe('opaque object keys', () => {
  it('keeps an old render key resolvable', () => {
    expect(objectKeyFromStored('renders/user-1/job-9.mp4')).toBe('renders/user-1/job-9.mp4')
    expect(renderVideoKey('user-1', 'job-9')).toBe('renders/user-1/job-9.mp4')
    expect(objectKeyFromStored('https://cdn.example/media/abc.mp4')).toBe('media/abc.mp4')
  })

  it('does not put a user id in a new key', () => {
    const key = opaqueObjectKey('mp4')
    expect(key.startsWith('media/')).toBe(true)
    expect(key).not.toContain('user-1')
    expect(key.split('/').length).toBe(2)
  })

  it('does not build a new object key from a user id', () => {
    const allowed = new Set(['src/lib/storage/r2.ts', 'src/lib/storage/keys.ts'])
    const hits: string[] = []
    for (const file of walk('src')) {
      const rel = file
      if (allowed.has(rel)) continue
      const text = readFileSync(file, 'utf8')
      if (/\$\{userId\}\/|\$\{uid\}\/|\$\{item\.userId\}\//.test(text)) hits.push(rel)
    }
    expect(hits).toEqual([])
  })
})
