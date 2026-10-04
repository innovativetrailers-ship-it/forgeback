'use client'

import { useState } from 'react'
import type { BundleDraft, BundleRole } from '@/lib/ingest/bulkPackage'

const ROLES: BundleRole[] = ['auto', 'script', 'screenplay', 'characters', 'assets', 'locations', 'audio', 'style']

export function BundleImport({ onScreenplay }: { onScreenplay: (text: string, style: string) => void }) {
  const [consent, setConsent] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [draft, setDraft] = useState<BundleDraft | null>(null)
  const [note, setNote] = useState('Drop a script, cast list, or zip. Nothing is generated, and nothing is placed on the timeline.')

  async function parse() {
    const form = new FormData()
    form.set('consent', consent ? 'true' : 'false')
    form.set('confirm', 'false')
    const roles: Record<string, string> = {}
    for (const file of draft?.files ?? []) roles[file.path] = file.role
    form.set('roles', JSON.stringify(roles))
    for (const file of files) form.append('file', file)
    const res = await fetch('/api/studio/director/bundle', { method: 'POST', body: form, credentials: 'include' })
    const body = await res.json() as { draft?: BundleDraft; error?: string }
    if (!res.ok || !body.draft) {
      setNote(body.error || 'The package did not parse')
      return
    }
    setDraft(body.draft)
    setNote('Review the parse. Confirm writes library rows. It does not generate.')
  }

  async function confirm() {
    if (!draft) return
    const form = new FormData()
    form.set('consent', 'true')
    form.set('confirm', 'true')
    form.set('draft', JSON.stringify(draft))
    const res = await fetch('/api/studio/director/bundle', { method: 'POST', body: form, credentials: 'include' })
    const body = await res.json() as { saved?: string[]; error?: string }
    if (!res.ok) {
      setNote(body.error || 'The library was not updated')
      return
    }
    onScreenplay(draft.screenplay, draft.style)
    setNote(`Saved ${body.saved?.length ?? 0} library rows. The screenplay is in the script. Direct when you are ready.`)
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2 text-[10px] text-white/60">
      <p className="uppercase tracking-wider text-white/35">Import project / bundle</p>
      <p>{note}</p>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        This package is mine, including any real-person references
      </label>
      <input
        type="file"
        multiple
        accept=".pdf,.md,.markdown,.doc,.docx,.txt,.rtf,.csv,.tsv,.zip,image/*,audio/*,.glb"
        onChange={(event) => setFiles([...event.target.files ?? []])}
      />
      <button type="button" disabled={!consent || files.length === 0} className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-40" onClick={() => void parse().catch((err: unknown) => { console.warn('[bundle]', err instanceof Error ? err.message : err); setNote('The package did not parse') })}>
        Parse package
      </button>
      {draft && (
        <div className="space-y-1">
          {draft.files.map((file) => (
            <label key={file.path} className="flex items-center gap-1">
              <span className="truncate">{file.path}</span>
              <select
                value={file.role}
                onChange={(event) => {
                  const role = event.target.value as BundleRole
                  setDraft({ ...draft, files: draft.files.map((row) => row.path === file.path ? { ...row, role, inferred: false } : row) })
                }}
              >
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
          ))}
          {draft.entities.map((row, index) => (
            <input
              key={`${row.sourceFile}-${row.name}`}
              value={row.negativePrompt}
              placeholder={`${row.name} negative prompt`}
              onChange={(event) => {
                const entities = draft.entities.slice()
                entities[index] = { ...row, negativePrompt: event.target.value }
                setDraft({ ...draft, entities })
              }}
              className="w-full rounded border border-white/10 bg-black/30 px-1"
            />
          ))}
          {draft.shots.map((shot, index) => (
            <input
              key={shot.heading}
              value={shot.prompt}
              onChange={(event) => {
                const shots = draft.shots.slice()
                shots[index] = { ...shot, prompt: event.target.value }
                setDraft({ ...draft, shots })
              }}
              className="w-full rounded border border-white/10 bg-black/30 px-1"
            />
          ))}
          {draft.attention.map((item) => (
            <p key={item.file} className="text-amber-200/80">Needs attention · {item.file}: {item.reason}</p>
          ))}
          <button type="button" className="rounded border border-white/10 px-2 py-0.5" onClick={() => void confirm().catch((err: unknown) => { console.warn('[bundle]', err instanceof Error ? err.message : err); setNote('The library was not updated') })}>
            Confirm library rows
          </button>
        </div>
      )}
    </div>
  )
}
