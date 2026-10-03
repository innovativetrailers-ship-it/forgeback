'use client'

import { useState } from 'react'
import { usePlaybackStore } from '@/store/playbackStore'
import { useStudioStore } from '@/store/editor'

const LANGUAGES = ['Spanish', 'French', 'Japanese', 'German']

export function TranslatePanel() {
  const [language, setLanguage] = useState(LANGUAGES[0])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedClipId = useStudioStore((s) => s.selectedClipId)

  const translate = async () => {
    const recipe = usePlaybackStore.getState().recipe
    const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)
    const sourceVideoUrl = clip?.sourceUrl?.trim()
    if (!sourceVideoUrl) {
      setError('Select a timeline clip that has video.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/translate/video', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceVideoUrl,
          targetLanguage: language,
          translateCaptions: true,
          dubAudio: false,
          resyncLips: false,
          preserveOriginalAudio: true,
        }),
      })
      const body = await res.json() as { error?: string; srtUrl?: string }
      if (!res.ok) throw new Error(body.error ?? 'Translation failed')
      if (!body.srtUrl) throw new Error('No subtitles returned')
      const srt = await fetch(body.srtUrl)
      setText(await srt.text())
    } catch (err) {
      console.warn('[translate]', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Translation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="panel-label">Subtitle translation</p>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1 text-[11px]"
      >
        {LANGUAGES.map((lang) => <option key={lang}>{lang}</option>)}
      </select>
      <button
        type="button"
        onClick={() => void translate()}
        disabled={busy}
        className="py-2 rounded-md text-[11px] font-semibold bg-[var(--teal-bright)] text-[#03080e] disabled:opacity-40"
      >
        {busy ? 'Translating…' : 'Translate subtitles'}
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      {text && (
        <pre className="text-[10px] whitespace-pre-wrap text-[var(--text-secondary)] max-h-64 overflow-auto">{text}</pre>
      )}
    </div>
  )
}
