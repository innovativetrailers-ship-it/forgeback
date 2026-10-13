'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, Square, Crosshair } from 'lucide-react'

interface FoleyTake {
  id: string
  url: string
  syncTimecode: number
  label: string
}

interface Props {
  clipId: string
  clipDuration: number
  onTakeAdded?: (take: FoleyTake) => void
}

export function FoleyRecorder({ clipId, clipDuration, onTakeAdded }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [syncTimecode, setSyncTimecode] = useState(0)
  const [takes, setTakes] = useState<FoleyTake[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [label, setLabel] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef(0)

  const markSync = useCallback(() => {
    // Mark the current playhead position as the sync point
    setSyncTimecode(Date.now() - startTimeRef.current)
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      startTimeRef.current = Date.now()

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const syncMs = syncTimecode || 0

        setUploading(true)
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'foley.webm')
          formData.append('clipId', clipId)
          formData.append('type', 'foley')
          formData.append('syncTimecode', String(syncMs / 1000))
          const res = await fetch('/api/audio/upload', { method: 'POST', body: formData })
          const { url } = await res.json() as { url: string }
          const newTake: FoleyTake = {
            id: `foley-${Date.now()}`,
            url,
            syncTimecode: syncMs / 1000,
            label: label || `Foley ${takes.length + 1}`,
          }
          setTakes((prev) => [...prev, newTake])
          onTakeAdded?.(newTake)
          setLabel('')
          setSyncTimecode(0)
        } finally {
          setUploading(false)
        }
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.warn("[caught] src/components/audio/FoleyRecorder.tsx:77", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError('Microphone access denied.')
    }
  }, [clipId, syncTimecode, takes.length, label, onTakeAdded])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const formatTime = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}:${String(Math.floor((sec % 1) * 24)).padStart(2, '0')}`

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/8 p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <Mic className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Foley Recorder</span>
      </div>

      {/* Frame counter */}
      <div className="bg-[#12121a] rounded-lg border border-white/6 p-2 mb-3 font-mono text-center">
        <p className="text-[9px] text-white/25 mb-0.5">Sync Point</p>
        <p className="text-lg font-bold text-[#00e5c8]">{formatTime(syncTimecode / 1000)}</p>
        <p className="text-[9px] text-white/20">of {formatTime(clipDuration)}</p>
      </div>

      {error && <p className="text-red-400 text-[9px] mb-2">{error}</p>}

      {/* Label */}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Foley label (footsteps, cloth, etc.)"
        className="w-full mb-2 px-2 py-1.5 bg-[#12121a] border border-white/10 rounded-lg text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#00e5c8]/40"
      />

      <div className="flex gap-2 mb-3">
        {!isRecording ? (
          <button
            onClick={() => void startRecording()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs hover:bg-red-500/30 disabled:opacity-40 transition"
          >
            <Mic className="w-3 h-3" /> Record
          </button>
        ) : (
          <>
            <button
              onClick={markSync}
              className="px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs hover:bg-yellow-500/30 transition"
            >
              <Crosshair className="w-3 h-3" />
            </button>
            <button
              onClick={stopRecording}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500 text-white text-xs hover:bg-red-600 transition"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          </>
        )}
      </div>

      {takes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Recorded ({takes.length})</p>
          {takes.map((take) => (
            <div key={take.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/8 text-xs text-white/50">
              <span className="flex-1 truncate text-[9px]">{take.label}</span>
              <span className="text-[9px] text-white/25">@{formatTime(take.syncTimecode)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
