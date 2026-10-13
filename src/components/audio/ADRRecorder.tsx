'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, Square, Play, Trash2, Check } from 'lucide-react'

interface Take {
  id: string
  url: string
  duration: number
  selected: boolean
}

interface Props {
  clipId: string
  referenceUrl?: string
  onTakeSelected?: (url: string) => void
}

export function ADRRecorder({ clipId, onTakeSelected }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [takes, setTakes] = useState<Take[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const duration = blob.size / 16000 // rough estimate

        setUploading(true)
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'adr-take.webm')
          formData.append('clipId', clipId)
          formData.append('type', 'adr')
          const res = await fetch('/api/audio/upload', { method: 'POST', body: formData })
          const { url } = await res.json() as { url: string }
          const id = `take-${Date.now()}`
          setTakes((prev) => [...prev, { id, url, duration, selected: false }])
        } finally {
          setUploading(false)
        }
      }

      // 3-second countdown
      let count = 3
      setCountdown(count)
      countdownRef.current = setInterval(() => {
        count--
        setCountdown(count)
        if (count === 0) {
          clearInterval(countdownRef.current!)
          recorder.start()
          setIsRecording(true)
        }
      }, 1000)
    } catch (err) {
      console.warn("[caught] src/components/audio/ADRRecorder.tsx:71", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError('Microphone access denied. Please allow microphone access and try again.')
    }
  }, [clipId])

  const stopRecording = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; setCountdown(0) }
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const deleteTake = useCallback((id: string) => {
    setTakes((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const selectTake = useCallback((id: string) => {
    setTakes((prev) => prev.map((t) => ({ ...t, selected: t.id === id })))
    const take = takes.find((t) => t.id === id)
    if (take) onTakeSelected?.(take.url)
  }, [takes, onTakeSelected])

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/8 p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <Mic className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">ADR Recorder</span>
      </div>

      {/* Waveform placeholder */}
      <div className="h-12 bg-[#12121a] rounded-lg border border-white/6 mb-3 flex items-center justify-center gap-0.5 overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all ${isRecording ? 'bg-red-500' : 'bg-white/15'}`}
            style={{ height: `${20 + Math.sin(i * 0.4) * 12 + Math.random() * 8}px` }}
          />
        ))}
      </div>

      {error && <p className="text-red-400 text-[9px] mb-2">{error}</p>}

      {countdown > 0 && (
        <div className="text-center text-2xl font-bold text-[#00e5c8] mb-2">{countdown}</div>
      )}

      <div className="flex gap-2 mb-3">
        {!isRecording && countdown === 0 ? (
          <button
            onClick={() => void startRecording()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs hover:bg-red-500/30 disabled:opacity-40 transition"
          >
            <Mic className="w-3 h-3" /> Record Take
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500 text-white text-xs hover:bg-red-600 transition"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        )}
      </div>

      {takes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Takes ({takes.length})</p>
          {takes.map((take, i) => (
            <div
              key={take.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs transition ${
                take.selected ? 'border-[#00e5c8]/40 bg-[#00e5c8]/5 text-[#00e5c8]' : 'border-white/8 text-white/50'
              }`}
            >
              <span className="text-[9px] shrink-0">Take {i + 1}</span>
              <span className="flex-1 text-[9px] text-white/25">{take.duration.toFixed(1)}s</span>
              <button onClick={() => void (new Audio(take.url)).play()} className="hover:text-white/80 transition">
                <Play className="w-3 h-3" />
              </button>
              <button onClick={() => selectTake(take.id)} className="hover:text-[#00e5c8] transition">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => deleteTake(take.id)} className="hover:text-red-400 transition">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
