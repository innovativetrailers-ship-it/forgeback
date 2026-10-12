import { execFileSync } from 'node:child_process'

const BINS = new Set(['ffmpeg', 'ffprobe'])

/** Run a media binary with an argument list. The shell is never involved. */
export function runArgv(bin: string, args: string[]): Buffer {
  if (!BINS.has(bin)) throw new Error(`Unsupported binary ${bin}`)
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) throw new Error('Unsafe argument')
  }
  return execFileSync(bin, args, { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}
