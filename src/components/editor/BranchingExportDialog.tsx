'use client'

import { useState, useCallback, useMemo } from 'react'
import { GitBranch, Plus, Trash2, Copy, Check, ArrowRight } from 'lucide-react'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useUIStore } from '@/store/ui'
import type { BranchingConfig, BranchNode, BranchChoice } from '@/lib/export/BranchingExport'

interface DraftNode {
  id: string; clipId: string; clipUrl: string; label: string
  triggerAtSecond: number; choices: DraftChoice[]
}
interface DraftChoice { id: string; label: string; nextNodeId: string | null }
interface ExportResult { embedId: string; embedUrl: string; iframeHtml: string }

let _counter = 0
const uid = () => `br-${Date.now()}-${++_counter}`

const THEMES = ['dark', 'light', 'cinema'] as const

export function BranchingExportDialog() {
  const recipe = useEditorRecipeView()
  const addToast = useUIStore((s) => s.addToast)

  const [nodes, setNodes] = useState<DraftNode[]>([])
  const [startNodeId, setStartNodeId] = useState('')
  const [embedTheme, setEmbedTheme] = useState<'dark' | 'light' | 'cinema'>('dark')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const allClips = useMemo(() => {
    if (!recipe) return []
    return recipe.tracks.flatMap((t) =>
      t.clips.map((c) => ({
        id: c.id,
        name: (c as unknown as { name?: string }).name ?? `Clip ${c.id.slice(0, 6)}`,
        sourceUrl: (c as unknown as { sourceUrl?: string }).sourceUrl ?? '',
        duration: ((c as unknown as { endTime?: number }).endTime ?? 0) - ((c as unknown as { startTime?: number }).startTime ?? 0),
      }))
    )
  }, [recipe])

  const addNode = useCallback((clipId: string) => {
    const clip = allClips.find((c) => c.id === clipId)
    if (!clip || nodes.some((n) => n.clipId === clipId)) return
    const node: DraftNode = {
      id: uid(), clipId, clipUrl: clip.sourceUrl,
      label: clip.name,
      triggerAtSecond: Math.max(1, Math.floor(clip.duration * 0.8)),
      choices: [],
    }
    setNodes((prev) => {
      const next = [...prev, node]
      if (next.length === 1) setStartNodeId(node.id)
      return next
    })
  }, [allClips, nodes])

  const removeNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev
      .filter((n) => n.id !== nodeId)
      .map((n) => ({ ...n, choices: n.choices.map((c) => c.nextNodeId === nodeId ? { ...c, nextNodeId: null } : c) }))
    )
  }, [])

  const addChoice = useCallback((nodeId: string) => {
    setNodes((prev) => prev.map((n) => n.id !== nodeId ? n : {
      ...n,
      choices: [...n.choices, { id: uid(), label: `Choice ${n.choices.length + 1}`, nextNodeId: null }],
    }))
  }, [])

  const updateChoice = useCallback((nodeId: string, choiceId: string, field: 'label' | 'nextNodeId', value: string | null) => {
    setNodes((prev) => prev.map((n) => n.id !== nodeId ? n : {
      ...n,
      choices: n.choices.map((c) => c.id !== choiceId ? c : { ...c, [field]: value }),
    }))
  }, [])

  const handleExport = useCallback(async () => {
    if (nodes.length < 2) { addToast('Add at least 2 nodes', 'warning'); return }
    if (!startNodeId) { addToast('Select a start node', 'warning'); return }

    setLoading(true); setError('')
    try {
      const branchNodes: BranchNode[] = nodes.map((n) => ({
        id: n.id, clipUrl: n.clipUrl, label: n.label,
        triggerAtSecond: n.triggerAtSecond,
        choices: n.choices.map<BranchChoice>((c) => ({ id: c.id, label: c.label, nextNodeId: c.nextNodeId })),
      }))

      const config: BranchingConfig = {
        projectId: (recipe as unknown as { id?: string })?.id ?? 'unknown',
        title: title || 'Untitled Branching Video',
        startNodeId, nodes: branchNodes,
        embedTheme, autoAdvanceMs: 15000,
      }

      const res = await fetch('/api/branch/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json() as { error?: string } & ExportResult
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data)
      addToast('Branching video exported!', 'success')
    } catch (err: unknown) {
      console.warn("[caught] src/components/editor/BranchingExportDialog.tsx:111", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }, [nodes, startNodeId, title, embedTheme, recipe, addToast])

  const copyEmbed = useCallback(() => {
    if (result?.iframeHtml) {
      void navigator.clipboard.writeText(result.iframeHtml)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [result])

  return (
    <div className="flex flex-col gap-3 p-4 bg-[#0d1117] rounded-xl border border-white/8">
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Branching Export</span>
      </div>

      {result ? (
        <div className="space-y-3">
          <p className="text-xs text-[#00e5c8] font-medium">Export successful!</p>
          <a href={result.embedUrl} target="_blank" rel="noopener noreferrer"
            className="block text-xs text-white/50 hover:text-white/80 truncate transition">
            {result.embedUrl}
          </a>
          <div className="bg-[#12121a] rounded-lg p-2 border border-white/6">
            <pre className="text-[8px] text-white/40 overflow-x-auto whitespace-pre-wrap">{result.iframeHtml}</pre>
          </div>
          <button onClick={copyEmbed}
            className="flex items-center gap-1.5 w-full justify-center py-2 rounded-lg text-xs bg-[#00e5c8]/15 border border-[#00e5c8]/30 text-[#00e5c8] hover:bg-[#00e5c8]/25 transition">
            {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Embed Code</>}
          </button>
          <button onClick={() => setResult(null)} className="text-[9px] text-white/25 hover:text-white/50 transition w-full text-center">
            Build another
          </button>
        </div>
      ) : (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Video title…"
            className="px-2.5 py-1.5 bg-[#12121a] border border-white/10 rounded-lg text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#00e5c8]/40" />

          <div className="flex gap-1">
            {THEMES.map((t) => (
              <button key={t} onClick={() => setEmbedTheme(t)}
                className={`flex-1 py-1 rounded text-[9px] capitalize border transition ${
                  embedTheme === t ? 'border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]' : 'border-white/8 text-white/30'
                }`}>{t}</button>
            ))}
          </div>

          <div>
            <p className="text-[9px] text-white/30 mb-1.5 uppercase tracking-wider">Add Clips as Nodes</p>
            <div className="flex flex-wrap gap-1">
              {allClips.map((clip) => {
                const added = nodes.some((n) => n.clipId === clip.id)
                return (
                  <button key={clip.id} onClick={() => addNode(clip.id)} disabled={added}
                    className={`px-2 py-0.5 rounded text-[9px] border transition ${
                      added ? 'border-[#00e5c8]/30 text-[#00e5c8]/60' : 'border-white/8 text-white/40 hover:border-white/20'
                    }`}>
                    {added ? '✓' : '+'} {clip.name}
                  </button>
                )
              })}
              {allClips.length === 0 && <p className="text-[9px] text-white/20">No clips on timeline</p>}
            </div>
          </div>

          {nodes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Nodes ({nodes.length})</p>
              {nodes.map((node) => (
                <div key={node.id} className={`rounded-lg p-2.5 border ${
                  node.id === startNodeId ? 'border-[#00e5c8]/30 bg-[#00e5c8]/5' : 'border-white/8 bg-[#12121a]'
                }`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[9px] font-medium text-white/70 flex-1 truncate">{node.label}</span>
                    {node.id === startNodeId
                      ? <span className="text-[8px] text-[#00e5c8]">▶ START</span>
                      : <button onClick={() => setStartNodeId(node.id)} className="text-[8px] text-white/25 hover:text-[#00e5c8] transition">Set Start</button>
                    }
                    <button onClick={() => removeNode(node.id)} className="text-white/20 hover:text-red-400 transition">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[8px] text-white/25">Choices at</span>
                    <input type="number" min={0} step={0.5} value={node.triggerAtSecond}
                      onChange={(e) => setNodes((prev) => prev.map((n) => n.id !== node.id ? n : { ...n, triggerAtSecond: Number(e.target.value) }))}
                      className="w-14 px-1.5 py-0.5 bg-[#0d1117] border border-white/8 rounded text-[9px] text-white/60 focus:outline-none" />
                    <span className="text-[8px] text-white/25">s</span>
                  </div>

                  <div className="space-y-1">
                    {node.choices.map((choice) => (
                      <div key={choice.id} className="flex items-center gap-1.5">
                        <input value={choice.label} onChange={(e) => updateChoice(node.id, choice.id, 'label', e.target.value)}
                          className="flex-1 px-1.5 py-0.5 bg-[#0d1117] border border-white/8 rounded text-[9px] text-white/60 focus:outline-none" />
                        <ArrowRight className="w-2.5 h-2.5 text-white/20 shrink-0" />
                        <select value={choice.nextNodeId ?? ''}
                          onChange={(e) => updateChoice(node.id, choice.id, 'nextNodeId', e.target.value || null)}
                          className="flex-1 px-1 py-0.5 bg-[#0d1117] border border-white/8 rounded text-[9px] text-white/60 focus:outline-none">
                          <option value="">End</option>
                          {nodes.filter((n) => n.id !== node.id).map((n) => (
                            <option key={n.id} value={n.id}>{n.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button onClick={() => addChoice(node.id)}
                      className="flex items-center gap-1 text-[8px] text-white/25 hover:text-white/50 transition mt-1">
                      <Plus className="w-2.5 h-2.5" /> Add choice
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-red-400 text-[9px]">{error}</p>}

          <button onClick={() => void handleExport()}
            disabled={loading || nodes.length < 2}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#00e5c8] text-black text-xs font-medium hover:bg-[#00f0d5] disabled:opacity-40 disabled:cursor-not-allowed transition">
            {loading ? <><div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />Exporting…</>
              : <><GitBranch className="w-3 h-3" />Export Branching Video</>}
          </button>
        </>
      )}
    </div>
  )
}
