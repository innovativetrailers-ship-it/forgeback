'use client'

import { useState, useRef } from 'react'
import { Upload, Camera, Loader2 } from 'lucide-react'

type Style = 'realistic' | 'anime' | 'cartoon'

const STYLES: { id: Style; label: string }[] = [
  { id: 'realistic', label: 'Realistic' },
  { id: 'anime',     label: 'Anime' },
  { id: 'cartoon',   label: 'Cartoon' },
]

interface Props {
  onCreated?: (avatarId: string, avatarUrl: string) => void
}

export function AvatarCreator({ onCreated }: Props) {
  const [name,      setName]      = useState('')
  const [style,     setStyle]     = useState<Style>('realistic')
  const [imageUrl,  setImageUrl]  = useState<string | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [created,   setCreated]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setPreview(dataUrl)
      // Upload to R2 via existing upload endpoint
      void uploadImage(file)
    }
    reader.readAsDataURL(file)
  }

  const uploadImage = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (res.ok) {
      const { url } = await res.json() as { url: string }
      setImageUrl(url)
    }
  }

  const handleCreate = async () => {
    if (!imageUrl || !name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/avatar/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageUrl, name: name.trim(), style }),
      })
      const data = await res.json() as { avatarUrl?: string; avatar?: { id: string }; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Avatar creation failed')
      setCreated(data.avatarUrl ?? '')
      onCreated?.(data.avatar?.id ?? '', data.avatarUrl ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  if (created) {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <img src={created} alt="Avatar" className="w-32 h-32 rounded-full object-cover border-2 border-[#00e5c8]" />
        <p className="text-[#00e5c8] text-sm font-semibold">Avatar created!</p>
        <button
          onClick={() => { setCreated(null); setPreview(null); setImageUrl(null); setName('') }}
          className="text-xs text-gray-500 hover:text-white"
        >
          Create another
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-white font-semibold text-sm">Create Avatar</h3>

      {/* Photo upload */}
      <div
        onClick={() => fileRef.current?.click()}
        className="relative h-32 rounded-xl border-2 border-dashed border-[#2a3040] hover:border-[#00e5c8]/50 flex items-center justify-center cursor-pointer overflow-hidden"
      >
        {preview ? (
          <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Camera size={24} />
            <span className="text-xs">Upload portrait photo</span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Name */}
      <input
        type="text"
        placeholder="Avatar name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="px-3 py-2 rounded-lg bg-[#1a1f2e] border border-[#2a3040] text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#00e5c8]/50"
      />

      {/* Style */}
      <div className="flex gap-2">
        {STYLES.map(s => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`flex-1 py-1.5 text-xs rounded border transition ${
              style === s.id
                ? 'border-[#00e5c8] text-[#00e5c8] bg-[#00e5c8]/10'
                : 'border-[#2a3040] text-gray-400 hover:border-[#3a4050]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={() => void handleCreate()}
        disabled={loading || !imageUrl || !name.trim()}
        className="py-2.5 bg-[#00e5c8] text-black text-sm font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#00e5c8]/90 transition"
      >
        {loading ? <><Loader2 size={14} className="animate-spin" />Creating…</> : <><Upload size={14} />Create Avatar</>}
      </button>
      <p className="text-xs text-gray-600 text-center">Cost: 20 credits</p>
    </div>
  )
}
