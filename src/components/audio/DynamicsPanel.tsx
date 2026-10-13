'use client'

import { useState, useCallback } from 'react'
import { Activity } from 'lucide-react'

interface CompressorState {
  threshold: number
  ratio: number
  attack: number
  release: number
  makeupGain: number
}

interface GateState {
  threshold: number
  attack: number
  release: number
  hold: number
  range: number
}

interface LimiterState {
  ceiling: number
  release: number
}

interface Props {
  trackId: string
}

type DynamicsTab = 'compressor' | 'gate' | 'limiter'

function Slider({ label, min, max, step, value, unit, onChange }: {
  label: string; min: number; max: number; step: number
  value: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/35 w-16 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#00e5c8] h-1"
      />
      <span className="text-[9px] text-white/45 w-14 text-right">{value}{unit}</span>
    </div>
  )
}

export function DynamicsPanel({ trackId }: Props) {
  const [activeTab, setActiveTab] = useState<DynamicsTab>('compressor')
  const [loading, setLoading] = useState(false)
  const [grMeter, setGrMeter] = useState(0)

  const [compressor, setCompressor] = useState<CompressorState>({
    threshold: -18, ratio: 4, attack: 10, release: 100, makeupGain: 3,
  })
  const [gate, setGate] = useState<GateState>({
    threshold: -40, attack: 5, release: 200, hold: 50, range: 40,
  })
  const [limiter, setLimiter] = useState<LimiterState>({ ceiling: -1, release: 50 })

  const patchCompressor = useCallback((patch: Partial<CompressorState>) => {
    setCompressor((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleApply = useCallback(async () => {
    setLoading(true)
    try {
      await fetch('/api/audio/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, type: 'dynamics', activeTab, compressor, gate, limiter }),
      })
      // Simulate GR meter animation
      setGrMeter(Math.random() * 12)
      setTimeout(() => setGrMeter(0), 2000)
    } finally {
      setLoading(false)
    }
  }, [trackId, activeTab, compressor, gate, limiter])

  const TABS: DynamicsTab[] = ['compressor', 'gate', 'limiter']

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/8 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Dynamics</span>
      </div>

      {/* GR meter */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[9px] text-white/30">GR</span>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#00e5c8] transition-all duration-100"
            style={{ width: `${(grMeter / 24) * 100}%` }}
          />
        </div>
        <span className="text-[9px] text-white/30">-{grMeter.toFixed(1)}dB</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 mb-3 bg-[#12121a] rounded-lg p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-1 rounded text-[9px] font-medium capitalize transition ${
              activeTab === t ? 'bg-[#00e5c8]/15 text-[#00e5c8]' : 'text-white/30 hover:text-white/50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {activeTab === 'compressor' && (
          <>
            <Slider label="Threshold" min={-60} max={0} step={1} value={compressor.threshold} unit="dB"
              onChange={(v) => patchCompressor({ threshold: v })} />
            <Slider label="Ratio" min={1} max={20} step={0.5} value={compressor.ratio} unit=":1"
              onChange={(v) => patchCompressor({ ratio: v })} />
            <Slider label="Attack" min={0.1} max={100} step={0.1} value={compressor.attack} unit="ms"
              onChange={(v) => patchCompressor({ attack: v })} />
            <Slider label="Release" min={10} max={3000} step={10} value={compressor.release} unit="ms"
              onChange={(v) => patchCompressor({ release: v })} />
            <Slider label="Makeup" min={0} max={24} step={0.5} value={compressor.makeupGain} unit="dB"
              onChange={(v) => patchCompressor({ makeupGain: v })} />
          </>
        )}
        {activeTab === 'gate' && (
          <>
            <Slider label="Threshold" min={-80} max={0} step={1} value={gate.threshold} unit="dB"
              onChange={(v) => setGate((p) => ({ ...p, threshold: v }))} />
            <Slider label="Attack" min={0.1} max={100} step={0.1} value={gate.attack} unit="ms"
              onChange={(v) => setGate((p) => ({ ...p, attack: v }))} />
            <Slider label="Release" min={10} max={3000} step={10} value={gate.release} unit="ms"
              onChange={(v) => setGate((p) => ({ ...p, release: v }))} />
            <Slider label="Hold" min={0} max={1000} step={10} value={gate.hold} unit="ms"
              onChange={(v) => setGate((p) => ({ ...p, hold: v }))} />
            <Slider label="Range" min={0} max={80} step={1} value={gate.range} unit="dB"
              onChange={(v) => setGate((p) => ({ ...p, range: v }))} />
          </>
        )}
        {activeTab === 'limiter' && (
          <>
            <Slider label="Ceiling" min={-20} max={0} step={0.1} value={limiter.ceiling} unit="dBFS"
              onChange={(v) => setLimiter((p) => ({ ...p, ceiling: v }))} />
            <Slider label="Release" min={10} max={2000} step={10} value={limiter.release} unit="ms"
              onChange={(v) => setLimiter((p) => ({ ...p, release: v }))} />
          </>
        )}
      </div>

      <button
        onClick={() => void handleApply()}
        disabled={loading}
        className="w-full mt-3 py-1.5 rounded-lg text-xs font-medium bg-[#00e5c8] text-black hover:bg-[#00f0d5] disabled:opacity-40 transition"
      >
        {loading ? 'Applying…' : 'Apply Dynamics'}
      </button>
    </div>
  )
}
