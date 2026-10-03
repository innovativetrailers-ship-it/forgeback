'use client'
import { useState } from 'react'

function JobProgress({ jobId }: { jobId: string }) {
  return (
    <div className="text-xs text-[#00e5c8] mt-2 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#00e5c8] animate-pulse" />
      Generating… Job ID: {jobId.slice(0, 8)}
    </div>
  )
}

export function TalkingPhotoPanel() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [script, setScript] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
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
      console.warn("[caught] src/components/avatar/TalkingPhotoPanel.tsx:30", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleGenerate = async () => {
    if (!photoUrl || !script.trim()) return
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/avatar/talking-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl, script }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok || !data.jobId) throw new Error(data.error ?? 'Generation failed')
      setJobId(data.jobId)
    } catch (err) {
      console.warn("[caught] src/components/avatar/TalkingPhotoPanel.tsx:50", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Talking Photo</h3>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      <div
        className="border-2 border-dashed border-[#2a3040] rounded-xl p-4 text-center cursor-pointer hover:border-[#00e5c8]/50 transition"
        onClick={() => document.getElementById('talking-photo-input')?.click()}
      >
        {isUploading ? (
          <div className="text-[#00e5c8] text-sm">Uploading…</div>
        ) : photoUrl ? (
          <img src={photoUrl} alt="Talking photo" className="w-20 h-20 rounded-full mx-auto object-cover" />
        ) : (
          <div className="text-gray-500 text-sm">Upload a photo</div>
        )}
        <input
          id="talking-photo-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePhotoUpload(file)
          }}
        />
      </div>

      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="What should they say?"
        rows={3}
        className="bg-[#0d1117] border border-[#2a3040] rounded-lg p-2.5 text-sm text-white placeholder-gray-500 resize-none focus:border-[#00e5c8] focus:outline-none"
      />

      <button
        onClick={handleGenerate}
        disabled={!photoUrl || !script.trim() || isGenerating || isUploading}
        className="py-2 bg-[#00e5c8] text-black font-semibold rounded-lg text-sm disabled:opacity-40 hover:bg-[#00e5c8]/90 transition"
      >
        {isGenerating ? 'Generating…' : 'Generate'}
      </button>

      {jobId && <JobProgress jobId={jobId} />}
    </div>
  )
}
