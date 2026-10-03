'use client'

import { useState, useRef } from 'react'
import { Upload, Layers, Loader2, Play, Trash2, Clock } from 'lucide-react'

interface CGIInsert {
  id: string
  prompt: string
  insertAt: number
  duration: number
  status: 'pending' | 'generating' | 'complete' | 'failed'
  outputUrl?: string
  progress?: number
}

interface Props {
  sourceVideoUrl?: string
  videoDuration: number
  onInsertComplete: (insert: CGIInsert) => void
}

export function CGIInsertTool({ sourceVideoUrl, videoDuration, onInsertComplete }: Props) {
  const [inserts, setInserts] = useState<CGIInsert[]>([])
  const [prompt, setPrompt] = useState('')
  const [insertAt, setInsertAt] = useState(0)
  const [duration, setDuration] = useState(5)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const idCounter = useRef(0)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const handleAdd = async () => {
    if (!prompt.trim() || !sourceVideoUrl || isSubmitting) return
    setIsSubmitting(true)

    const id = `cgi-${++idCounter.current}`
    const newInsert: CGIInsert = { id, prompt, insertAt, duration, status: 'generating', progress: 0 }
    setInserts((prev) => [...prev, newInsert])

    try {
      const res = await fetch('/api/cgi/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: sourceVideoUrl,
          prompt,
          insertionTimestamps: [insertAt, insertAt + duration],
        }),
      })

      if (!res.ok) throw new Error('CGI API failed')
      const data = await res.json() as { jobId?: string; outputUrl?: string }

      if (data.outputUrl && !data.jobId) {
        const done: CGIInsert = { ...newInsert, status: 'complete', outputUrl: data.outputUrl, progress: 100 }
        setInserts((prev) => prev.map((ins) => (ins.id === id ? done : ins)))
        onInsertComplete(done)
        return
      }
      if (!data.jobId) throw new Error('CGI API failed')

      const sse = new EventSource(`/api/jobs/${data.jobId}/stream`)
      sse.onmessage = (e) => {
        const ev = JSON.parse(e.data) as { status: string; progress?: number; message?: string; outputUrl?: string }
        setInserts((prev) => prev.map((ins) =>
          ins.id === id
            ? { ...ins, progress: ev.progress ?? ins.progress, status: ev.status === 'complete' ? 'complete' : ev.status === 'failed' ? 'failed' : 'generating', outputUrl: ev.outputUrl }
            : ins
        ))
        if (ev.status === 'complete' || ev.status === 'failed') {
          sse.close()
          if (ev.status === 'complete') {
            onInsertComplete({ ...newInsert, status: 'complete', outputUrl: ev.outputUrl })
          }
        }
      }
      sse.onerror = () => {
        sse.close()
        setInserts((prev) => prev.map((ins) => ins.id === id ? { ...ins, status: 'failed' } : ins))
      }
    } catch (err) {
      console.warn("[caught] src/components/ultimate/CGIInsertTool.tsx:85", err instanceof Error ? { name: err.name, message: err.message } : err)

      setInserts((prev) => prev.map((ins) => ins.id === id ? { ...ins, status: 'failed' } : ins))
    } finally {
      setIsSubmitting(false)
      setPrompt('')
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 flex-shrink-0">
        <Layers className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">CGI Insert</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* No source video warning */}
        {!sourceVideoUrl && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-[#00e5c8]/20 bg-[#00e5c8]/8 text-[#00e5c8] text-xs">
            <Upload className="w-3.5 h-3.5 flex-shrink-0" />
            Select a clip on the timeline to insert CGI into it
          </div>
        )}

        {/* Insert form */}
        <div className="space-y-3 p-3 bg-white/3 rounded-xl border border-white/8">
          <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">New CGI Insert</p>

          <div>
            <p className="text-[10px] text-white/30 mb-1">3D Object / VFX Prompt</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A chrome metallic sphere hovering in midair, physically accurate reflections…"
              className="w-full h-16 bg-[#12121a] border border-white/10 rounded-lg px-2.5 py-2
                text-xs text-white/70 placeholder:text-white/20 resize-none
                focus:outline-none focus:border-[#00e5c8]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-[10px] text-white/30">Insert at</p>
                <span className="text-[10px] text-[#00e5c8] font-mono">{formatTime(insertAt)}</span>
              </div>
              <input
                type="range" min={0} max={Math.max(0, videoDuration - 1)} step={0.5} value={insertAt}
                onChange={(e) => setInsertAt(Number(e.target.value))}
                className="w-full accent-[#00e5c8] h-1"
                disabled={!sourceVideoUrl}
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-[10px] text-white/30">Duration</p>
                <span className="text-[10px] text-[#00e5c8] font-mono">{duration}s</span>
              </div>
              <input
                type="range" min={2} max={10} step={1} value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-[#00e5c8] h-1"
              />
            </div>
          </div>

          {/* Timeline visualiser */}
          {videoDuration > 0 && (
            <div className="relative h-6 bg-black/30 rounded-lg overflow-hidden">
              {/* Source video bar */}
              <div className="absolute inset-y-0 left-0 right-0 bg-blue-500/20 rounded-lg" />
              {/* Insert marker */}
              <div
                className="absolute inset-y-0 bg-[#00e5c8]/40 rounded"
                style={{
                  left: `${(insertAt / videoDuration) * 100}%`,
                  width: `${(duration / videoDuration) * 100}%`,
                }}
              />
              <div className="absolute inset-0 flex items-center px-2">
                <span className="text-[9px] text-white/30">CGI at {formatTime(insertAt)}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={!prompt.trim() || !sourceVideoUrl || isSubmitting}
            className="w-full py-2 rounded-lg bg-[#00e5c8] text-black font-semibold text-xs
              hover:bg-[#00f0d5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center gap-1.5"
          >
            {isSubmitting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              : <><Layers className="w-3.5 h-3.5" /> Insert CGI · ⬡ 80</>}
          </button>
        </div>

        {/* Existing inserts */}
        {inserts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Queue ({inserts.length})</p>
            {inserts.map((ins) => (
              <div key={ins.id} className="p-3 rounded-xl border border-white/8 bg-white/2 space-y-2">
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0
                    ${ins.status === 'complete' ? 'bg-green-500' : ins.status === 'failed' ? 'bg-red-500' : 'bg-[#00e5c8] animate-pulse'}`} />
                  <p className="text-[10px] text-white/60 flex-1 line-clamp-2">{ins.prompt}</p>
                  <button
                    onClick={() => setInserts((prev) => prev.filter((i) => i.id !== ins.id))}
                    className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[9px] text-white/25">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(ins.insertAt)} + {ins.duration}s
                </div>

                {ins.status === 'generating' && (
                  <div className="space-y-1">
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00e5c8] rounded-full transition-all duration-500"
                        style={{ width: `${ins.progress ?? 0}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-[#00e5c8]/60">{ins.progress ?? 0}% — Generating 3D + compositing…</p>
                  </div>
                )}

                {ins.status === 'complete' && ins.outputUrl && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 aspect-video bg-black rounded-lg overflow-hidden">
                      <video src={ins.outputUrl} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                    </div>
                    <a href={ins.outputUrl} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-white/8 text-white/40 hover:text-white/70 transition-colors">
                      <Play className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
