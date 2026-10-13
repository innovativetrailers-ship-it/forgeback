import { falEndpoint } from '@cinema/core/endpoints'
import { redis } from '../redis'
import { uploadToR2 } from '../storage/r2'
import { generateVoiceBuffer } from '@/lib/elevenlabs/client'
import { runFal } from '../fal/client'
import { runModel1 } from '../brain/model1'
import { writeFile as fsWriteFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Shot } from './types'

type AudioTaskType =
  | 'elevenlabs_tts'  // character dialogue via ElevenLabs vault voice
  | 'suno_music'      // background score via Suno
  | 'audiocraft_foley'// ambient + SFX via AudioCraft
  | 'silence'         // intentionally silent (cut to music only)

interface AudioTask {
  shot_id: string
  type: AudioTaskType
  duration_seconds: number
  prompt?: string
  voice_id?: string
  dialogue_text?: string
  music_style?: string
  foley_description?: string
  source_video_url?: string
}

export interface AudioResult {
  shot_id: string
  audio_url: string
  duration_seconds: number
  type: AudioTaskType
  has_speech: boolean
  peak_db: number
}

export class AudioSwarm {

  async planAudioTasks(shots: Shot[]): Promise<AudioTask[]> {
    const tasks: AudioTask[] = []

    for (const shot of shots) {
      // VLMs output silent video — dialogue always via ElevenLabs, never extracted from model output.
      if (shot.has_dialogue) {
        const dialogueText = await this.extractDialogueFromDescription(shot.description)
        const voiceId = shot.character_ids.length
          ? await this.getVaultVoiceId(shot.character_ids[0])
          : process.env.ELEVENLABS_DEFAULT_VOICE_ID
        if (voiceId && dialogueText) {
          tasks.push({
            shot_id: shot.shot_id,
            type: 'elevenlabs_tts',
            duration_seconds: shot.duration_seconds,
            dialogue_text: dialogueText,
            voice_id: voiceId,
          })
          continue
        }
      }

      if (shot.scene_category === 'audio_music_video') {
        tasks.push({
          shot_id: shot.shot_id,
          type: 'suno_music',
          duration_seconds: shot.duration_seconds,
          music_style: this.deriveMusicStyle(shot.mood),
        })
        continue
      }

      tasks.push({
        shot_id: shot.shot_id,
        type: 'audiocraft_foley',
        duration_seconds: shot.duration_seconds,
        foley_description: await this.deriveFoleyDescription(shot),
      })
    }

    return tasks
  }

  async dispatch(tasks: AudioTask[], projectId: string): Promise<AudioResult[]> {
    const results = await Promise.allSettled(
      tasks.map(task => this.executeAudioTask(task))
    )

    const ok: AudioResult[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(r.value)
      else console.error(`Audio task ${tasks[i].shot_id} failed:`, r.reason)
    })

    return ok
  }

  private async executeAudioTask(task: AudioTask): Promise<AudioResult> {
    let audioUrl = ''
    let hasSpeech = false

    switch (task.type) {
      case 'elevenlabs_tts': {
        if (!task.voice_id || !task.dialogue_text) {
          throw new Error('elevenlabs_tts task missing voice_id or dialogue_text')
        }
        const audioBuffer = await generateVoiceBuffer(task.dialogue_text, task.voice_id, {
          modelId: 'eleven_turbo_v2_5',
          stability: 0.5,
          similarityBoost: 0.85,
          style: 0.3,
          source: 'audio.voice',
        })
        audioUrl = await uploadToR2(
          audioBuffer,
          `audio/${task.shot_id}_voice.mp3`,
          'audio/mpeg'
        )
        hasSpeech = true
        break
      }

      case 'suno_music': {
        audioUrl = await this.generateSunoMusic(task.music_style ?? 'neutral cinematic underscore')
        break
      }

      case 'audiocraft_foley': {
        const result = await runFal(falEndpoint('stable-audio'), {
            prompt: task.foley_description ?? '',
            seconds_total: task.duration_seconds,
          }) as { audio_file?: { url: string }; audio_url?: string }
        audioUrl = result.audio_file?.url ?? result.audio_url ?? ''
        break
      }

      case 'silence':
      default:
        audioUrl = ''
    }

    return {
      shot_id: task.shot_id,
      audio_url: audioUrl,
      duration_seconds: task.duration_seconds,
      type: task.type,
      has_speech: hasSpeech,
      peak_db: -14,
    }
  }

  async mergeAudioIntoClips(
    videoResults: Array<{ shot_id: string; output_url: string }>,
    audioResults: AudioResult[]
  ): Promise<Array<{ shot_id: string; output_url: string }>> {
    return Promise.all(
      videoResults.map(async video => {
        const audio = audioResults.find(a => a.shot_id === video.shot_id)
        if (!audio || !audio.audio_url) return video
        const merged = await this.mergeVideoAudio(video.output_url, audio.audio_url)
        return { shot_id: video.shot_id, output_url: merged }
      })
    )
  }

  private async mergeVideoAudio(videoUrl: string, audioUrl: string): Promise<string> {
    const tmp = tmpdir()
    const vPath = join(tmp, `vid_${Date.now()}.mp4`)
    const aPath = join(tmp, `aud_${Date.now()}.mp3`)
    const oPath = join(tmp, `merged_${Date.now()}.mp4`)

    await Promise.all([
      this.downloadToPath(videoUrl, vPath),
      this.downloadToPath(audioUrl, aPath),
    ])

    const { runArgv } = await import('@/lib/shell/argv')
    runArgv('ffmpeg', ['-y', '-i', vPath, '-i', aPath, '-c:v', 'copy', '-c:a', 'aac', '-shortest', oPath])

    const { readFile } = await import('fs/promises')
    const buffer = await readFile(oPath)
    return uploadToR2(buffer, `merged/${Date.now()}.mp4`, 'video/mp4')
  }

  private async extractDialogueFromDescription(description: string): Promise<string> {
    const matches = description.match(/"([^"]+)"/g)
    if (matches) return matches.map(m => m.replace(/"/g, '')).join(' ')
    const r = await runModel1({
      systemPrompt: 'Extract or generate a short line of dialogue (1-2 sentences) that a character would say in this scene. Return only the dialogue text.',
      userMessage: description,
      requireJSON: false,
    })
    return r.content.trim()
  }

  private async getVaultVoiceId(characterId: string): Promise<string> {
    const { db } = await import('../db')
    const char = await db.vaultCharacter.findUnique({ where: { id: characterId } })
    return char?.voiceId ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'
  }

  private deriveMusicStyle(mood: string): string {
    const styles: Record<string, string> = {
      tense:      'tense orchestral strings, minor key, building pressure, no melody',
      serene:     'peaceful ambient piano, warm pads, gentle and floating',
      dramatic:   'epic orchestral, full brass section, cinematic swell',
      romantic:   'soft strings, gentle piano melody, intimate and warm',
      triumphant: 'heroic brass fanfare, full orchestra, major key, driving rhythm',
      horror:     'dissonant strings, atonal, low rumble, unsettling',
      comedic:    'light pizzicato strings, playful woodwinds, bouncy rhythm',
      melancholic: 'solo piano, minor key, slow tempo, sparse arrangement',
    }
    return styles[mood] ?? 'neutral cinematic underscore, subtle, not distracting'
  }

  private async deriveFoleyDescription(shot: Shot): Promise<string> {
    const elements: string[] = []
    if (shot.has_fluid_physics) elements.push('rain on surfaces, water movement')
    if (shot.has_vehicle) elements.push('vehicle engine, mechanical sounds, movement')
    if (shot.has_crowd) elements.push('crowd murmur, urban ambience, footsteps')
    if (shot.has_animal) elements.push('natural wildlife ambience, wind')
    if (shot.scene_category.startsWith('environment_')) elements.push('wind, nature ambience, birds distant')
    if (shot.scene_category.startsWith('urban_')) elements.push('city ambience, traffic distant, urban hum')
    if (shot.has_fire_explosion) elements.push('fire crackle, explosion rumble, debris')
    if (elements.length === 0) elements.push('subtle room tone, quiet ambience')
    return elements.join(', ')
  }

  private async downloadToPath(url: string, dest: string): Promise<void> {
    const resp = await fetch(url)
    await fsWriteFile(dest, Buffer.from(await resp.arrayBuffer()))
  }

  private async generateSunoMusic(style: string): Promise<string> {
    const { generateMusic } = await import('@/lib/audio/providers')
    const result = await generateMusic({
      prompt: style,
      instrumental: true,
      targetSeconds: 30,
      source: 'audio.music',
    })
    return result.url
  }
}
