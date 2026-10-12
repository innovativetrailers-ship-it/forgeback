'use client'

import { useState, useEffect, useCallback } from 'react'
import { Film, Search, Play, Plus, Sparkles } from 'lucide-react'

interface MoGRTTemplate {
  id: string
  name: string
  category: string
  previewUrl: string | null
  tags: string[]
  duration: number
  editableFields: string[]
}

const CATEGORIES = ['all', 'lower thirds', 'title cards', 'transitions', 'social overlays', 'end screens']

const BUILT_IN_TEMPLATES: MoGRTTemplate[] = [
  { id: 'lt-001', name: 'Clean Lower Third',     category: 'lower thirds',    previewUrl: null, tags: ['lower-third', 'clean'],     duration: 3,  editableFields: ['name', 'title', 'color'] },
  { id: 'lt-002', name: 'Teal Gradient Lower',   category: 'lower thirds',    previewUrl: null, tags: ['lower-third', 'gradient'],  duration: 3,  editableFields: ['name', 'title'] },
  { id: 'lt-003', name: 'Breaking News Bar',      category: 'lower thirds',    previewUrl: null, tags: ['news', 'breaking'],         duration: 5,  editableFields: ['headline', 'ticker'] },
  { id: 'tc-001', name: 'Cinematic Title',        category: 'title cards',     previewUrl: null, tags: ['title', 'cinematic'],       duration: 4,  editableFields: ['title', 'subtitle'] },
  { id: 'tc-002', name: 'Film Slate Opener',      category: 'title cards',     previewUrl: null, tags: ['title', 'slate'],           duration: 5,  editableFields: ['title', 'date', 'scene'] },
  { id: 'tc-003', name: 'Minimal Title Card',     category: 'title cards',     previewUrl: null, tags: ['title', 'minimal'],         duration: 4,  editableFields: ['title'] },
  { id: 'tr-001', name: 'Whip Pan Transition',    category: 'transitions',     previewUrl: null, tags: ['transition', 'motion'],     duration: 0.5, editableFields: [] },
  { id: 'tr-002', name: 'Glitch Cut',             category: 'transitions',     previewUrl: null, tags: ['transition', 'glitch'],     duration: 0.3, editableFields: ['intensity'] },
  { id: 'tr-003', name: 'Film Burn',              category: 'transitions',     previewUrl: null, tags: ['transition', 'film'],       duration: 1.5, editableFields: ['color'] },
  { id: 'so-001', name: 'Instagram Story Frame',  category: 'social overlays', previewUrl: null, tags: ['social', 'instagram'],     duration: 0,  editableFields: ['username', 'color'] },
  { id: 'so-002', name: 'Social like animation',  category: 'social overlays', previewUrl: null, tags: ['social'],        duration: 2,  editableFields: [] },
  { id: 'es-001', name: 'Subscribe Endscreen',    category: 'end screens',     previewUrl: null, tags: ['endscreen', 'subscribe'],  duration: 20, editableFields: ['channel', 'color'] },
]

export function MoGRTPanel() {
  const [templates, setTemplates] = useState<MoGRTTemplate[]>(BUILT_IN_TEMPLATES)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = templates.filter((t) => {
    const matchCat = category === 'all' || t.category === category
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchSearch
  })

  const handleGenerateAI = useCallback(async () => {
    if (!aiPrompt.trim()) return
    setAiGenerating(true)
    try {
      const res = await fetch('/api/mogrt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const data = await res.json() as { template: MoGRTTemplate }
      if (data.template) setTemplates((prev) => [data.template, ...prev])
      setAiPrompt('')
    } finally {
      setAiGenerating(false)
    }
  }, [aiPrompt])

  const handleDragStart = useCallback((e: React.DragEvent, template: MoGRTTemplate) => {
    e.dataTransfer.setData('application/mogrt', JSON.stringify(template))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleAddToTimeline = useCallback(async (template: MoGRTTemplate) => {
    setLoading(true)
    try {
      await fetch('/api/mogrt/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8">
        <Film className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex-1">Motion Graphics</span>
        <span className="text-[9px] text-white/25">{filtered.length}</span>
      </div>

      {/* AI Generate */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex gap-1">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe a template…"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleGenerateAI() }}
            className="flex-1 px-2 py-1.5 bg-[#12121a] border border-white/10 rounded-lg text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#00e5c8]/40"
          />
          <button
            onClick={() => void handleGenerateAI()}
            disabled={!aiPrompt.trim() || aiGenerating}
            className="px-2.5 py-1.5 rounded-lg bg-[#00e5c8]/15 border border-[#00e5c8]/30 text-[#00e5c8] hover:bg-[#00e5c8]/25 disabled:opacity-40 transition"
          >
            {aiGenerating
              ? <div className="w-3 h-3 border border-[#00e5c8]/30 border-t-[#00e5c8] rounded-full animate-spin" />
              : <Sparkles className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full pl-6 pr-2 py-1.5 bg-[#12121a] border border-white/10 rounded-lg text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#00e5c8]/40"
          />
        </div>
      </div>

      {/* Categories */}
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
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((template) => (
            <div
              key={template.id}
              draggable
              onDragStart={(e) => handleDragStart(e, template)}
              onMouseEnter={() => setHoveredId(template.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="rounded-lg border border-white/8 bg-[#12121a] overflow-hidden cursor-grab active:cursor-grabbing hover:border-white/20 transition group"
            >
              {/* Preview area */}
              <div className="aspect-video bg-[#0a0a0f] flex items-center justify-center relative">
                {template.previewUrl && hoveredId === template.id ? (
                  <video src={template.previewUrl} autoPlay muted loop className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-5 h-5 text-white/10" />
                )}
                <div className="absolute bottom-1 right-1 text-[8px] text-white/30 bg-black/50 px-1 rounded">
                  {template.duration > 0 ? `${template.duration}s` : 'static'}
                </div>
              </div>

              {/* Info + actions */}
              <div className="px-2 py-1.5">
                <p className="text-[9px] font-medium text-white/60 truncate">{template.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[8px] text-white/20 truncate">{template.category}</span>
                  <button
                    onClick={() => void handleAddToTimeline(template)}
                    disabled={loading}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#00e5c8]/10 border border-[#00e5c8]/20 text-[#00e5c8] text-[8px] hover:bg-[#00e5c8]/20 disabled:opacity-40 transition"
                  >
                    <Plus className="w-2.5 h-2.5" /> Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
