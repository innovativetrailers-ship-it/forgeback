'use client'

import { useRef, useState } from 'react'
import { ensureEditorProject } from '@/lib/projects/loadProject'
import { usePlaybackStore } from '@/store/playbackStore'

export function ImportClipButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const durationSec = await readDuration(file)
      const { projectId } = await ensureEditorProject()
      const body = new FormData()
      body.set('video', file)
      body.set('projectId', projectId)
      const res = await fetch('/api/upload/video', { method: 'POST', credentials: 'include', body })
      const data = await res.json() as { error?: string; id?: string; mediaPath?: string; folderId?: string | null }
      if (!res.ok || !data.id || !data.mediaPath) throw new Error(data.error ?? 'Import failed')
      usePlaybackStore.getState().upsertLibrary({
        id: data.id,
        jobId: data.id,
        prompt: file.name,
        videoUrl: data.mediaPath,
        model: 'import',
        quality: 'standard',
        creditsUsed: 0,
        duration: durationSec,
        aspectRatio: '16:9',
        status: 'complete',
        createdAt: new Date(),
        folderId: data.folderId,
        libraryKind: 'imported',
        mediaId: data.id,
        label: file.name,
      })
    } catch (err) {
      console.warn('[import]', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="text-[10px] text-[#00e5c8] disabled:opacity-40"
      >
        {busy ? 'Importing…' : 'Import video'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onFile(file)
          event.target.value = ''
        }}
      />
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  )
}

function readDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5
      URL.revokeObjectURL(url)
      resolve(duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(5)
    }
    video.src = url
  })
}
