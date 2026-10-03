'use client'

import { useEffect, useRef, useState } from 'react'
import { usePlaybackStore } from '@/store/playbackStore'
import { patchTimelineClip } from '@/lib/timeline/syncToPlayback'
import {
  emptyDialogueLine,
  readDialogue,
  selectVoiceTake,
  type DialogueLine,
  type VoiceParams,
} from '@/lib/audio/dialogueIntent'
import type { Clip } from '@/lib/timeline/schema'

const TONES = ['whispers', 'excited', 'sighs', 'angry', 'warm'] as const
const PAUSES = [0.25, 0.5, 1, 1.5, 2] as const

export function VoiceDialoguePanel({ clip }: { clip: Clip | null }) {
  const projectId = usePlaybackStore((s) => s.projectId)
  const [lines, setLines] = useState<DialogueLine[]>([emptyDialogueLine()])
  const [voices, setVoices] = useState<Array<{ id: string; name: string; voiceId: string | null }>>([])
  const [status, setStatus] = useState('')
  const [pauseSec, setPauseSec] = useState<number>(0.5)
  const lineRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  useEffect(() => {
    const stored = readDialogue(clip?.dialogue)
    setLines(stored.length ? stored : [emptyDialogueLine()])
  }, [clip?.id, clip?.dialogue])

  useEffect(() => {
    if (!projectId) return
    void fetch(`/api/vault/character/list?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => res.json())
      .then((rows: Array<{ id: string; name: string; voiceId?: string | null }>) => {
        if (Array.isArray(rows)) setVoices(rows.map((row) => ({ id: row.id, name: row.name, voiceId: row.voiceId ?? null })))
      })
      .catch((err) => {
        console.warn('[voice_panel] character list failed', err instanceof Error ? err.message : err)
        setVoices([])
      })
  }, [projectId])

  function write(next: DialogueLine[]) {
    setLines(next)
    if (clip) patchTimelineClip(clip.id, { dialogue: next })
  }

  function patchLine(lineId: string, patch: Partial<Omit<DialogueLine, 'params'>> & { params?: Partial<VoiceParams> }) {
    write(lines.map((line) => {
      if (line.lineId !== lineId) return line
      return { ...line, ...patch, params: { ...line.params, ...patch.params } }
    }))
  }

  function insertTag(line: DialogueLine, kind: 'pause' | 'emphasis' | 'tone', tone?: string) {
    const area = lineRefs.current[line.lineId]
    const text = line.text
    const start = area?.selectionStart ?? text.length
    const end = area?.selectionEnd ?? start
    const selected = text.slice(start, end)
    if (kind === 'emphasis') {
      patchLine(line.lineId, { text: `${text.slice(0, start)}*${selected || 'word'}*${text.slice(end)}` })
      return
    }
    const piece = kind === 'pause' ? `<break time="${pauseSec}s" />` : `[${tone}]`
    patchLine(line.lineId, { text: `${text.slice(0, start)}${piece}${text.slice(start)}` })
  }

  async function regenerate(line: DialogueLine) {
    if (!clip || !projectId) return
    const credits = 1
    if (!window.confirm(`Re-generate this line for ${credits} credit? Cancel leaves the current take.`)) return
    setStatus('')
    const res = await fetch('/api/studio/voice/take', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        shotId: clip.id,
        lineId: line.lineId,
        text: line.text,
        characterId: line.characterId,
        voiceId: line.voiceId,
        params: line.params,
      }),
    })
    const body = await res.json() as { error?: string; skipped?: string; dialogue?: DialogueLine[]; mediaPath?: string }
    if (!res.ok) {
      setStatus(body.error || 'Voice was not generated')
      return
    }
    if (body.skipped) {
      setStatus(body.skipped === 'no-voice' ? 'Choose a voice. This shot stays silent.' : 'Add line text first.')
      return
    }
    if (body.dialogue) write(body.dialogue)
    setStatus(body.mediaPath ? 'New take is in the library.' : 'Take ready.')
  }

  async function choose(line: DialogueLine, mediaId: string) {
    const next = selectVoiceTake(lines, line.lineId, mediaId)
    write(next)
    if (!clip || !projectId) return
    await fetch('/api/studio/voice/select', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, shotId: clip.id, lineId: line.lineId, mediaId }),
    })
  }

  async function lipSync(line: DialogueLine) {
    if (!clip || !projectId || !line.text.trim()) return
    const res = await fetch('/api/studio/voice/lipsync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, shotId: clip.id, text: line.text }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? 'Lip-sync used the selected take.' : (body.error || 'Lip-sync did not run'))
  }

  if (!clip) return <p className="p-3 text-[10px] text-[var(--text-tertiary)]">Select a shot to tune its voice.</p>

  return (
    <div className="divide-y divide-[var(--border)]">
      {lines.map((line) => (
        <div key={line.lineId} className="space-y-2 px-3 py-2">
          <label className="block text-[10px] text-[var(--text-tertiary)]">
            Line
            <textarea
              ref={(node) => { lineRefs.current[line.lineId] = node }}
              className="mt-1 w-full rounded bg-black/30 p-1 text-[11px]"
              value={line.text}
              onChange={(event) => patchLine(line.lineId, { text: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-1 text-[10px]">
            <select className="bg-black/30 p-1" value={pauseSec} onChange={(event) => setPauseSec(Number(event.target.value))}>
              {PAUSES.map((sec) => <option key={sec} value={sec}>{sec}s</option>)}
            </select>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => insertTag(line, 'pause')}>Pause</button>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => insertTag(line, 'emphasis')}>Emphasis</button>
            <select
              className="bg-black/30 p-1"
              defaultValue=""
              onChange={(event) => {
                const tone = event.target.value
                event.target.value = ''
                if (tone) insertTag(line, 'tone', tone)
              }}
            >
              <option value="">Tone</option>
              {TONES.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
            </select>
          </div>
          <label className="block text-[10px] text-[var(--text-tertiary)]">
            Voice
            <select
              className="mt-1 w-full bg-black/30 p-1 text-[11px]"
              value={line.characterId ?? ''}
              onChange={(event) => {
                const character = voices.find((row) => row.id === event.target.value)
                patchLine(line.lineId, { characterId: character?.id, voiceId: character?.voiceId ?? undefined })
              }}
            >
              <option value="">No voice — shot stays silent</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>{voice.name}{voice.voiceId ? '' : ' (no voice id)'}</option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] text-[var(--text-tertiary)]">
            Model
            <select
              className="mt-1 w-full bg-black/30 p-1 text-[11px]"
              value={line.params.model}
              onChange={(event) => patchLine(line.lineId, { params: { model: event.target.value === 'flash' ? 'flash' : 'eleven_v3' } })}
            >
              <option value="eleven_v3">eleven_v3</option>
              <option value="flash">flash (speed → turbo)</option>
            </select>
          </label>
          {([
            ['emotion', 0, 1],
            ['stability', 0, 1],
            ['similarity', 0, 1],
            ['style', 0, 1],
            ['speed', 0.7, 1.2],
          ] as const).map(([key, min, max]) => (
            <label key={key} className="block text-[10px] text-[var(--text-tertiary)]">
              {key} {line.params[key]}
              <input
                type="range"
                min={min}
                max={max}
                step={0.01}
                value={line.params[key]}
                onChange={(event) => patchLine(line.lineId, { params: { [key]: Number(event.target.value) } as Partial<VoiceParams> })}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-[10px]">
            <input
              type="checkbox"
              checked={line.lipSync === true}
              onChange={(event) => patchLine(line.lineId, { lipSync: event.target.checked })}
            />
            Lip-sync this take
          </label>
          <button type="button" className="rounded bg-white/10 px-2 py-1 text-[10px]" onClick={() => void regenerate(line)}>
            Re-generate
          </button>
          {(line.takes ?? []).map((mediaId) => (
            <div key={mediaId} className="flex items-center gap-2">
              <audio src={`/api/media/${mediaId}`} controls className="h-8 max-w-full" />
              <button type="button" className="text-[10px] underline" onClick={() => void choose(line, mediaId)}>
                {line.takeMediaId === mediaId ? 'Selected' : 'Use'}
              </button>
            </div>
          ))}
          {line.lipSync && (
            <button type="button" className="rounded bg-white/10 px-2 py-1 text-[10px]" onClick={() => void lipSync(line)}>
              Re-run lip-sync
            </button>
          )}
        </div>
      ))}
      {status && <p className="px-3 py-2 text-[10px]">{status}</p>}
    </div>
  )
}
