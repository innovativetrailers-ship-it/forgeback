import {
  alignmentWords,
  buildAudioPayload,
  clonedVoiceId,
  type AudioBuildRequest,
  type ElevenLabsKind,
} from '@cinema/core'
import { extractAudioUrl, runFal, uploadToFal } from '@/lib/fal/client'

const AUDIO_TIMEOUT_MS = 300_000

export async function submitFalAudio(
  kind: ElevenLabsKind,
  req: AudioBuildRequest,
  source: string,
): Promise<unknown> {
  const built = buildAudioPayload(kind, req)
  return runFal(built.endpoint, built.payload, undefined, AUDIO_TIMEOUT_MS, undefined, undefined, source)
}

export async function falAudioUrl(
  kind: ElevenLabsKind,
  req: AudioBuildRequest,
  source: string,
): Promise<string> {
  const data = await submitFalAudio(kind, req, source)
  const url = extractAudioUrl(data)
  if (!url) throw new Error(`ElevenLabs FAL ${kind} returned no audio URL`)
  return url
}

export async function falAudioBuffer(
  kind: ElevenLabsKind,
  req: AudioBuildRequest,
  source: string,
): Promise<Buffer> {
  const url = await falAudioUrl(kind, req, source)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ElevenLabs audio (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function falCloneVoice(audioUrls: string[], source: string, isolateNoise = true): Promise<string> {
  const data = await submitFalAudio('clone', {
    audioUrls,
    removeBackgroundNoise: isolateNoise,
  }, source)
  return clonedVoiceId(data)
}

export async function falAlignSpeech(
  audioUrl: string,
  text: string,
  source: string,
): Promise<Array<{ text: string; start: number; end: number }>> {
  const data = await submitFalAudio('align', { audioUrl, text }, source)
  return alignmentWords(data)
}

export async function uploadAudioBuffer(buffer: Buffer, mime = 'audio/mpeg'): Promise<string> {
  return uploadToFal(new Blob([new Uint8Array(buffer)], { type: mime }))
}
