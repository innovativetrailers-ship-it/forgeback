'use client'

import { useState, useCallback } from 'react'
import { randomUUID } from 'crypto'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useUIStore } from '@/store/ui'
import type { ProductTag } from '@/lib/commerce/ShoppableExport'

interface DraftTag {
  timestamp: string
  productName: string
  productPrice: string
  productImageUrl: string
  productPageUrl: string
  hotspotX: string
  hotspotY: string
}

const EMPTY_DRAFT: DraftTag = {
  timestamp: '', productName: '', productPrice: '',
  productImageUrl: '', productPageUrl: '', hotspotX: '0.5', hotspotY: '0.3',
}

interface EmbedResult { embedId: string; shareUrl: string; html: string }

export function ShoppableTagPanel() {
  const recipe = useEditorRecipeView()
  const addToast = useUIStore((s) => s.addToast)

  const [videoUrl, setVideoUrl] = useState('')
  const [tags, setTags] = useState<ProductTag[]>([])
  const [draft, setDraft] = useState<DraftTag>(EMPTY_DRAFT)
  const [formOpen, setFormOpen] = useState(false)
  const [embedResult, setEmbedResult] = useState<EmbedResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddTag = useCallback(() => {
    const timestamp = parseFloat(draft.timestamp)
    const price = Math.round(parseFloat(draft.productPrice) * 100)

    if (isNaN(timestamp) || !draft.productName.trim() || isNaN(price) || !draft.productPageUrl.trim()) {
      setError('All fields required: timestamp, name, price, product URL')
      return
    }

    const tag: ProductTag = {
      id: `tag_${Date.now()}`,
      timestamp,
      duration: 3,
      productId: `manual_${timestamp}`,
      productName: draft.productName.trim(),
      productPrice: price,
      productImageUrl: draft.productImageUrl.trim(),
      productPageUrl: draft.productPageUrl.trim(),
      variants: [],
      hotspot: { x: parseFloat(draft.hotspotX) || 0.5, y: parseFloat(draft.hotspotY) || 0.3 },
      platform: 'manual',
    }

    setTags((prev) => [...prev, tag].sort((a, b) => a.timestamp - b.timestamp))
    setDraft(EMPTY_DRAFT)
    setFormOpen(false)
    setError(null)
  }, [draft])

  const handleGenerateEmbed = useCallback(async () => {
    if (!videoUrl.trim()) { setError('Video URL is required'); return }
    if (!recipe?.projectId) { setError('No project loaded'); return }
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/commerce/shoppable/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: recipe.projectId, videoUrl: videoUrl.trim(), tags }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`); return }
      setEmbedResult(data as unknown as EmbedResult)
      addToast('Shoppable embed created!', 'success')
    } catch (e: unknown) {
      console.warn("[caught] src/components/editor/ShoppableTagPanel.tsx:84", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }, [videoUrl, recipe, tags, addToast])

  const copyEmbed = useCallback(async () => {
    if (!embedResult) return
    await navigator.clipboard.writeText(embedResult.html)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [embedResult])

  return (
    <div className="p-3 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Shoppable Video</h3>

      {/* Video URL */}
      <div>
        <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Rendered Video URL</p>
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://..."
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-white/20 outline-none focus:border-[#00e5c8]/40" />
      </div>

      {/* Tags list */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Product Tags ({tags.length})</p>
          <button onClick={() => { setFormOpen(!formOpen); setError(null) }}
            className="text-[9px] text-[#00e5c8] hover:text-[#00e5c8]/80">
            {formOpen ? '✕ Cancel' : '+ Add Tag'}
          </button>
        </div>

        {/* Add tag form */}
        {formOpen && (
          <div className="rounded-lg bg-[#1a1f2e] p-2 space-y-1.5 mb-2">
            {[
              { key: 'timestamp', label: 'Timestamp (s)', type: 'number', placeholder: '30' },
              { key: 'productName', label: 'Product Name', type: 'text', placeholder: 'Blue Shirt' },
              { key: 'productPrice', label: 'Price ($)', type: 'number', placeholder: '29.99' },
              { key: 'productImageUrl', label: 'Product Image URL', type: 'url', placeholder: 'https://...' },
              { key: 'productPageUrl', label: 'Product Page URL', type: 'url', placeholder: 'https://...' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <p className="text-[9px] text-white/30 mb-0.5">{label}</p>
                <input type={type} value={draft[key as keyof DraftTag]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-[#0d1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-white/20 outline-none focus:border-[#00e5c8]/40" />
              </div>
            ))}
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[9px] text-white/30 mb-0.5">Hotspot X (0-1)</p>
                <input type="number" step="0.05" min="0" max="1" value={draft.hotspotX}
                  onChange={(e) => setDraft((d) => ({ ...d, hotspotX: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-white/30 mb-0.5">Hotspot Y (0-1)</p>
                <input type="number" step="0.05" min="0" max="1" value={draft.hotspotY}
                  onChange={(e) => setDraft((d) => ({ ...d, hotspotY: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none" />
              </div>
            </div>
            <button onClick={handleAddTag}
              className="w-full py-1.5 mt-1 rounded-lg text-[10px] font-semibold bg-[#00e5c8] text-black hover:bg-[#00e5c8]/90 transition">
              Add Tag
            </button>
          </div>
        )}

        {/* Tags list */}
        <div className="space-y-1">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#1a1f2e]">
              <div>
                <p className="text-[10px] text-white/70">{tag.productName}</p>
                <p className="text-[9px] text-white/30">{tag.timestamp}s · ${(tag.productPrice / 100).toFixed(2)}</p>
              </div>
              <button onClick={() => setTags((prev) => prev.filter((t) => t.id !== tag.id))}
                className="text-white/20 hover:text-red-400 text-xs transition">✕</button>
            </div>
          ))}
          {tags.length === 0 && !formOpen && (
            <p className="text-[9px] text-white/20 text-center py-2">No product tags yet</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-[10px] text-red-400">{error}</p>}

      {/* Generate embed */}
      <button onClick={handleGenerateEmbed} disabled={generating || !videoUrl.trim()}
        className="w-full py-2 rounded-lg text-[11px] font-semibold bg-[#00e5c8] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00e5c8]/90 transition flex items-center justify-center gap-1.5">
        {generating ? (
          <><div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />Generating…</>
        ) : 'Generate Shoppable Embed'}
      </button>

      {/* Embed result */}
      {embedResult && (
        <div className="rounded-lg bg-[#1a1f2e] p-2 space-y-2">
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Share Link</p>
            <div className="flex items-center gap-1.5">
              <input readOnly value={embedResult.shareUrl}
                className="flex-1 bg-[#0d1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white/70 outline-none" />
              <button onClick={() => navigator.clipboard.writeText(embedResult.shareUrl)}
                className="text-[9px] text-[#00e5c8] px-1.5">Copy</button>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Embed Code</p>
            <textarea readOnly value={embedResult.html} rows={3}
              className="w-full bg-[#0d1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white/50 font-mono resize-none outline-none" />
            <button onClick={copyEmbed}
              className="w-full mt-1 py-1 rounded text-[9px] font-semibold border border-[#00e5c8]/30 text-[#00e5c8] hover:bg-[#00e5c8]/10 transition">
              {copied ? '✓ Copied!' : 'Copy Embed Code'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
