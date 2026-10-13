'use client'

import { useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '../../store/editor'

interface TranscriptWord {
  word: string
  start: number
  end: number
  confidence: number
  trackId: string
  clipId: string
  markedForRemoval: boolean
}

interface TranscriptEditorProps {
  projectId: string
  onApplyEdits?: (removedSegments: Array<{ start: number; end: number; clipId: string }>) => void
}

export default function TranscriptEditor({ projectId, onApplyEdits }: TranscriptEditorProps) {
  const [words, setWords] = useState<TranscriptWord[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
  const [notice, setNotice] = useState('')
  const [armed, setArmed] = useState(false)
  const { setPlayheadTime } = useEditorStore()

  const loadTranscript = useCallback(async () => {
    setLoading(true)
    try {
      const projectRes = await fetch(`/api/projects/${projectId}`, { credentials: 'include' })
      if (!projectRes.ok) throw new Error('Could not load the project')
      const project = await projectRes.json() as {
        recipe?: { tracks?: Array<{ clips?: Array<{ id?: string; sourceUrl?: string }> }> }
      }
      const clip = (project.recipe?.tracks ?? []).flatMap((track) => track.clips ?? []).find((row) => row.sourceUrl?.startsWith('http'))
      const audioUrl = clip?.sourceUrl
      if (!audioUrl) throw new Error('This project has no clip with a stored address')
      if (!armed) {
        const quote = await fetch('/api/studio/audio/gap', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'transcribe', confirm: false, audioUrl }),
        })
        const priced = await quote.json() as { estimateCredits?: number; error?: string }
        if (!quote.ok) throw new Error(priced.error || 'Could not price transcription')
        setArmed(true)
        setNotice(`${priced.estimateCredits ?? 8} credits to transcribe. Press Transcribe again to run.`)
        return
      }
      const resp = await fetch('/api/studio/audio/gap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'transcribe', confirm: true, audioUrl }),
      })
      const data = await resp.json() as { words?: Array<{ text: string; start: number; end: number }>; error?: string }
      if (!resp.ok) throw new Error(data.error || 'Transcription failed')
      setArmed(false)
      setWords((data.words ?? []).map((word) => ({
        word: word.text,
        start: word.start,
        end: word.end,
        confidence: 1,
        trackId: '',
        clipId: clip.id ?? projectId,
        markedForRemoval: false,
      })))
      setNotice(`${data.words?.length ?? 0} words. The clip file stays.`)
    } catch (err) {
      console.warn('[transcript]', err instanceof Error ? err.message : err)
      setArmed(false)
      setNotice(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setLoading(false)
    }
  }, [projectId, armed])

  function toggleWord(idx: number) {
    setWords((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], markedForRemoval: !updated[idx].markedForRemoval }
      return updated
    })
  }

  function selectRange(startIdx: number, endIdx: number) {
    const start = words[startIdx]?.start ?? 0
    const end = words[endIdx]?.end ?? 0
    setSelectedRange({ start, end })
    setWords((prev) =>
      prev.map((w, i) => (i >= startIdx && i <= endIdx ? { ...w, markedForRemoval: true } : w))
    )
  }

  function jumpToWord(word: TranscriptWord) {
    setPlayheadTime(word.start)
  }

  function applyEdits() {
    const removedSegments = words
      .filter((w) => w.markedForRemoval)
      .map((w) => ({ start: w.start, end: w.end, clipId: w.clipId }))
    onApplyEdits?.(removedSegments)
  }

  function exportSRT(): void {
    let srt = ''
    let idx = 1
    const grouped: TranscriptWord[][] = []
    let current: TranscriptWord[] = []

    for (const word of words.filter((w) => !w.markedForRemoval)) {
      current.push(word)
      if (current.length >= 8) {
        grouped.push(current)
        current = []
      }
    }
    if (current.length) grouped.push(current)

    for (const seg of grouped) {
      const start = seg[0].start
      const end = seg[seg.length - 1].end
      srt += `${idx}\n${formatSRT(start)} --> ${formatSRT(end)}\n${seg.map((w) => w.word).join(' ')}\n\n`
      idx++
    }

    const blob = new Blob([srt], { type: 'text/srt' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'captions.srt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredIndices = searchQuery
    ? words.reduce<number[]>((acc, w, i) => {
        if (w.word.toLowerCase().includes(searchQuery.toLowerCase())) acc.push(i)
        return acc
      }, [])
    : []

  const markedCount = words.filter((w) => w.markedForRemoval).length
  const timeSaved = words
    .filter((w) => w.markedForRemoval)
    .reduce((acc, w) => acc + (w.end - w.start), 0)

  return (
    <div className="flex flex-col h-full bg-[#111118] rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          onClick={loadTranscript}
          disabled={loading}
          className="px-3 py-1.5 bg-[#00e5c8] hover:bg-[#00f0d5] disabled:opacity-50 rounded-lg text-sm font-medium transition-colors text-black"
        >
          {loading ? 'Transcribing...' : armed ? 'Confirm transcribe' : 'Transcribe'}
        </button>
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-teal-400"
        />
        <button
          onClick={exportSRT}
          disabled={words.length === 0}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 rounded-lg text-sm text-white transition-colors"
        >
          Export SRT
        </button>
      </div>
      {notice && <p className="px-4 py-2 text-xs text-white/60">{notice}</p>}

      {/* Stats bar */}
      {words.length > 0 && (
        <div className="px-4 py-2 bg-white/5 text-xs text-gray-400 flex gap-4">
          <span>{words.length} words</span>
          {markedCount > 0 && (
            <>
              <span className="text-red-400">{markedCount} marked for removal</span>
              <span className="text-[#00e5c8]">~{timeSaved.toFixed(1)}s saved</span>
            </>
          )}
        </div>
      )}

      {/* Transcript content */}
      <div className="flex-1 overflow-y-auto p-4">
        {words.length === 0 ? (
          <div className="text-gray-500 text-sm text-center mt-8">
            Click "Transcribe" to generate a transcript from your dialogue tracks.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 leading-relaxed">
            {words.map((word, i) => {
              const isHighlighted = filteredIndices.includes(i)
              return (
                <span
                  key={`${word.clipId}-${i}`}
                  onClick={() => toggleWord(i)}
                  onDoubleClick={() => jumpToWord(word)}
                  className={`cursor-pointer rounded px-0.5 text-sm transition-all select-none ${
                    word.markedForRemoval
                      ? 'line-through text-gray-600 bg-red-900/30'
                      : isHighlighted
                      ? 'bg-[#00f0d5]/30 text-teal-200'
                      : 'text-white hover:bg-white/10'
                  }`}
                  title={`${word.start.toFixed(2)}s — ${word.end.toFixed(2)}s (${(word.confidence * 100).toFixed(0)}% confidence)`}
                >
                  {word.word}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Apply edits bar */}
      {markedCount > 0 && (
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {markedCount} segments marked — {timeSaved.toFixed(1)}s will be removed
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setWords((prev) => prev.map((w) => ({ ...w, markedForRemoval: false })))}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
            >
              Clear marks
            </button>
            <button
              onClick={applyEdits}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white transition-colors"
            >
              Apply edits
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
