import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function exec(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(bin, args, { maxBuffer: 10 * 1024 * 1024 })
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

export async function probeDurationSec(localPath: string): Promise<number> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    localPath,
  ])
  const n = parseFloat(stdout.trim())
  return Number.isFinite(n) ? n : 0
}

export async function probeHasAudioStream(localPath: string): Promise<boolean> {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      localPath,
    ])
    return stdout.trim().includes('audio')
  } catch (err) {
    console.warn("[caught] src/lib/media/ffmpegExec.ts:32", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}
