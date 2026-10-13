import { probeDurationSec } from '@/lib/media/ffmpegExec'

export async function measureAudioMs(localPath: string): Promise<number> {
  const sec = await probeDurationSec(localPath)
  return Math.round(sec * 1000)
}
