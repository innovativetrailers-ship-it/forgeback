'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'done'

interface ChunkStatus { index: number; state: 'uploading' | 'done' | 'error' }

function formatDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function detectMimeType(): string {
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  if (typeof MediaRecorder === 'undefined') return 'video/webm'
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return 'video/webm'
}

export default function CameraPage() {
  const params = useParams<{ sessionId: string }>()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId
  const userId = searchParams.get('uid') ?? ''

  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkIndexRef = useRef(0)

  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [chunks, setChunks] = useState<ChunkStatus[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (recordingState !== 'recording') return
    const id = setInterval(() => setElapsed((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [recordingState])

  const uploadChunk = useCallback(async (blob: Blob, index: number) => {
    setChunks((prev) => [...prev, { index, state: 'uploading' }])
    try {
      const res = await fetch(`/api/camera/ingest/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'video/webm',
          'x-user-id': userId,
          'x-chunk-index': String(index),
        },
        body: blob,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setChunks((prev) => prev.map((c) => c.index === index ? { ...c, state: 'done' } : c))
    } catch (err) {
      console.warn("[caught] src/app/camera/[sessionId]/page.tsx:62", err instanceof Error ? { name: err.name, message: err.message } : err)

      setChunks((prev) => prev.map((c) => c.index === index ? { ...c, state: 'error' } : c))
    }
  }, [sessionId, userId])

  const startRecording = useCallback(async () => {
    setRecordingState('requesting')
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true }

      const mimeType = detectMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          const idx = chunkIndexRef.current++
          uploadChunk(e.data, idx)
        }
      }

      recorder.start(5000)
      setElapsed(0)
      chunkIndexRef.current = 0
      setChunks([])
      setRecordingState('recording')
    } catch (e: unknown) {
      console.warn("[caught] src/app/camera/[sessionId]/page.tsx:94", e instanceof Error ? { name: e.name, message: e.message } : e)

      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setPermissionDenied(true)
      } else {
        setError(e instanceof Error ? e.message : 'Camera error')
      }
      setRecordingState('idle')
    }
  }, [uploadChunk])

  const stopRecording = useCallback(async () => {
    setRecordingState('stopping')
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())

    if (!userId || !sessionId) { setRecordingState('done'); return }

    try {
      await fetch(`/api/camera/session/${sessionId}/stop`, {
        method: 'POST',
        headers: { 'x-user-id': userId },
      })
    } catch (err) {
      console.warn("[caught] src/app/camera/[sessionId]/page.tsx:116", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    setRecordingState('done')
  }, [userId, sessionId])

  if (permissionDenied) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-8">
        <div className="text-4xl">📷</div>
        <h1 className="text-white text-xl font-semibold">Camera Access Required</h1>
        <p className="text-white/50 text-sm text-center">Please allow camera access in your device settings to use wireless recording.</p>
        <a href="App-Prefs:Privacy&path=CAMERA" className="text-[#00e5c8] text-sm underline">Open Settings</a>
      </div>
    )
  }

  const doneChunks = chunks.filter((c) => c.state === 'done').length

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Video preview */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 pt-12">
          {recordingState === 'recording' && (
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur rounded-full px-3 py-1.5">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-sm font-mono">{formatDuration(elapsed)}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 bg-black/50 backdrop-blur rounded-full px-3 py-1.5">
            <span className="text-white/60 text-xs">{doneChunks} chunks synced</span>
          </div>
        </div>

        {/* Center controls */}
        <div className="flex-1 flex items-end justify-center pb-16">
          {recordingState === 'idle' && (
            <button onClick={startRecording}
              className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur flex items-center justify-center active:scale-95 transition-transform">
              <div className="w-14 h-14 rounded-full bg-red-500" />
            </button>
          )}
          {recordingState === 'recording' && (
            <button onClick={stopRecording}
              className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur flex items-center justify-center active:scale-95 transition-transform">
              <div className="w-8 h-8 bg-white rounded" />
            </button>
          )}
          {(recordingState === 'stopping' || recordingState === 'requesting') && (
            <div className="w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {recordingState === 'done' && (
            <div className="text-center">
              <div className="text-4xl mb-2">✓</div>
              <p className="text-white text-lg font-semibold">Recording Complete</p>
              <p className="text-white/50 text-sm">{doneChunks} clips synced to editor</p>
            </div>
          )}
        </div>

        {error && (
          <div className="absolute bottom-4 left-4 right-4 bg-red-500/20 border border-red-500/40 rounded-xl p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
