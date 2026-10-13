'use client'

import { useState } from 'react'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import {
  assembleFromTranscript,
  fillerRanges,
  removeFillers,
  rippleRemoveRange,
  sentenceRange,
  type TranscriptWord,
} from '@/lib/editor/gapFixes'

const CREDITS = 8

export function TranscriptPanel({
  recipe,
  selectedClipId,
  onCommit,
  onSeek,
}: {
  recipe: TimelineRecipe
  selectedClipId: string | null
  onCommit: (recipe: TimelineRecipe) => void
  onSeek: (time: number) => void
}) {
  const [words, setWords] = useState<TranscriptWord[]>([])
  const [raw, setRaw] = useState('')
  const [script, setScript] = useState('')
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState(false)
  const clip = recipe.tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)

  function load() {
    const next = raw.split('\n').flatMap((line) => {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 3) return []
      const end = Number(parts.pop())
      const start = Number(parts.pop())
      if (!Number.isFinite(start) || !Number.isFinite(end)) return []
      return [{ text: parts.join(' '), start, end }]
    })
    setWords(next)
    setNote(next.length ? `${next.length} words loaded.` : 'Each line needs a word, a start, and an end.')
  }

  async function transcribe() {
    if (!clip?.sourceUrl?.startsWith('http')) {
      setNote('Select a clip with a stored address.')
      return
    }
    try {
    if (!armed) {
      const res = await fetch('/api/studio/audio/gap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'transcribe', confirm: false, audioUrl: clip.sourceUrl }),
      })
      const body = await res.json() as { estimateCredits?: number; error?: string }
      if (!res.ok) {
        setNote(body.error || 'Could not price transcription')
        return
      }
      setArmed(true)
      setNote(`${body.estimateCredits ?? CREDITS} credits to transcribe this clip. Confirm to run.`)
      return
    }
    setNote('Transcribing…')
    const res = await fetch('/api/studio/audio/gap', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'transcribe', confirm: true, audioUrl: clip.sourceUrl }),
    })
    const body = await res.json() as { words?: TranscriptWord[]; error?: string }
    setArmed(false)
    if (!res.ok || !body.words?.length) {
      setNote(body.error || 'Transcription did not return words')
      return
    }
    setWords(body.words)
    setNote(`${body.words.length} words. The clip file stays.`)
    } catch (err) {
      console.warn('[transcript]', err instanceof Error ? err.message : err)
      setArmed(false)
      setNote('Transcription did not run')
    }
  }

  function assemble() {
    const lines = script.split('\n').map((line) => line.trim()).filter(Boolean)
    const takes = recipe.tracks.flatMap((track) => track.clips).flatMap((row) => {
      const text = typeof row.metadata?.transcript === 'string' ? row.metadata.transcript : row.prompt
      if (!text || !row.sourceUrl) return []
      return [{ id: row.id, text, sourceUrl: row.sourceUrl }]
    })
    if (!lines.length || !takes.length) {
      setNote('Assembly needs script lines and takes that already have a prompt or transcript. Nothing is generated.')
      return
    }
    onCommit(assembleFromTranscript(recipe, lines, takes))
    setNote('Best take per line is on the video track. Alternates are muted and locked. Low scores stay flagged.')
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2 text-[11px] text-white/75">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Transcript</p>
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void transcribe()}>
        {armed ? `Confirm transcribe · ${CREDITS} cr` : `Transcribe clip · ${CREDITS} cr`}
      </button>
      <textarea
        className="h-16 rounded border border-white/10 bg-black/40 p-1"
        placeholder="word start end"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
      />
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={load}>Load words</button>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        onClick={() => onCommit(removeFillers(recipe, words))}
      >
        Remove um / uh ({fillerRanges(words).length})
      </button>
      <div className="flex flex-wrap gap-1">
        {words.map((word, index) => (
          <button key={`${word.start}-${index}`} type="button" className="rounded bg-white/10 px-1" onClick={() => onSeek(word.start)}>
            {word.text}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        onClick={() => {
          const sentence = window.prompt('Sentence to ripple out', words.map((word) => word.text).join(' ')) ?? ''
          const range = sentenceRange(words, sentence)
          if (!range) {
            setNote('That sentence is not in the transcript.')
            return
          }
          onCommit(rippleRemoveRange(recipe, range.start, range.end))
        }}
      >
        Ripple out sentence
      </button>
      <textarea
        className="h-16 rounded border border-white/10 bg-black/40 p-1"
        placeholder="One script line per row"
        value={script}
        onChange={(event) => setScript(event.target.value)}
      />
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={assemble}>Assemble from takes</button>
      {note && <p className="text-white/50">{note}</p>}
    </div>
  )
}
