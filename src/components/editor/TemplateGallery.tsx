'use client'

import { useEffect, useMemo, useState } from 'react'
import { TEMPLATE_CATEGORIES, placeholdersIn, type FilmTemplateRecord } from '@/lib/templates/catalog'

export function TemplateGallery({ onUse }: { onUse: (template: FilmTemplateRecord) => void }) {
  const [templates, setTemplates] = useState<FilmTemplateRecord[]>([])
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<FilmTemplateRecord | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (query.trim()) params.set('q', query.trim())
    void fetch(`/api/studio/templates?${params.toString()}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((body: { templates?: FilmTemplateRecord[] }) => setTemplates(body.templates ?? []))
      .catch((err) => {
        console.warn('[templates] load', err instanceof Error ? err.message : err)
      })
  }, [category, query])

  const previewShots = useMemo(() => open?.breakdown.scenes.flatMap((scene) => scene.shots) ?? [], [open])

  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">Templates</p>
      <div className="flex gap-1">
        <select className="rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px]" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All</option>
          {TEMPLATE_CATEGORIES.map((name) => <option key={name}>{name}</option>)}
        </select>
        <input className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-0.5 text-[10px]" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="max-h-36 space-y-1 overflow-y-auto">
        {templates.map((item) => (
          <button key={item.id} type="button" className="flex w-full items-center justify-between rounded bg-white/5 px-2 py-1 text-left text-[10px] text-white/70" onClick={() => setOpen(item)}>
            <span>{item.name}</span>
            <span className="text-white/35">{item.category}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="space-y-1 rounded border border-white/10 p-2 text-[10px] text-white/70">
          <p className="text-white">{open.name}</p>
          <p>{open.format.aspect} · {open.format.platform} · {open.format.durationTarget}s · {open.style.look}</p>
          {previewShots.map((shot) => (
            <p key={shot.id}>{shot.type} · {shot.duration}s · {shot.description}</p>
          ))}
          <p className="text-white/40">Placeholders: {placeholdersIn(JSON.stringify(open.breakdown)).join(', ') || 'none'}</p>
          <button
            type="button"
            className="rounded bg-[#00e5c8] px-2 py-1 font-semibold text-black"
            onClick={() => {
              onUse(open)
              setNote('Loaded into the director. Nothing has been generated.')
            }}
          >
            Use template
          </button>
          {open.isPublic && (
            <button
              type="button"
              className="ml-1 rounded border border-white/15 px-2 py-1"
              onClick={() => {
                const path = `/api/studio/templates/${open.id}`
                void navigator.clipboard.writeText(path).then(() => setNote(`Share link copied: ${path}`)).catch((err) => {
                  console.warn('[templates] copy', err instanceof Error ? err.message : err)
                  setNote(path)
                })
              }}
            >
              Copy share link
            </button>
          )}
        </div>
      )}
      {note && <p className="text-[10px] text-white/50">{note}</p>}
    </div>
  )
}
