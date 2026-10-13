import { spawnSync } from 'node:child_process'

const BINS = new Set(['ffmpeg', 'ffprobe'])

function assertArgs(bin: string, args: string[]): void {
  if (!BINS.has(bin)) throw new Error(`Unsupported binary ${bin}`)
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) throw new Error('Unsafe argument')
  }
}

function spawnMedia(bin: string, args: string[]) {
  assertArgs(bin, args)
  return spawnSync(bin, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'buffer', shell: false })
}

/** Run a media binary with an argument list. The shell is never involved. */
export function runArgv(bin: string, args: string[]): Buffer {
  const result = spawnMedia(bin, args)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${bin} exited ${result.status}: ${result.stderr.toString().slice(0, 400)}`)
  }
  return result.stdout
}

/** Like runArgv, but keeps stderr when the process exits non-zero. */
export function runArgvText(bin: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnMedia(bin, args)
  if (result.error) throw result.error
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    status: result.status,
  }
}
