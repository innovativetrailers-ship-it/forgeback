'use client'

import { useCallback, useState } from 'react'
import type { BreakdownEntity, EntityResolution, ProductionBreakdown } from '@cinema/core'

type BoardEntity = EntityResolution & { kind?: string; name: string }

export function PreProductionBoard({ projectId }: { projectId: string }) {
  const [text, setText] = useState('')
  const [breakdown, setBreakdown] = useState<ProductionBreakdown | null>(null)
  const [entities, setEntities] = useState<BoardEntity[]>([])
  const [estimate, setEstimate] = useState<string>('')
  const [status, setStatus] = useState('')
  const [owned, setOwned] = useState(false)
  const [consent, setConsent] = useState(false)
  const [variantLabel, setVariantLabel] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!projectId) return
    const res = await fetch(`/api/studio/production/board?projectId=${encodeURIComponent(projectId)}`)
    const body = await res.json() as { breakdown?: ProductionBreakdown | null; entities?: BoardEntity[] }
    setBreakdown(body.breakdown ?? null)
    setEntities(body.entities ?? [])
  }, [projectId])

  async function ingest() {
    setStatus('')
    const res = await fetch('/api/studio/production/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, text }),
    })
    const body = await res.json() as { breakdown?: ProductionBreakdown; error?: string }
    if (!res.ok || !body.breakdown) {
      setStatus(body.error || 'Import failed')
      return
    }
    setBreakdown(body.breakdown)
    await load()
  }

  async function resolve(entityId: string, action: 'import' | 'generate' | 'prompt', extra?: { url?: string; descriptor?: string }) {
    const res = await fetch('/api/studio/production/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, entityId, action, ...extra }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? '' : (body.error || 'Could not update the entity'))
    if (res.ok) await load()
  }

  async function onImport(entityId: string, file: File) {
    const form = new FormData()
    form.set('image', file)
    const uploaded = await fetch('/api/upload/image', { method: 'POST', body: form })
    const body = await uploaded.json() as { url?: string; error?: string }
    if (!uploaded.ok || !body.url) {
      setStatus(body.error || 'Import failed')
      return
    }
    await resolve(entityId, 'import', { url: body.url })
  }

  async function estimateAuto() {
    const res = await fetch('/api/studio/production/auto-gen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, confirm: false }),
    })
    const body = await res.json() as { estimateCredits?: number; selected?: Array<{ name: string }>; error?: string }
    if (!res.ok) {
      setStatus(body.error || 'Could not estimate')
      return
    }
    const names = (body.selected ?? []).map((row) => row.name).join(', ') || 'none'
    setEstimate(`${body.estimateCredits ?? 0} credit(s) for ${names}. Background assets stay prompt-only.`)
  }

  async function confirmAuto() {
    const res = await fetch('/api/studio/production/auto-gen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, confirm: true }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? 'References generated.' : (body.error || 'Auto-gen did not run'))
    if (res.ok) await load()
  }

  async function train(entityId: string, name: string, imageUrl?: string) {
    if (!imageUrl) {
      setStatus('Import or generate a reference before training')
      return
    }
    if (!owned || !consent) {
      setStatus('Training needs ownership and subject consent')
      return
    }
    const quote = await fetch('/api/studio/production/train', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, entityId }),
    })
    const quoted = await quote.json() as { costUsd?: number; trainerKey?: string; tab?: 'cast' | 'styles'; error?: string }
    if (!quote.ok || quoted.costUsd == null || !quoted.trainerKey) {
      setStatus(quoted.error || 'Could not price training')
      return
    }
    const started = await fetch('/api/studio/training', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trainerKey: quoted.trainerKey,
        tab: quoted.tab,
        name,
        steps: 1000,
        confirmedCostUsd: quoted.costUsd,
        ownedOrLicensed: true,
        subjectConsent: true,
        files: [{ name: `${name}.png`, kind: 'image', url: imageUrl }],
      }),
    })
    const body = await started.json() as { error?: string }
    setStatus(started.ok ? `Training started for ${name}.` : (body.error || 'Training did not start'))
  }

  async function addVariation(entityId: string) {
    const label = variantLabel[entityId]?.trim()
    if (!label) return
    const res = await fetch('/api/studio/production/board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, entityId, label, modifier: label }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? '' : (body.error || 'Could not add the variation'))
    if (res.ok) {
      setVariantLabel((current) => ({ ...current, [entityId]: '' }))
      await load()
    }
  }

  async function skipToDirector() {
    const res = await fetch('/api/studio/production/direct', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    const body = await res.json() as { paused?: boolean; message?: string; error?: string; compiledPlan?: { shots?: unknown[] } }
    if (!res.ok) {
      setStatus(body.error || 'Direct failed')
      return
    }
    const count = body.compiledPlan?.shots?.length ?? 0
    setStatus(body.paused ? `${body.message} ${count} shot(s) planned.` : `Director compiled ${count} shot(s).`)
  }

  const groups: Array<{ label: string; kind: BreakdownEntity['kind'] }> = [
    { label: 'Characters', kind: 'character' },
    { label: 'Locations', kind: 'location' },
    { label: 'Assets', kind: 'asset' },
  ]

  return (
    <section className="border-t border-white/10 p-3 text-xs text-white/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm text-white">Pre-production</h2>
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void skipToDirector()}>
          Skip to Director
        </button>
      </div>
      <textarea
        className="mb-2 h-20 w-full rounded bg-black/40 p-2"
        placeholder="Paste a production plan, a screenplay, or a loose idea"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="button" className="mb-3 rounded bg-white/10 px-2 py-1" onClick={() => void ingest()}>
        Import plan
      </button>
      {breakdown && groups.map((group) => {
        const rows = breakdown.entities.filter((entity) => entity.kind === group.kind)
        if (!rows.length) return null
        return (
          <div key={group.kind} className="mb-3">
            <h3 className="mb-1 text-white">{group.label}</h3>
            {rows.map((entity) => {
              const resolved = entities.find((row) => row.entityId === entity.id)
              return (
                <div key={entity.id} className="mb-2 rounded border border-white/10 p-2">
                  <div className="font-medium text-white">{entity.name}</div>
                  <p>{entity.descriptor}</p>
                  <p className="text-white/50">{resolved?.level ?? 'unresolved'} · {resolved?.resolutionState ?? 'unresolved'}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <label className="cursor-pointer rounded bg-white/10 px-2 py-1">
                      Import
                      <input
                        className="hidden"
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) void onImport(entity.id, file)
                        }}
                      />
                    </label>
                    <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void resolve(entity.id, 'generate', { descriptor: entity.descriptor })}>
                      Generate
                    </button>
                    <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void resolve(entity.id, 'prompt', { descriptor: entity.descriptor })}>
                      Prompt only
                    </button>
                    <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void train(entity.id, entity.name, resolved?.imageUrl)}>
                      Train
                    </button>
                  </div>
                  {(entity.variations ?? []).map((variation) => (
                    <p key={variation.variantId} className="mt-1 text-white/50">{variation.label} · {variation.resolutionState}</p>
                  ))}
                  <div className="mt-1 flex gap-1">
                    <input
                      className="min-w-0 flex-1 rounded bg-black/40 px-2 py-1"
                      placeholder="Add a variation, e.g. age 10"
                      value={variantLabel[entity.id] ?? ''}
                      onChange={(event) => setVariantLabel((current) => ({ ...current, [entity.id]: event.target.value }))}
                    />
                    <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void addVariation(entity.id)}>
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-1">
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void estimateAuto()}>
          Estimate auto-generate
        </button>
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void confirmAuto()}>
          Confirm auto-generate
        </button>
      </div>
      <label className="mt-2 flex items-center gap-2">
        <input type="checkbox" checked={owned} onChange={(event) => setOwned(event.target.checked)} />
        I own or license these references
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        Subject consent is on file
      </label>
      {estimate && <p className="mt-2">{estimate}</p>}
      {status && <p className="mt-2">{status}</p>}
    </section>
  )
}
