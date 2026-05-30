'use client'

import { useState } from 'react'
import { Loader2, Play, Mic } from 'lucide-react'
import { AvatarGallery } from './AvatarGallery'
import { GenerationProgress } from '@/components/simple/GenerationProgress'

interface Avatar {
  id:           string
  name:         string
  type:         string
  videoUrl:     string
  thumbnailUrl: string | null
}

export function TalkingPhotoPanel() {
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null)
  const [script,         setScript]         = useState('')
  const [voiceId,        setVoiceId]        = useState('')
  const [jobId,          setJobId]          = useState<string | null>(null)
  const [outputUrl,      setOutputUrl]      = useState<string | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [tab,            setTab]            = useState<'gallery' | 'generate'>('gallery')

  const handleGenerate = async () => {
    if (!selectedAvatar || !script.trim()) return
    setLoading(true)
    setError(null)
    setOutputUrl(null)
    try {
      const res = await fetch('/api/avatar/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          avatarId: selectedAvatar.id,
          script:   script.trim(),
          voiceId:  voiceId || undefined,
          type:     'talking_photo',
        }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setJobId(data.jobId ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[#1a1f2e]">
        {(['gallery', 'generate'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium capitalize transition ${
              tab === t
                ? 'text-[#00e5c8] border-b-2 border-[#00e5c8]'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {t === 'gallery' ? 'Pick Avatar' : 'Generate'}
          </button>
        ))}
      </div>

      {tab === 'gallery' && (
        <div className="flex-1 overflow-y-auto">
          <AvatarGallery
            onSelect={a => { setSelectedAvatar(a); setTab('generate') }}
            selected={selectedAvatar?.id}
          />
        </div>
      )}

      {tab === 'generate' && (
        <div className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">
          {selectedAvatar && (
            <div className="flex items-center gap-3 p-3 bg-[#1a1f2e] rounded-xl">
              {selectedAvatar.thumbnailUrl && (
                <img src={selectedAvatar.thumbnailUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              )}
              <div>
                <p className="text-sm text-white font-medium">{selectedAvatar.name}</p>
                <button onClick={() => setTab('gallery')} className="text-[10px] text-gray-500 hover:text-[#00e5c8]">
                  Change
                </button>
              </div>
            </div>
          )}

          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="Enter script for the avatar to speak…"
            rows={5}
            className="w-full px-3 py-2.5 rounded-lg bg-[#1a1f2e] border border-[#2a3040] text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#00e5c8]/50 resize-none"
          />

          <input
            type="text"
            placeholder="Voice ID (optional — leave blank for default)"
            value={voiceId}
            onChange={e => setVoiceId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a1f2e] border border-[#2a3040] text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#00e5c8]/50"
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}

          {jobId ? (
            <GenerationProgress
              jobId={jobId}
              onComplete={url => { setOutputUrl(url); setJobId(null); setLoading(false) }}
              onError={err => { setError(err); setJobId(null); setLoading(false) }}
            />
          ) : (
            <button
              onClick={() => void handleGenerate()}
              disabled={loading || !selectedAvatar || !script.trim()}
              className="py-2.5 bg-[#00e5c8] text-black text-sm font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#00e5c8]/90 transition"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" />Generating…</>
              ) : (
                <><Mic size={14} />Generate Talking Photo</>
              )}
            </button>
          )}

          {outputUrl && (
            <div className="rounded-xl overflow-hidden border border-[#2a3040]">
              <video src={outputUrl} controls className="w-full" />
              <div className="p-2 bg-[#1a1f2e] flex gap-2">
                <a
                  href={outputUrl}
                  download="talking-photo.mp4"
                  className="flex-1 text-center text-xs py-1.5 bg-[#00e5c8]/10 text-[#00e5c8] rounded-lg hover:bg-[#00e5c8]/20"
                >
                  Download
                </a>
                <button className="flex-1 text-xs py-1.5 bg-[#1a2030] text-gray-400 rounded-lg hover:text-white flex items-center justify-center gap-1">
                  <Play size={10} /> Add to Timeline
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600 text-center">
            Cost: 30 credits · Powered by SadTalker via fal.ai
          </p>
        </div>
      )}
    </div>
  )
}
