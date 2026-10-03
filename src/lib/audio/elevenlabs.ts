import { nanoid } from 'nanoid'
import {
  cloneVoiceFromBuffers,
  generateVoiceBuffer,
  listVoicesSdk,
} from '@/lib/elevenlabs/client'
import { uploadToR2 } from '../storage/r2'

export async function synthesiseSpeech(params: {
  text: string
  voiceId: string
  emotion?: 'neutral' | 'excited' | 'sad' | 'angry' | 'whispering'
  stability?: number
  similarityBoost?: number
}): Promise<{ audioUrl: string }> {
  const audioBuffer = await generateVoiceBuffer(params.text, params.voiceId, {
    modelId: 'eleven_turbo_v2_5',
    stability: params.stability ?? 0.5,
    similarityBoost: params.similarityBoost ?? 0.75,
    source: 'audio.voice',
  })

  const key = `audio/speech/${nanoid()}.mp3`
  const audioUrl = await uploadToR2(audioBuffer, key, 'audio/mpeg')
  return { audioUrl }
}

export async function cloneVoice(params: {
  name: string
  audioSamples: string[]
}): Promise<{ voiceId: string }> {
  const files: Buffer[] = []
  for (const sampleUrl of params.audioSamples.slice(0, 5)) {
    const res = await fetch(sampleUrl)
    files.push(Buffer.from(await res.arrayBuffer()))
  }
  const voiceId = await cloneVoiceFromBuffers(
    params.name,
    files,
    `Cloned voice for CINÉMA character: ${params.name}`,
  )
  return { voiceId }
}

export async function listVoices(): Promise<Array<{ voiceId: string; name: string; previewUrl: string }>> {
  const voices = await listVoicesSdk()
  return voices.map((v) => ({
    voiceId: v.voiceId,
    name: v.name,
    previewUrl: v.previewUrl ?? '',
  }))
}
