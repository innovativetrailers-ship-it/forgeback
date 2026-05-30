'use client'

import { useState, useEffect } from 'react'

interface TranscriptWord {
  word:    string
  start:   number
  end:     number
  speaker: number
}

export function TranscriptPanel({ clipId }: { clipId: string }) {
  const [words,   setWords]   = useState<TranscriptWord[]>([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    if (!clipId) return
    setLoading(true)
    fetch('/api/transcript', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ clipId }),
    })
      .then(r => r.json())
      .then((d: { words?: TranscriptWord[] }) => setWords(d.words ?? []))
      .finally(() => setLoading(false))
  }, [clipId])

  const deleteWord = async (index: number) => {
    const word = words[index]
    await fetch('/api/transcript/edit', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ clipId, action: 'delete', start: word.start, end: word.end }),
    })
    setWords(prev => prev.filter((_, i) => i !== index))
  }

  const jumpToWord = (word: TranscriptWord) => {
    window.dispatchEvent(new CustomEvent('seek-timeline', { detail: { time: word.start } }))
  }

  if (loading) {
    return <div className="p-4 text-gray-400 text-sm animate-pulse">Transcribing...</div>
  }

  const filtered = search
    ? words.filter(w => w.word.toLowerCase().includes(search.toLowerCase()))
    : words

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[#1a2030]">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search transcript..."
          className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#2a3040] rounded text-sm text-white"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3 leading-relaxed text-sm">
        {filtered.map((w, i) => (
          <span
            key={i}
            onClick={() => jumpToWord(w)}
            onContextMenu={(e) => { e.preventDefault(); void deleteWord(i) }}
            className="cursor-pointer hover:bg-[#00e5c8]/20 rounded px-0.5 text-gray-200"
            title={`${w.start.toFixed(1)}s — click to jump, right-click to delete`}
          >
            {w.word}{' '}
          </span>
        ))}
        {filtered.length === 0 && !loading && (
          <p className="text-gray-500 text-xs text-center mt-8">
            {search ? 'No matches' : 'No transcript yet'}
          </p>
        )}
      </div>
      <div className="p-2 border-t border-[#1a2030] flex gap-2">
        <button className="text-xs text-gray-400 hover:text-white">Export .srt</button>
        <button className="text-xs text-gray-400 hover:text-white">Export .vtt</button>
        <button className="text-xs text-gray-400 hover:text-white">Export .txt</button>
      </div>
    </div>
  )
}
