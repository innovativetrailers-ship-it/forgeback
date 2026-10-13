'use client'

import { useState, useEffect } from 'react'
import { X, RefreshCw, Loader2, Check } from 'lucide-react'
import type { Clip } from '@/lib/timeline/schema'

interface Props {
  clip: Clip
  surroundingClips: Clip[]
  onClose: () => void
  onRepaintComplete: (clipId: string, newVideoUrl: string) => void
}

const ENGINES = [
  { value: 'inpaint', label: 'Wan inpaint' },
  { value: 'void', label: 'Void inpaint' },
  { value: 'restyle', label: 'Hunyuan restyle' },
  { value: 'swap', label: 'Pika swap' },
] as const

export function RepaintModal({ clip, surroundingClips, onClose, onRepaintComplete }: Props) {
  const [newPrompt, setNewPrompt] = useState(clip.prompt ?? '')
  const [engine, setEngine] = useState<(typeof ENGINES)[number]['value']>('inpaint')
  const [rect, setRect] = useState('0.3, 0.3, 0.4, 0.4')
  const [takeUrl, setTakeUrl] = useState<string | null>(null)
  const [isRepainting, setIsRepainting] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleRepaint = async () => {
    if (!newPrompt.trim() || isRepainting) return
    if (!clip.sourceUrl.startsWith('http')) {
      setProgressMsg('This clip needs a stored video address.')
      return
    }
    const parts = rect.split(',').map((part) => Number(part.trim()))
    const [x, y, w, h] = parts
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      setProgressMsg('Mask is x, y, width, height from 0 to 1.')
      return
    }
    setIsRepainting(true)
    setProgressMsg('8 credits. Generating a new take. This clip stays until you accept.')
    try {
      const res = await fetch('/api/studio/timeline/edit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          op: 'inpaint',
          confirm: true,
          prompt: newPrompt.trim(),
          engine,
          videoUrl: clip.sourceUrl,
          parentClipId: clip.id,
          mask: { x, y, w, h },
        }),
      })
      const data = await res.json() as { takeUrl?: string; error?: string }
      if (!res.ok || !data.takeUrl) throw new Error(data.error ?? 'Repaint failed')
      setTakeUrl(data.takeUrl)
      setProgressMsg('Take is in the library. Accept places it on this clip.')
    } catch (err) {
      console.warn('[repaint]', err instanceof Error ? err.message : err)
      setProgressMsg(err instanceof Error ? err.message : 'Repaint failed')
    } finally {
      setIsRepainting(false)
    }
  }

  const clipDuration = clip.endTime - clip.startTime

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#0e0e1a] rounded-2xl border border-white/12 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-[#00e5c8]" />
            <h2 className="font-semibold text-white/85 text-sm">Repaint Clip</h2>
            <span className="text-xs text-white/30">{clipDuration.toFixed(1)}s</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 grid grid-cols-2 gap-5">
          {/* Left: original */}
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2 font-medium">Original</p>
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              {clip.sourceUrl ? (
                <video src={clip.sourceUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/15 text-xs">No preview</div>
              )}
            </div>
            <p className="text-[10px] text-white/30 mt-2 line-clamp-2 italic">
              {clip.prompt ?? 'No prompt'}
            </p>
          </div>

          {/* Right: new prompt */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2 font-medium">New Prompt</p>
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Describe the changes…"
                className="w-full h-28 bg-[#12121a] border border-white/10 rounded-xl px-3 py-2.5
                  text-sm text-white/80 placeholder:text-white/25 resize-none
                  focus:outline-none focus:border-[#00e5c8]/50 transition-colors"
              />
            </div>

            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2 font-medium">Model</p>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as (typeof ENGINES)[number]['value'])}
                className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2
                  text-xs text-white/70 focus:outline-none focus:border-[#00e5c8]/40"
              >
                {ENGINES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2 font-medium">Rectangle mask</p>
              <input
                value={rect}
                onChange={(event) => setRect(event.target.value)}
                className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70"
              />
              <p className="mt-1 text-[10px] text-white/35">x, y, width, height from 0 to 1. The rectangle is held across the clip. A moving track is not on the gateway.</p>
            </div>
          </div>
        </div>

        {/* Context clips strip */}
        {surroundingClips.length > 0 && (
          <div className="px-5 pb-3">
            <p className="text-[10px] text-white/25 mb-2">Context clips</p>
            <div className="flex gap-2">
              {surroundingClips.slice(0, 4).map((c) => (
                <div key={c.id} className="w-16 aspect-video bg-black/50 rounded-lg overflow-hidden border border-white/8">
                  {c.sourceUrl && <video src={c.sourceUrl} className="w-full h-full object-cover" muted />}
                </div>
              ))}
            </div>
          </div>
        )}

        {progressMsg && <p className="px-5 pb-3 text-[10px] text-white/50">{progressMsg}</p>}
        {takeUrl && (
          <div className="px-5 pb-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Take</p>
            <video src={takeUrl} className="max-h-32 w-full rounded bg-black" controls playsInline />
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/8">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 text-white/50 text-sm hover:border-white/25 transition-colors">
            Cancel
          </button>
          <div className="flex gap-2">
            {takeUrl && (
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-white/15 text-sm text-white/70"
                onClick={() => {
                  onRepaintComplete(clip.id, takeUrl)
                  onClose()
                }}
              >
                Accept
              </button>
            )}
            <button
              onClick={handleRepaint}
              disabled={!newPrompt.trim() || isRepainting}
              className="px-5 py-2 rounded-xl bg-[#00e5c8] hover:bg-[#00f0d5] text-black font-semibold text-sm
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isRepainting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isRepainting ? 'Repainting…' : 'Repaint · 8 credits'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
