import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export async function downloadToTmp(url: string, ext = 'bin'): Promise<string> {
  const work = mkdtempSync(join(tmpdir(), 'forge-dl-'))
  const path = join(work, `${randomBytes(8).toString('hex')}.${ext}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(path, buf)
  return path
}
