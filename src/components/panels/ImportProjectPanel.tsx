'use client'
import { useState } from 'react'
import { useEditorStore } from '@/store/editor'
import { RelinkMediaModal } from './RelinkMediaModal'
import type { ImportResult, ImportSourceApp } from '@/lib/importers/ProjectImporter'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import { toEditorTimelineRecipe } from '@/lib/timeline/to-editor-recipe'

type ImportStep = 'drop' | 'detecting' | 'options' | 'importing' | 'relink' | 'done'

const SOURCE_APP_LABELS: Record<ImportSourceApp, string> = {
  premiere:  'Import project (.prproj)',
  davinci:   'Import project (.drp)',
  capcut:    'Import project (timeline package)',
  finalcut:  'Import project (.fcpxml)',
  avid:      'Import project (AAF)',
  edl:       'EDL (CMX 3600)',
  otio:      'OpenTimelineIO',
  raw_media: 'Raw media file',
  unknown:   'Unknown format',
}

const SOURCE_APP_ICONS: Record<ImportSourceApp, string> = {
  premiere:  '🅿️',
  davinci:   '🎬',
  capcut:    '✂️',
  finalcut:  '🍎',
  avid:      '🎞️',
  edl:       '📋',
  otio:      '🔗',
  raw_media: '🎥',
  unknown:   '❓',
}

const SOURCE_APP_DESCRIPTIONS: Partial<Record<ImportSourceApp, string>> = {
  capcut:    'Timeline, clips, and audio will be imported. Generated clips stay as video.',
  premiere:  'Sequences, bins, and media references will be imported. Relink media if a file is missing.',
  davinci:   'Timeline structure and media references will be imported. Colour grades are not transferred.',
  finalcut:  'Timeline, clips, and media references will be imported from an interchange file.',
  avid:      'Timeline and audio will be imported from an interchange file.',
  edl:       'Cut points and basic metadata will be imported from the EDL.',
  otio:      'Full OTIO timeline bundle will be imported.',
}

function applyRelinkToRecipe(
  recipe: TimelineRecipe,
  relinks: Record<string, string>
): TimelineRecipe {
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const relink = Object.entries(relinks).find(([originalPath]) =>
          clip.metadata?.originalPath === originalPath
        )
        return relink ? { ...clip, sourceUrl: relink[1] } : clip
      }),
    })),
  }
}

interface ImportProjectPanelProps {
  onClose: () => void
}

export function ImportProjectPanel({ onClose }: ImportProjectPanelProps) {
  const [step, setStep] = useState<ImportStep>('drop')
  const [file, setFile] = useState<File | null>(null)
  const [detectedApp, setDetectedApp] = useState<ImportSourceApp | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const { setRecipe } = useEditorStore()

  const handleFileDrop = async (f: File) => {
    setFile(f)
    setStep('detecting')
    setError(null)

    try {
      // Send first 2KB for format detection
      const sampleBuffer = await f.slice(0, 2048).arrayBuffer()
      const res = await fetch('/api/import/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: f.name,
          sampleBytes: Array.from(new Uint8Array(sampleBuffer)),
        }),
      })
      const { format } = await res.json() as { format: ImportSourceApp }
      setDetectedApp(format)
      setStep('options')
    } catch (err) {
      console.warn("[caught] src/components/panels/ImportProjectPanel.tsx:96", err instanceof Error ? { name: err.name, message: err.message } : err)

      setDetectedApp('unknown')
      setStep('options')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setStep('importing')
    setError(null)

    try {
      const fullBuffer = await file.arrayBuffer()
      const res = await fetch('/api/import/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          data: Array.from(new Uint8Array(fullBuffer)),
        }),
      })

      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Import failed')
      }

      const result = await res.json() as ImportResult
      setImportResult(result)

      if (result.offlineMedia.length > 0) {
        setStep('relink')
      } else {
        setRecipe(toEditorTimelineRecipe(result.recipe))
        setStep('done')
      }
    } catch (err) {
      console.warn("[caught] src/components/panels/ImportProjectPanel.tsx:132", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('options')
    }
  }

  const handleRelinkDone = (relinks: Record<string, string>) => {
    if (!importResult) return
    const updatedRecipe = applyRelinkToRecipe(importResult.recipe, relinks)
    setRecipe(toEditorTimelineRecipe(updatedRecipe))
    setStep('done')
  }

  const clipCount = importResult?.recipe.tracks.flatMap((t) => t.clips).length ?? 0

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-[#151b24] border border-[#1a2030] rounded-xl w-[560px]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1a2030]">
          <h3 className="text-white font-semibold">Import Project</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Step: Drop */}
        {step === 'drop' && (
          <div className="p-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={async (e) => {
                e.preventDefault()
                setIsDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFileDrop(f)
              }}
              onClick={() => document.getElementById('import-file-input')?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition cursor-pointer ${
                isDragging ? 'border-[#00e5c8] bg-[#00e5c8]/5' : 'border-[#2a3040] hover:border-[#3a4050]'
              }`}
            >
              <div className="text-4xl mb-3">📂</div>
              <div className="text-white font-medium mb-1">Drop project file here</div>
              <div className="text-gray-400 text-sm">or click to browse</div>
              <div className="text-gray-500 text-xs mt-3">
                Supports: .prproj · .drp · .capcut · .fcpxml · .aaf · .edl · .otioz
              </div>
              <input
                id="import-file-input"
                type="file"
                className="hidden"
                accept=".prproj,.drp,.capcut,.fcpxml,.xml,.aaf,.edl,.otioz,.zip"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileDrop(f)
                }}
              />
            </div>

            {/* App icons */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              {(
                ['premiere', 'davinci', 'capcut', 'finalcut', 'avid', 'edl', 'otio'] as ImportSourceApp[]
              ).map((app) => (
                <div key={app} className="text-center p-2 bg-[#0d1117] rounded-lg">
                  <div className="text-xl">{SOURCE_APP_ICONS[app]}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {SOURCE_APP_LABELS[app].split(' ')[0]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Detecting */}
        {step === 'detecting' && (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-2 border-[#00e5c8] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-white">Detecting format…</div>
            <div className="text-gray-400 text-sm mt-1">{file?.name}</div>
          </div>
        )}

        {/* Step: Options */}
        {step === 'options' && detectedApp && (
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 bg-[#0d1117] rounded-xl mb-4">
              <div className="text-3xl">{SOURCE_APP_ICONS[detectedApp]}</div>
              <div>
                <div className="text-white font-medium">
                  Detected: {SOURCE_APP_LABELS[detectedApp]}
                </div>
                <div className="text-gray-400 text-sm">{file?.name}</div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            {SOURCE_APP_DESCRIPTIONS[detectedApp] && (
              <div className="text-gray-400 text-sm mb-4">
                {SOURCE_APP_DESCRIPTIONS[detectedApp]}
              </div>
            )}

            <div className="text-xs text-gray-500 mb-4">
              Note: effects, colour grades, text/titles, and transitions are not transferred — 
              recreate them using Cinematic Forge&apos;s native tools.
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setStep('drop'); setFile(null); setDetectedApp(null) }}
                className="flex-1 py-2.5 border border-[#2a3040] text-gray-400 rounded-lg hover:border-[#3a4050] hover:text-white text-sm transition"
              >
                Choose different file
              </button>
              <button
                onClick={handleImport}
                className="flex-1 py-2.5 bg-[#00e5c8] text-black font-semibold rounded-lg hover:bg-[#00e5c8]/90 text-sm transition"
              >
                Import Project
              </button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-2 border-[#00e5c8] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-white">Importing…</div>
            <div className="text-gray-400 text-sm mt-1">Converting timeline structure</div>
          </div>
        )}

        {/* Step: Re-link (rendered inline since RelinkMediaModal is a modal-within-modal) */}
        {step === 'relink' && importResult && (
          <RelinkMediaModal
            offlineMedia={importResult.offlineMedia}
            onRelinked={handleRelinkDone}
            onClose={() => {
              setRecipe(toEditorTimelineRecipe(importResult.recipe))
              setStep('done')
            }}
          />
        )}

        {/* Step: Done */}
        {step === 'done' && importResult && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <div className="text-white font-semibold text-lg mb-1">Import complete</div>
            <div className="text-gray-400 text-sm mb-4">
              {clipCount} clip{clipCount !== 1 ? 's' : ''} imported from{' '}
              {SOURCE_APP_LABELS[importResult.sourceApp]}
              {importResult.offlineMedia.length > 0 &&
                ` · ${importResult.offlineMedia.length} offline`}
            </div>
            {importResult.warnings.map((w, i) => (
              <div
                key={i}
                className="text-[#00e5c8]/70 text-xs p-2 bg-[#00e5c8]/5 border border-[#00e5c8]/20 rounded mb-2"
              >
                {w}
              </div>
            ))}
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-[#00e5c8] text-black font-semibold rounded-lg hover:bg-[#00e5c8]/90 transition"
            >
              Open in Editor
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
