'use client'

import { useEffect, useState } from 'react'
import { LOOK_CATEGORIES, LOOK_CATEGORY_LABEL, looksIn, type MakeupLook } from '@cinema/core'
import { MakeupViewport } from '@/components/panels/MakeupViewport'
import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

export function SFXMakeupPanel() {
  const [category, setCategory] = useState<(typeof LOOK_CATEGORIES)[number]>('age')
  const [selected, setSelected] = useState<MakeupLook | null>(looksIn('age')[0] ?? null)
  const [intensity, setIntensity] = useState(0.6)
  const [graphicAck, setGraphicAck] = useState(false)
  const [consent, setConsent] = useState(false)
  const [armed, setArmed] = useState(false)
  const [characterId, setCharacterId] = useState('')
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([])
  const [note, setNote] = useState('Video tracking is not available yet. Bake saves a character variation for the Cast LoRA. The preview is not the final render.')

  useEffect(() => {
    void fetch('/api/studio/assets/t2i?kind=character&list=all', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json() as { assets?: Array<{ id: string; name: string }> }
        setCharacters(body.assets ?? [])
      })
      .catch((err) => console.warn('[makeup]', err instanceof Error ? err.message : err))
  }, [])

  async function bake() {
    if (!selected) return
    const res = await fetch('/api/studio/looks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lookId: selected.id,
        assetId: characterId || undefined,
        intensity,
        confirm: armed,
        graphicAck,
        consent,
      }),
    })
    const body = await res.json() as { error?: string; estimateCredits?: number; imageUrl?: string }
    if (!res.ok) {
      setArmed(false)
      setNote(body.error || 'The look did not bake')
      return
    }
    if (!armed) {
      setArmed(true)
      setNote(`${body.estimateCredits ?? 1} credit. Confirm to bake this look onto the character. Cast training includes it in the LoRA. Nothing is placed on the timeline.`)
      return
    }
    setArmed(false)
    setNote(body.imageUrl ? 'Look variation saved on the character. The next Cast LoRA includes this plate. The original was not replaced.' : 'Saved.')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="panel-section space-y-2">
        <p className="panel-label mb-1 flex items-center gap-1.5">
          <Sparkles size={10} className="text-[var(--teal-bright)]" />
          SFX Makeup
        </p>
        <MakeupViewport colour={selected?.colour ?? '#c4a484'} label={selected ? `${selected.name} · approximate head` : 'No look selected'} />
        <p className="text-[10px] text-[var(--text-tertiary)]">Desktop PBR and higher-resolution displacement are not in this web viewport.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto px-2 py-1">
        {LOOK_CATEGORIES.map((id) => (
          <button key={id} type="button" className={cn('shrink-0 rounded px-1.5 py-1 text-[9px]', category === id ? 'bg-[var(--teal-glow)] text-[var(--teal-bright)]' : 'text-[var(--text-tertiary)]')} onClick={() => { setCategory(id); setSelected(looksIn(id)[0] ?? null); setArmed(false) }}>
            {LOOK_CATEGORY_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-1 overflow-y-auto px-2 pb-2">
        {looksIn(category).map((look) => (
          <button
            key={look.id}
            type="button"
            onClick={() => { setSelected(look); setIntensity(look.intensity); setArmed(false) }}
            className={cn('rounded border px-2 py-1.5 text-left text-[10px]', selected?.id === look.id ? 'border-[var(--teal-border)] text-[var(--teal-bright)]' : 'border-[var(--border)] text-[var(--text-secondary)]')}
          >
            {look.name}
            <span className="mt-0.5 block text-[9px] text-[var(--text-tertiary)]">{look.methods.bake === 'live' ? 'bake live' : 'bake needs a model'} · {look.methods.video === 'live' ? 'video live' : 'video needs a model'}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-1 border-t border-[var(--border)] p-2 text-[10px]">
          <label className="flex items-center gap-2">Intensity
            <input type="range" min={0} max={1} step={0.05} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} className="flex-1" />
          </label>
          {selected.safety === 'graphic' && (
            <label className="flex items-center gap-1"><input type="checkbox" checked={graphicAck} onChange={(event) => setGraphicAck(event.target.checked)} /> This is stage makeup, not a real injury</label>
          )}
          {selected.safety === 'real-person-restricted' && (
            <label className="flex items-center gap-1"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Likeness consent is on file</label>
          )}
          <label className="block text-[var(--text-tertiary)]">Character
            <select value={characterId} onChange={(event) => setCharacterId(event.target.value)} className="mt-1 w-full bg-transparent">
              <option value="">Choose a cast character</option>
              {characters.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <button type="button" className="w-full rounded bg-[var(--teal-bright)] py-1 font-semibold text-[var(--bg-primary)]" onClick={() => void bake().catch((err: unknown) => { console.warn('[makeup]', err instanceof Error ? err.message : err); setNote('The look did not bake') })}>
            {armed ? 'Confirm bake · 1 cr' : 'Bake look variation · 1 cr'}
          </button>
          <p className="text-[var(--text-tertiary)]">{note}</p>
        </div>
      )}
    </div>
  )
}
