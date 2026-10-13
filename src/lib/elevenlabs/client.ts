// ElevenLabs gateway. Generation, clone, SFX, alignment, and S2S go through FAL (MP-15).
// Voice library listing still uses the ElevenLabs SDK — no FAL list endpoint returned 200.

import { requireCallerSource } from '@cinema/core'
import { ElevenLabsClient, ElevenLabsError } from '@elevenlabs/elevenlabs-js'
import { assertGenerationNotPaused } from '@/lib/generation/pause'
import {
  falAlignSpeech,
  falAudioBuffer,
  falCloneVoice,
  uploadAudioBuffer,
} from '@/lib/providers/falAudio'
import type { ElevenLabsKind } from '@cinema/core'

function guardPaidAudio(source: string | undefined, label: string): void {
  requireCallerSource(source)
  assertGenerationNotPaused(label)
}

export class ElevenLabsServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElevenLabsServiceError'
  }
}

export async function pingElevenLabs(apiKey?: string): Promise<void> {
  const client = apiKey
    ? new ElevenLabsClient({ apiKey })
    : getElevenLabsClient()
  await client.voices.getAll()
}

export function getElevenLabsClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new ElevenLabsServiceError('ELEVENLABS_API_KEY not configured')
  return new ElevenLabsClient({ apiKey })
}

function wrapSdkError(err: unknown, fallback: string): never {
  if (err instanceof ElevenLabsError || err instanceof ElevenLabsServiceError) {
    throw new ElevenLabsServiceError(err.message || fallback)
  }
  if (err instanceof Error) throw new ElevenLabsServiceError(err.message || fallback)
  throw new ElevenLabsServiceError(fallback)
}

function ttsKind(modelId: string | undefined): ElevenLabsKind {
  const id = (modelId ?? '').toLowerCase()
  if (id.includes('turbo')) return 'tts_turbo'
  if (id.includes('multilingual')) return 'tts_multilingual'
  return 'tts'
}

export interface VoiceSynthOptions {
  modelId?: string
  stability?: number
  similarityBoost?: number
  style?: number
  speakerBoost?: boolean
  speed?: number
  outputFormat?: 'mp3_44100_128' | 'mp3_44100_192'
  source: string
}

export async function generateVoiceBuffer(
  text: string,
  voiceId: string,
  options: VoiceSynthOptions,
): Promise<Buffer> {
  guardPaidAudio(options.source, options.source)
  try {
    return await falAudioBuffer(ttsKind(options.modelId), {
      text,
      voice: voiceId,
      stability: options.stability,
      similarityBoost: options.similarityBoost,
      style: options.style,
      speed: options.speed,
      outputFormat: options.outputFormat,
    }, options.source)
  } catch (err) {
    wrapSdkError(err, 'Voice synthesis failed')
  }
}

export async function cloneVoiceFromUrls(
  audioUrls: string[],
  source = 'audio.voice',
): Promise<string> {
  guardPaidAudio(source, source)
  if (audioUrls.length === 0) throw new ElevenLabsServiceError('No reference audio provided')
  try {
    return await falCloneVoice(audioUrls, source)
  } catch (err) {
    wrapSdkError(err, 'Voice cloning failed')
  }
}

export async function cloneVoiceFromBuffers(
  _name: string,
  files: Buffer[],
  _description?: string,
  source = 'audio.voice',
): Promise<string> {
  guardPaidAudio(source, source)
  if (files.length === 0) throw new ElevenLabsServiceError('No reference audio provided')
  try {
    const audioUrls: string[] = []
    for (const file of files) audioUrls.push(await uploadAudioBuffer(file))
    return await falCloneVoice(audioUrls, source)
  } catch (err) {
    wrapSdkError(err, 'Voice cloning failed')
  }
}

export async function convertSpeechBuffer(
  audioBuffer: Buffer,
  targetVoiceId: string,
  options: { modelId?: string; stability?: number; source: string },
): Promise<Buffer> {
  guardPaidAudio(options.source, options.source)
  try {
    const audioUrl = await uploadAudioBuffer(audioBuffer)
    return await falAudioBuffer('s2s', {
      audioUrl,
      voice: targetVoiceId,
    }, options.source)
  } catch (err) {
    wrapSdkError(err, 'Speech-to-speech conversion failed')
  }
}

export async function generateSoundEffectBuffer(
  description: string,
  durationSeconds: number,
  promptInfluence = 0.3,
  source = 'audio.sfx',
): Promise<Buffer> {
  guardPaidAudio(source, source)
  try {
    return await falAudioBuffer('sfx', {
      text: description,
      durationSeconds,
      promptInfluence,
    }, source)
  } catch (err) {
    wrapSdkError(err, 'SFX generation failed')
  }
}

export async function alignSpeech(
  audio: Buffer | string,
  text: string,
  source: string,
): Promise<Array<{ text: string; start: number; end: number }>> {
  guardPaidAudio(source, source)
  try {
    const audioUrl = typeof audio === 'string' ? audio : await uploadAudioBuffer(audio)
    return await falAlignSpeech(audioUrl, text, source)
  } catch (err) {
    wrapSdkError(err, 'Forced alignment failed')
  }
}

export async function listVoicesSdk(): Promise<
  Array<{ voiceId: string; name: string; previewUrl?: string }>
> {
  try {
    const client = getElevenLabsClient()
    const response = await client.voices.getAll()
    return (response.voices ?? []).map((v) => ({
      voiceId: v.voiceId ?? '',
      name: v.name ?? '',
      previewUrl: v.previewUrl,
    }))
  } catch (err) {
    wrapSdkError(err, 'Failed to list voices')
  }
}
