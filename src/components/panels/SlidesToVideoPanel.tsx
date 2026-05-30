'use client'

import { useState } from 'react'

export function SlidesToVideoPanel() {
  const [file,       setFile]       = useState<File | null>(null)
  const [scriptMode, setScriptMode] = useState<'auto' | 'manual'>('auto')
  const [voiceId,    setVoiceId]    = useState('')
  const [transition, setTransition] = useState('dissolve')
  const [bgMusic,    setBgMusic]    = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progress,   setProgress]   = useState(0)

  const generate = async () => {
    if (!file) return
    setProcessing(true)

    const formData = new FormData()
    formData.append('file', file)
    const upload = await fetch('/api/upload', {
      method: 'POST', credentials: 'include', body: formData,
    }).then(r => r.json()) as { url?: string }

    const res = await fetch('/api/slides-to-video', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileUrl:         upload.url,
        scriptMode,
        voiceId,
        transitionStyle: transition,
        backgroundMusic: bgMusic,
      }),
    })
    const { jobId } = await res.json() as { jobId: string }

    const evtSource = new EventSource(`/api/jobs/${jobId}/stream`)
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data as string) as {
        progress?: number
        status?:   string
        outputUrl?: string
      }
      if (typeof data.progress === 'number') setProgress(data.progress)
      if (data.status === 'complete' || data.status === 'COMPLETE') {
        evtSource.close()
        setProcessing(false)
        window.dispatchEvent(new CustomEvent('add-clip', { detail: { url: data.outputUrl } }))
      }
    }
  }

  return (
    <div className="flex flex-col h-full p-3 space-y-3">
      <span className="text-sm font-semibold text-white">Slides → Video</span>

      <label className="border-2 border-dashed border-[#2a3040] rounded-lg p-6 text-center cursor-pointer hover:border-[#00e5c8] transition">
        <input
          type="file"
          accept=".pdf,.pptx,.ppt"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        <span className="text-xs text-gray-400">
          {file ? file.name : 'Drop PDF or PowerPoint here'}
        </span>
      </label>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Narration</label>
        <div className="flex gap-2">
          {(['auto', 'manual'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setScriptMode(mode)}
              className={`flex-1 py-1.5 rounded text-xs ${
                scriptMode === mode ? 'bg-[#00e5c8] text-black' : 'bg-[#0d1117] text-gray-400'
              }`}
            >
              {mode === 'auto' ? 'AI writes script' : 'I write script'}
            </button>
          ))}
        </div>
      </div>

      {voiceId === '' && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">Voice ID (optional)</label>
          <input
            value={voiceId}
            onChange={e => setVoiceId(e.target.value)}
            placeholder="ElevenLabs voice ID..."
            className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#2a3040] rounded text-xs text-white"
          />
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 block mb-1">Transition</label>
        <select
          value={transition}
          onChange={e => setTransition(e.target.value)}
          className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#2a3040] rounded text-sm text-white"
        >
          <option value="dissolve">Dissolve</option>
          <option value="wipe">Wipe</option>
          <option value="zoom">Zoom</option>
          <option value="film_burn">Film burn</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input type="checkbox" checked={bgMusic} onChange={e => setBgMusic(e.target.checked)} />
        Add background music
      </label>

      {processing ? (
        <div className="space-y-1">
          <div className="h-1.5 bg-[#0d1117] rounded overflow-hidden">
            <div className="h-full bg-[#00e5c8] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] text-gray-500">{progress}% — generating video</span>
        </div>
      ) : (
        <button
          onClick={() => void generate()}
          disabled={!file}
          className="w-full py-2 bg-[#00e5c8] text-black font-semibold rounded disabled:opacity-40 text-sm"
        >
          Generate video
        </button>
      )}
    </div>
  )
}
