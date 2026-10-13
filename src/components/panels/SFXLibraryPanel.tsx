'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Search, ChevronDown } from 'lucide-react'

interface SFXAsset {
  id: string
  name: string
  category: string
  url: string
  previewUrl: string | null
  blendMode: string
  tags: string[]
}

const CATEGORIES = ['all', 'fire', 'smoke', 'vfx', 'magic', 'weather', 'sci-fi', 'lens']

export function SFXLibraryPanel() {
  const [assets, setAssets] = useState<SFXAsset[]>([])
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (category !== 'all') params.set('category', category)
      if (search) params.set('q', search)
      const res = await fetch(`/api/sfx/assets?${params}`)
      const data = await res.json() as { assets: SFXAsset[] }
      setAssets(data.assets)
    } finally {
      setLoading(false)
    }
  }, [category, search])

  useEffect(() => { void fetchAssets() }, [fetchAssets])

  const handleDragStart = useCallback((e: React.DragEvent, asset: SFXAsset) => {
    e.dataTransfer.setData('application/sfx-asset', JSON.stringify(asset))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8">
        <Zap className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">SFX Library</span>
      </div>

      {/* Search */}
      <div className="px-3 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search effects…"
            className="w-full pl-6 pr-2 py-1.5 bg-[#12121a] border border-white/10 rounded-lg text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#00e5c8]/40"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="px-3 pb-2 flex gap-1 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 px-2 py-0.5 rounded text-[9px] capitalize border transition ${
              category === cat
                ? 'border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]'
                : 'border-white/8 text-white/30 hover:border-white/20'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 border border-[#00e5c8]/30 border-t-[#00e5c8] rounded-full animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <p className="text-center text-white/20 text-xs mt-8">No effects found</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => handleDragStart(e, asset)}
                onMouseEnter={() => setHoveredId(asset.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative rounded-lg border border-white/8 bg-[#12121a] overflow-hidden cursor-grab active:cursor-grabbing hover:border-white/20 transition group"
              >
                {/* Preview */}
                <div className="aspect-video bg-[#0a0a0f] flex items-center justify-center">
                  {asset.previewUrl ? (
                    <video
                      src={hoveredId === asset.id ? asset.previewUrl : undefined}
                      autoPlay={hoveredId === asset.id}
                      muted loop
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Zap className="w-6 h-6 text-white/10" />
                  )}
                </div>

                {/* Info */}
                <div className="px-2 py-1.5">
                  <p className="text-[9px] font-medium text-white/60 truncate">{asset.name}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[8px] text-white/25 capitalize">{asset.category}</span>
                    <span className="text-[8px] text-white/20">{asset.blendMode}</span>
                  </div>
                </div>

                {/* Drag hint */}
                <div className="absolute inset-0 flex items-center justify-center bg-[#00e5c8]/5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-[#00e5c8]/60 rotate-90" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 pb-3">
        <p className="text-[8px] text-white/15 text-center">
          Drag any asset onto a clip in the timeline
        </p>
      </div>
    </div>
  )
}
