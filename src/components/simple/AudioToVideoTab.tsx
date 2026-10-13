'use client'

import { useState, useCallback } from 'react'
import { Music, Sparkles, Zap, Loader2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { GeneratedClip } from './types'
import { MODEL_FAMILY_COLOURS } from './types'

interface Props {
  onGenerated: (clip: GeneratedClip) => void
  creditBalance: number
}

interface BeatAnalysis {
  bpm: number
  beats: number[]
  downbeats: number[]
}

const STYLE_PRESETS = [
  { id: 'cinematic', label: 'Cinematic', model: 'kling_pro', desc: 'Film-quality visuals' },
  { id: 'music_video', label: 'Music Video', model: 'runway', desc: 'Bold & stylised' },
  { id: 'nature', label: 'Nature', model: 'luma', desc: 'Organic scenery' },
  { id: 'abstract', label: 'Abstract', model: 'animatediff', desc: 'Surreal & artistic' },
  { id: 'urban', label: 'Urban', model: 'seedance', desc: 'City & street' },
  { id: 'documentary', label: 'Documentary', model: 'veo3', desc: 'Realistic & grounded' },
]

export function AudioToVideoTab({ onGenerated, creditBalance }: Props) {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [beats, setBeats] = useState<BeatAnalysis | null>(null)
  const [stylePreset, setStylePreset] = useState('cinematic')
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const selectedStyle = STYLE_PRESETS.find((s) => s.id === stylePreset)!

  const analyseAudio = async (file: File) => {
    setIsAnalysing(true)
    try {
      const formData = new FormData()
      formData.append('audio', file)

      // Upload audio first to get a URL
      const uploadRes = await fetch('/api/upload/audio', { method: 'POST', body: formData })
      const { url: audioUrl } = await uploadRes.json() as { url: string }

      // Detect beats
      const beatsRes = await fetch('/api/audio/beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl }),
      })
      const beatData = await beatsRes.json() as BeatAnalysis
      setBeats(beatData)
    } catch (err) {
      console.warn("[caught] src/components/simple/AudioToVideoTab.tsx:57", err instanceof Error ? { name: err.name, message: err.message } : err)

      // Beat analysis is non-fatal
    } finally {
      setIsAnalysing(false)
    }
  }

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) return
    setAudioFile(file)
    await analyseAudio(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleGenerate = async () => {
    if (!audioFile || isGenerating) return
    setIsGenerating(true)

    try {
      const formData = new FormData()
      formData.append('audio', audioFile)
      const uploadRes = await fetch('/api/upload/audio', { method: 'POST', body: formData })
      const { url: audioUrl } = await uploadRes.json() as { url: string }

      // Generate one clip per downbeat segment (up to 6 clips)
      const segments = beats?.downbeats.slice(0, 6) ?? [0]

      for (let i = 0; i < segments.length; i++) {
        const segStart = segments[i]
        const segEnd = segments[i + 1] ?? segStart + 5

        const clientId = nanoid()
        const newClip: GeneratedClip = {
          id: clientId,
          jobId: clientId,
          prompt: `${selectedStyle.label.toLowerCase()} visual at beat ${i + 1} of ${segments.length}`,
          model: selectedStyle.model,
          quality: 'standard',
          creditsUsed: 8,
          duration: segEnd - segStart,
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
              prompt: `${selectedStyle.label} visual, beat ${i + 1}, cinematic, high energy, synced to music`,
              model: selectedStyle.model,
              duration: Math.min(Math.max(segEnd - segStart, 3), 10),
              aspectRatio: '16:9',
            },
          }),
        })

        if (res.ok) {
          const { jobId } = await res.json() as { jobId: string }
          const activeClip = { ...newClip, jobId, status: 'processing' as const }
          onGenerated(activeClip)

          const sse = new EventSource(`/api/jobs/${jobId}/stream`)
          sse.onmessage = (e) => {
            const data = JSON.parse(e.data) as { status: string; progress?: number; outputUrl?: string; error?: string; message?: string; userMessage?: string }
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
        }

        // Stagger requests slightly to avoid rate limits
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      console.error('Audio-to-video error:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Audio drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('audio-input')?.click()}
        className={`
          rounded-xl border-2 border-dashed cursor-pointer transition-all py-12
          ${isDragging ? 'border-[#00e5c8] bg-[#00e5c8]/10' : 'border-white/15 hover:border-white/30 bg-white/3'}
        `}
      >
        <div className="flex flex-col items-center gap-3 text-white/40">
          <Music className="w-10 h-10" />
          {audioFile ? (
            <div className="text-center">
              <p className="text-sm font-medium text-white/70">{audioFile.name}</p>
              {isAnalysing ? (
                <div className="flex items-center justify-center gap-2 mt-2 text-[#00e5c8] text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analysing beats…
                </div>
              ) : beats ? (
                <div className="flex items-center justify-center gap-3 mt-2">
                  <div className="flex items-center gap-1 text-[#00e5c8] text-xs">
                    <Zap className="w-3 h-3" />
                    {beats.bpm} BPM
                  </div>
                  <span className="text-[10px] text-white/30">·</span>
                  <span className="text-xs text-white/40">{beats.beats.length} beats detected</span>
                </div>
              ) : null}
              <p className="text-xs text-white/30 mt-1">Click to change</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-medium">Drop audio file here</p>
              <p className="text-xs mt-1">MP3, WAV, M4A, FLAC · Beat detection included</p>
            </div>
          )}
        </div>
        <input
          id="audio-input"
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
        />
      </div>

      {/* Beat visualiser */}
      {beats && (
        <div className="bg-[#12121a] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/40 mb-3 font-medium uppercase tracking-wider">Beat Map</p>
          <div className="flex gap-0.5 h-8 items-end">
            {beats.beats.slice(0, 60).map((_, i) => {
              const isDownbeat = beats.downbeats.some((d) => Math.abs(d - beats.beats[i]) < 0.1)
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-all ${isDownbeat ? 'bg-[#00e5c8]' : 'bg-white/20'}`}
                  style={{ height: isDownbeat ? '100%' : `${30 + Math.random() * 70}%` }}
                />
              )
            })}
            {beats.beats.length > 60 && (
              <div className="flex-shrink-0 text-xs text-white/30 self-center ml-1">+{beats.beats.length - 60}</div>
            )}
          </div>
          <p className="text-[10px] text-white/25 mt-2">
            Will generate {Math.min(beats.downbeats.length, 6)} clips aligned to major beats (amber)
          </p>
        </div>
      )}

      {/* Style presets */}
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider mb-2.5 font-medium">Visual Style</p>
        <div className="grid grid-cols-3 gap-2">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStylePreset(s.id)}
              className={`
                p-3 rounded-xl border text-left transition-all
                ${stylePreset === s.id ? 'border-[#00e5c8] bg-[#00e5c8]/15' : 'border-white/8 bg-white/3 hover:border-white/20'}
              `}
            >
              <div
                className="w-5 h-1.5 rounded-full mb-2"
                style={{ backgroundColor: MODEL_FAMILY_COLOURS[s.model] ?? '#6b7280' }}
              />
              <div className={`text-xs font-semibold ${stylePreset === s.id ? 'text-[#00e5c8]' : 'text-white/80'}`}>
                {s.label}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={!audioFile || isGenerating || isAnalysing}
        className="w-full py-4 rounded-xl font-semibold bg-gradient-to-r from-teal-500 to-teal-600
          text-black shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-teal-500
          disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <><Loader2 className="w-5 h-5 animate-spin" />Generating visuals…</>
        ) : (
          <><Sparkles className="w-5 h-5" />Generate Beat-Synced Video</>
        )}
      </button>
    </div>
  )
}
