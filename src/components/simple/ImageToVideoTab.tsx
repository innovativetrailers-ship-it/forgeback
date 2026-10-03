'use client'

import { useState, useCallback } from 'react'
import { Upload, ImageIcon, Sparkles } from 'lucide-react'
import { nanoid } from 'nanoid'
import { QUALITY_PILLS } from './types'
import type { QualityTier, GeneratedClip } from './types'

interface Props {
  onGenerated: (clip: GeneratedClip) => void
  creditBalance: number
}

export function ImageToVideoTab({ onGenerated, creditBalance }: Props) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [motionStrength, setMotionStrength] = useState(50)
  const [quality, setQuality] = useState<QualityTier>('standard')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const selectedPill = QUALITY_PILLS.find((p) => p.id === quality)!

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleGenerate = async () => {
    if (!imageFile || isLoading) return
    setIsLoading(true)

    const formData = new FormData()
    formData.append('image', imageFile)

    try {
      // Upload image first
      const uploadRes = await fetch('/api/upload/image', { method: 'POST', body: formData })
      const { url: imageUrl } = await uploadRes.json() as { url: string }

      const clientId = nanoid()
      const newClip: GeneratedClip = {
        id: clientId,
        jobId: clientId,
        prompt: prompt || 'Animate this image naturally',
        model: selectedPill.model,
        quality,
        creditsUsed: selectedPill.credits,
        duration: 5,
        aspectRatio: '16:9',
        status: 'queued',
        progress: 0,
        createdAt: new Date(),
      }
      onGenerated(newClip)

      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GENERATE',
          payload: {
            prompt: prompt || 'Animate this image with natural motion',
            model: selectedPill.model,
            startFrameUrl: imageUrl,
            duration: 5,
            motionStrength: motionStrength / 100,
            quality,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        onGenerated({ ...newClip, status: 'failed', error: err.error ?? 'Job creation failed' })
        return
      }

      const { jobId } = await res.json() as { jobId: string }
      const activeClip = { ...newClip, jobId, status: 'processing' as const }
      onGenerated(activeClip)

      const sse = new EventSource(`/api/jobs/${jobId}/stream`)
      sse.onmessage = (e) => {
        const data = JSON.parse(e.data) as { status: string; progress?: number; message?: string; outputUrl?: string; error?: string; userMessage?: string }
        if (data.status === 'complete' && data.outputUrl) {
          onGenerated({ ...activeClip, status: 'complete', videoUrl: data.outputUrl, progress: 100 })
          sse.close()
        } else if (data.status === 'failed') {
          onGenerated({ ...activeClip, status: 'failed', error: data.userMessage ?? data.error ?? 'Failed', userMessage: data.userMessage })
          sse.close()
        } else {
          onGenerated({ ...activeClip, status: 'processing', progress: data.progress, progressMessage: data.userMessage ?? data.message, userMessage: data.userMessage })
        }
      }
      sse.onerror = () => {} // transient — allow EventSource auto-reconnect
    } catch (err) {
      console.warn("[caught] src/components/simple/ImageToVideoTab.tsx:108", err instanceof Error ? { name: err.name, message: err.message } : err)

      onGenerated({ id: nanoid(), jobId: nanoid(), prompt, model: selectedPill.model, quality, creditsUsed: selectedPill.credits, duration: 5, aspectRatio: '16:9', status: 'failed', error: (err as Error).message, createdAt: new Date() })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('img2vid-input')?.click()}
        className={`
          relative rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden
          ${isDragging ? 'border-[#00e5c8] bg-[#00e5c8]/10' : 'border-white/15 hover:border-white/30 bg-white/3'}
          ${imagePreview ? 'aspect-video' : 'py-16'}
        `}
      >
        {imagePreview ? (
          <>
            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <p className="text-white text-sm font-medium">Click to change image</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/40">
            <ImageIcon className="w-10 h-10" />
            <div className="text-center">
              <p className="text-sm font-medium">Drop image here</p>
              <p className="text-xs mt-1">or click to browse · JPG, PNG, WEBP · max 20MB</p>
            </div>
          </div>
        )}
        <input
          id="img2vid-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
        />
      </div>

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the motion... (optional) e.g. slow dolly forward, gentle breeze, clouds rolling in..."
        className="w-full h-20 bg-[#12121a] border border-white/10 rounded-xl px-4 py-3
          text-white/90 placeholder:text-white/25 text-sm resize-none
          focus:outline-none focus:border-[#00e5c8]/50 transition-colors"
      />

      {/* Motion strength */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Motion Strength</p>
          <span className="text-xs text-[#00e5c8] font-medium">{motionStrength}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={motionStrength}
          onChange={(e) => setMotionStrength(Number(e.target.value))}
          className="w-full accent-[#00e5c8]"
        />
        <div className="flex justify-between text-[10px] text-white/20 mt-1">
          <span>Subtle</span>
          <span>Dynamic</span>
        </div>
      </div>

      {/* Quality */}
      <div className="grid grid-cols-4 gap-2">
        {QUALITY_PILLS.map((pill) => (
          <button
            key={pill.id}
            onClick={() => setQuality(pill.id)}
            disabled={pill.credits > creditBalance}
            className={`
              p-2.5 rounded-xl border text-left transition-all text-xs
              ${quality === pill.id ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]' : 'border-white/8 bg-white/3 text-white/50 hover:border-white/20'}
              disabled:opacity-30 disabled:cursor-not-allowed
            `}
          >
            <div className="font-medium">{pill.label}</div>
            <div className="text-[10px] text-[#00e5c8]/70 mt-0.5">⬡ {pill.credits}</div>
          </button>
        ))}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!imageFile || isLoading || selectedPill.credits > creditBalance}
        className="w-full py-4 rounded-xl font-semibold bg-gradient-to-r from-teal-500 to-teal-600
          text-black shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-teal-500
          disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <><div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />Animating…</>
        ) : (
          <><Sparkles className="w-5 h-5" />Animate Image · ⬡ {selectedPill.credits}</>
        )}
      </button>
    </div>
  )
}
