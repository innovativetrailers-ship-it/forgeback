'use client'

import { useState, useCallback } from 'react'
import { ImageIcon, Film, X, Loader2, Sparkles, Music, Hash } from 'lucide-react'
import type { TimelineRecipe } from '@/lib/timeline/schema'

interface AutoSocialResult {
  recipe: TimelineRecipe
  plan: {
    narrative: string
    captionSuggestion: string
    hashtagSuggestions: string[]
    musicUrl: string | null
  }
}

interface AssetItem {
  file: File
  preview: string
  type: 'image' | 'video'
}

const PLATFORM_OPTIONS = [
  { id: 'tiktok', label: 'TikTok', icon: '♪', color: '#ee1d52' },
  { id: 'instagram', label: 'Instagram', icon: '◻', color: '#e1306c' },
  { id: 'youtube', label: 'YouTube', icon: '▶', color: '#ff0000' },
  { id: 'general', label: 'General', icon: '◈', color: '#6b7280' },
] as const

type Platform = typeof PLATFORM_OPTIONS[number]['id']

interface Props {
  onRecipeReady: (result: AutoSocialResult) => void
}

export function AutoSocialTab({ onRecipeReady }: Props) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [platform, setPlatform] = useState<Platform>('general')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<AutoSocialResult | null>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    const newAssets: AssetItem[] = []
    for (const file of Array.from(files)) {
      if (assets.length + newAssets.length >= 30) break
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isVideo && !isImage) continue

      const preview = URL.createObjectURL(file)
      newAssets.push({ file, preview, type: isVideo ? 'video' : 'image' })
    }
    setAssets((prev) => [...prev, ...newAssets].slice(0, 30))
  }, [assets.length])

  const removeAsset = (idx: number) => {
    setAssets((prev) => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleGenerate = async () => {
    if (assets.length === 0 || isGenerating) return
    setIsGenerating(true)
    setProgress('Uploading assets…')

    try {
      // Upload all assets
      const assetUrls: string[] = []
      for (let i = 0; i < assets.length; i++) {
        setProgress(`Uploading asset ${i + 1}/${assets.length}…`)
        const formData = new FormData()
        const endpoint = assets[i].type === 'video' ? '/api/upload/video' : '/api/upload/image'
        formData.append(assets[i].type, assets[i].file)
        const res = await fetch(endpoint, { method: 'POST', body: formData })
        const { url } = await res.json() as { url: string }
        assetUrls.push(url)
      }

      setProgress('Analysing content with AI…')

      const res = await fetch('/api/auto-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetUrls,
          projectId: 'default',
          targetPlatform: platform,
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Generation failed')
      }

      const data = await res.json() as AutoSocialResult
      setResult(data)
      onRecipeReady(data)
      setProgress('')
    } catch (err) {
      console.warn("[caught] src/components/simple/AutoSocialTab.tsx:110", err instanceof Error ? { name: err.name, message: err.message } : err)

      setProgress(`Error: ${(err as Error).message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      {assets.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('social-input')?.click()}
          className={`
            rounded-xl border-2 border-dashed cursor-pointer transition-all py-20 text-center
            ${isDragging ? 'border-[#00e5c8] bg-[#00e5c8]/8' : 'border-white/15 hover:border-white/30 bg-white/2'}
          `}
        >
          <div className="flex flex-col items-center gap-3 text-white/40">
            <div className="flex gap-3">
              <ImageIcon className="w-8 h-8" />
              <Film className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-medium text-white/60">Drop up to 30 photos or videos here</p>
              <p className="text-sm mt-1">Supports JPG, PNG, MP4, MOV, WEBM</p>
            </div>
            <div className="mt-2 px-5 py-2.5 rounded-xl bg-[#00e5c8]/15 text-[#00e5c8] text-sm font-medium
              border border-[#00e5c8]/30 hover:bg-[#00e5c8]/25 transition-colors">
              Browse files
            </div>
          </div>
          <input
            id="social-input"
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files) }}
          />
        </div>
      ) : (
        <>
          {/* Asset grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs text-white/40 font-medium uppercase tracking-wider">
                {assets.length} asset{assets.length !== 1 ? 's' : ''} selected
              </p>
              <button
                onClick={() => document.getElementById('social-input')?.click()}
                className="text-xs text-[#00e5c8] hover:text-[#00b8a0] transition-colors"
              >
                + Add more
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {assets.map((asset, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden group">
                  {asset.type === 'image' ? (
                    <img src={asset.preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={asset.preview} className="w-full h-full object-cover" />
                  )}
                  {asset.type === 'video' && (
                    <div className="absolute top-1 left-1 bg-black/60 rounded px-1 py-0.5 text-[9px] text-white">
                      VID
                    </div>
                  )}
                  <button
                    onClick={() => removeAsset(i)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white
                      opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {assets.length < 30 && (
                <button
                  onClick={() => document.getElementById('social-input')?.click()}
                  className="aspect-square rounded-lg border border-dashed border-white/15 flex items-center
                    justify-center text-white/30 hover:border-white/30 hover:text-white/50 transition-colors text-xl"
                >
                  +
                </button>
              )}
            </div>
            <input
              id="social-input"
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files) }}
            />
          </div>

          {/* Platform */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2.5 font-medium">Target Platform</p>
            <div className="grid grid-cols-4 gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`
                    py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center
                    ${platform === p.id ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]' : 'border-white/8 bg-white/3 text-white/50 hover:border-white/20'}
                  `}
                >
                  <span className="text-base block mb-1">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Generate button */}
      {assets.length > 0 && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-4 rounded-xl font-semibold bg-gradient-to-r from-teal-500 to-teal-600
            text-black shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-teal-500
            disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <><Loader2 className="w-5 h-5 animate-spin" />{progress}</>
          ) : (
            <><Sparkles className="w-5 h-5" />Generate Content · {assets.length} assets</>
          )}
        </button>
      )}

      {/* Result */}
      {result && (
        <div className="bg-[#12121a] rounded-xl p-5 border border-[#00e5c8]/20 space-y-4">
          <div className="flex items-center gap-2 text-[#00e5c8]">
            <Sparkles className="w-4 h-4" />
            <span className="font-semibold text-sm">Edit Ready</span>
          </div>

          <div>
            <p className="text-xs text-white/40 mb-1.5">Narrative</p>
            <p className="text-sm text-white/80 leading-relaxed">{result.plan.narrative}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1.5">
                <Hash className="w-3 h-3" />
                Caption
              </div>
              <p className="text-xs text-white/60 italic">"{result.plan.captionSuggestion}"</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1.5">
                <Hash className="w-3 h-3" />
                Hashtags
              </div>
              <div className="flex flex-wrap gap-1">
                {result.plan.hashtagSuggestions.slice(0, 6).map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-[#00e5c8]/10 text-[#00e5c8] text-[10px]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {result.plan.musicUrl && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1.5">
                <Music className="w-3 h-3" />
                Generated music
              </div>
              <audio controls src={result.plan.musicUrl} className="w-full h-8" />
            </div>
          )}

          <div className="text-xs text-white/30">
            {result.recipe.tracks[0]?.clips.length ?? 0} clips · {result.recipe.durationSeconds}s
          </div>
        </div>
      )}
    </div>
  )
}
