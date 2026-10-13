import { pipeline } from 'stream/promises'
import { createWriteStream, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import https from 'https'
import http from 'http'

export interface BeatAnalysis {
  beats: number[]
  bpm: number
  downbeats: number[]
}

async function downloadToTemp(url: string): Promise<string> {
  const tempPath = path.join(tmpdir(), `cinema_audio_${Date.now()}.mp3`)
  const protocol = url.startsWith('https') ? https : http

  await new Promise<void>((resolve, reject) => {
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const writer = createWriteStream(tempPath)
      pipeline(res, writer).then(resolve).catch((err) => {
        console.warn("[caught] src/lib/audio/beats.ts:25", err instanceof Error ? { name: err.name, message: err.message } : err)
        reject(err)
      })
    }).on('error', reject)
  })

  return tempPath
}

export async function detectBeats(audioUrl: string): Promise<BeatAnalysis> {
  // Use ffprobe to extract audio metadata, then estimate BPM
  // Full FFT beat detection requires the ffmpeg WASM in browser context
  // Server-side we use ffprobe to get duration and estimate from typical BPMs

  let tempPath: string | null = null

  try {
    tempPath = await downloadToTemp(audioUrl)

    // Use dynamic import for fluent-ffmpeg
    const ffmpeg = (await import('fluent-ffmpeg')).default

    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempPath!, (err, metadata) => {
        if (err) reject(err)
        else resolve(metadata.format.duration ?? 0)
      })
    })

    // Onset detection via energy analysis
    // We split the audio into 50ms frames and detect energy spikes
    const bpm = await estimateBPM(tempPath)

    const beatInterval = 60 / bpm
    const beats: number[] = []
    let t = 0
    while (t < duration) {
      beats.push(Math.round(t * 1000) / 1000)
      t += beatInterval
    }

    // Downbeats are every 4 beats (4/4 time signature)
    const downbeats = beats.filter((_, i) => i % 4 === 0)

    return { beats, bpm, downbeats }
  } catch (err) {
    console.warn("[caught] src/lib/audio/beats.ts:68", err instanceof Error ? { name: err.name, message: err.message } : err)

    // Fallback: return estimated beats at 120 BPM
    const bpm = 120
    const beatInterval = 60 / bpm
    const beats: number[] = Array.from({ length: 60 }, (_, i) => i * beatInterval)
    return { beats, bpm, downbeats: beats.filter((_, i) => i % 4 === 0) }
  } finally {
    if (tempPath) {
      try { unlinkSync(tempPath) } catch (err) {
        console.warn("[caught] src/lib/audio/beats.ts:76", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    }
  }
}

async function estimateBPM(audioPath: string): Promise<number> {
  // Use ffmpeg to extract raw PCM audio and perform onset detection
  const ffmpeg = (await import('fluent-ffmpeg')).default

  const samples: number[] = []

  await new Promise<void>((resolve, reject) => {
    ffmpeg(audioPath)
      .audioFrequency(8000)
      .audioChannels(1)
      .format('s16le')
      .pipe()
      .on('data', (chunk: Buffer) => {
        // Read 16-bit signed samples
        for (let i = 0; i < chunk.length - 1; i += 2) {
          samples.push(Math.abs(chunk.readInt16LE(i)))
        }
      })
      .on('end', resolve)
      .on('error', reject)
  })

  if (samples.length < 100) return 120

  // Compute energy in 50ms frames at 8000 Hz = 400 samples/frame
  const frameSize = 400
  const energies: number[] = []

  for (let i = 0; i < samples.length - frameSize; i += frameSize) {
    const frame = samples.slice(i, i + frameSize)
    const energy = frame.reduce((sum, s) => sum + s * s, 0) / frameSize
    energies.push(energy)
  }

  // Find onset peaks (local maxima above threshold)
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length
  const threshold = mean * 1.5
  const onsets: number[] = []

  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      onsets.push(i * 0.05) // convert frame index to seconds (50ms frames)
    }
  }

  if (onsets.length < 4) return 120

  // Estimate BPM from average inter-onset interval
  const intervals: number[] = []
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1])
  }

  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const rawBpm = 60 / meanInterval

  // Normalize to reasonable BPM range (60-180)
  let bpm = rawBpm
  while (bpm < 60) bpm *= 2
  while (bpm > 180) bpm /= 2

  return Math.round(bpm)
}
