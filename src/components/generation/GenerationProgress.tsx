'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

const PHASE_LABELS: Record<string, string> = {
  patient_zero: 'Creating character references',
  breakdown:    'Planning shots',
  storyboard:   'Generating storyboard keyframes',
  routing:      'Assigning models',
  generating:   'Generating video',
  quality_gate: 'Checking quality',
  stitching:    'Assembling final film',
  complete:     'Complete',
}

const MODE_LABELS: Record<string, string> = {
  director: 'Generating film',
  simple:   'Generating video',
  music:    'Composing music',
  voice:    'Synthesising voice',
}

const VENDOR_LABELS: Record<string, string> = {
  fal:        'AI engine',
  runway:     'Runway',
  xai:        'Grok Imagine',
  suno:       'Suno',
  elevenlabs: 'ElevenLabs',
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return ''
  if (seconds < 60) return `~${seconds}s remaining`
  return `~${Math.ceil(seconds / 60)} min remaining`
}

interface JobStatus {
  id:            string
  status:        string
  progressPct:   number
  phase?:        string | null
  statusMessage?: string | null
  etaSeconds?:   number | null
  outputUrl?:    string | null
  errorMessage?: string | null
  // mode comes from metadata on the job row
  mode?:         string | null
}

export function GenerationProgress({
  jobId,
  onComplete,
}: {
  jobId:       string
  onComplete?: (outputUrl: string) => void
}) {
  const { data: job } = useQuery<JobStatus>({
    queryKey: ['job', jobId],
    queryFn:  () =>
      fetch(`/api/jobs/${jobId}/status`, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'COMPLETE' || s === 'FAILED' ? false : 2000
    },
  })

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Starting…
      </div>
    )
  }

  if (job.status === 'COMPLETE' && job.outputUrl) {
    onComplete?.(job.outputUrl)
    return (
      <div className="flex items-center gap-2 text-sm text-[#00e5c8]">
        <CheckCircle2 className="w-4 h-4" /> Complete
      </div>
    )
  }

  if (job.status === 'FAILED') {
    return (
      <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
        <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-red-400 font-medium">Generation failed</p>
          <p className="text-xs text-red-400/70 mt-0.5">{job.errorMessage ?? 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  const pct     = job.progressPct ?? 0
  // Resolve a human label: phase label → mode label → status message → fallback
  const modeLabel  = MODE_LABELS[job.mode ?? '']
  const phaseLabel = PHASE_LABELS[job.phase ?? '']
  const phase      = phaseLabel ?? modeLabel ?? job.statusMessage ?? 'Processing…'
  const etaText    = formatEta(job.etaSeconds)

  // Extract vendor name from statusMessage if it contains a known vendor keyword
  const vendorInMsg = Object.entries(VENDOR_LABELS).find(([k]) =>
    job.statusMessage?.toLowerCase().includes(k)
  )
  const vendorBadge = vendorInMsg ? vendorInMsg[1] : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-[#00e5c8] animate-spin" />
          <span className="text-xs text-white/80">{phase}</span>
          {vendorBadge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-medium">
              {vendorBadge}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-500 tabular-nums">{pct}%</span>
      </div>

      <div className="h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#00e5c8] to-[#00b8a0] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600 truncate max-w-[70%]">
          {job.statusMessage}
        </span>
        {etaText && <span className="text-[10px] text-gray-500">{etaText}</span>}
      </div>

      {(job.etaSeconds ?? 0) > 300 && (
        <p className="text-[10px] text-amber-400/70 mt-1 leading-relaxed">
          This is a complex render — larger clips can take several minutes.
          You can leave this page; we&apos;ll keep working and your result will be saved.
        </p>
      )}
    </div>
  )
}
