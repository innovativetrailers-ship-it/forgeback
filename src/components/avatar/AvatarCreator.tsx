'use client'
import { useState } from 'react'

interface AvatarCreatorProps {
  onCreated: () => void
}

export function AvatarCreator({ onCreated }: AvatarCreatorProps) {
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: form })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload failed')
      setPhotoUrl(data.url)
    } catch (err) {
      console.warn("[caught] src/components/avatar/AvatarCreator.tsx:25", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleCreate = async () => {
    if (!name || !photoUrl) return
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/avatar/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, photoUrl, voiceId }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to create avatar')
      }
      onCreated()
    } catch (err) {
      console.warn("[caught] src/components/avatar/AvatarCreator.tsx:47", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <h3 className="text-white font-semibold">Create Avatar</h3>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      <div
        className="border-2 border-dashed border-[#2a3040] rounded-xl p-6 text-center cursor-pointer hover:border-[#00e5c8]/50 transition"
        onClick={() => document.getElementById('avatar-photo-input')?.click()}
      >
        {isUploading ? (
          <div className="text-[#00e5c8] text-sm">Uploading…</div>
        ) : photoUrl ? (
          <img src={photoUrl} alt="Avatar" className="w-24 h-24 rounded-full mx-auto object-cover" />
        ) : (
          <div className="text-gray-500 text-sm">Click to upload a clear photo</div>
        )}
        <input
          id="avatar-photo-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePhotoUpload(file)
          }}
        />
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Avatar name"
        className="bg-[#0d1117] border border-[#2a3040] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-[#00e5c8] focus:outline-none"
      />

      <input
        value={voiceId}
        onChange={(e) => setVoiceId(e.target.value)}
        placeholder="ElevenLabs Voice ID (optional)"
        className="bg-[#0d1117] border border-[#2a3040] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-[#00e5c8] focus:outline-none"
      />

      <button
        onClick={handleCreate}
        disabled={!name || !photoUrl || isCreating || isUploading}
        className="py-2.5 bg-[#00e5c8] text-black font-semibold rounded-lg disabled:opacity-40 hover:bg-[#00e5c8]/90 transition"
      >
        {isCreating ? 'Creating…' : 'Create Avatar'}
      </button>
    </div>
  )
}
