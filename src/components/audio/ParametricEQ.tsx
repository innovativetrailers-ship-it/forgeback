'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { BarChart3, Power } from 'lucide-react'

export interface EQBand {
  id: string
  type: 'lowshelf' | 'peak' | 'highshelf'
  frequency: number
  gain: number
  q: number
  bypassed: boolean
}

interface Props {
  trackId: string
  onFilterChange?: (bands: EQBand[]) => void
}

const DEFAULT_BANDS: EQBand[] = [
  { id: 'b1', type: 'lowshelf',  frequency: 80,    gain: 0, q: 1.0, bypassed: false },
  { id: 'b2', type: 'peak',      frequency: 250,   gain: 0, q: 1.4, bypassed: false },
  { id: 'b3', type: 'peak',      frequency: 1000,  gain: 0, q: 1.4, bypassed: false },
  { id: 'b4', type: 'peak',      frequency: 4000,  gain: 0, q: 1.4, bypassed: false },
  { id: 'b5', type: 'peak',      frequency: 8000,  gain: 0, q: 1.4, bypassed: false },
  { id: 'b6', type: 'highshelf', frequency: 16000, gain: 0, q: 1.0, bypassed: false },
]

const BAND_COLORS = ['#00e5c8', '#4f9cf9', '#f97316', '#a855f7', '#ec4899', '#facc15']

function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(20)
  const maxLog = Math.log10(20000)
  return ((Math.log10(freq) - minLog) / (maxLog - minLog)) * width
}

function computeResponse(bands: EQBand[], width: number): number[] {
  const points: number[] = []
  for (let px = 0; px < width; px++) {
    const logFreq = Math.log10(20) + (px / width) * (Math.log10(20000) - Math.log10(20))
    const freq = Math.pow(10, logFreq)
    let totalGain = 0
    for (const band of bands) {
      if (band.bypassed) continue
      const f0 = band.frequency
      const gain = band.gain
      const q = band.q
      if (band.type === 'peak') {
        const bw = freq / (f0 * q)
        totalGain += gain / (1 + bw * bw)
      } else {
        // shelf: simple approximation
        const ratio = freq / f0
        const factor = band.type === 'lowshelf' ? 1 / (1 + ratio * ratio) : ratio * ratio / (1 + ratio * ratio)
        totalGain += gain * factor
      }
    }
    points.push(totalGain)
  }
  return points
}

export function ParametricEQ({ trackId, onFilterChange }: Props) {
  const [bands, setBands] = useState<EQBand[]>(DEFAULT_BANDS)
  const [masterBypass, setMasterBypass] = useState(false)
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let db = -24; db <= 24; db += 6) {
      const y = height / 2 - (db / 24) * (height / 2)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    }
    for (const f of [100, 1000, 10000]) {
      const x = freqToX(f, width)
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
    }

    // 0dB line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke()

    if (masterBypass) return

    // Response curve
    const response = computeResponse(bands, width)
    ctx.strokeStyle = '#00e5c8'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      const y = height / 2 - (response[x] / 24) * (height / 2)
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Band handles
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i]
      if (band.bypassed) continue
      const x = freqToX(band.frequency, width)
      const y = height / 2 - (band.gain / 24) * (height / 2)
      ctx.fillStyle = BAND_COLORS[i]
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    }
  }, [bands, masterBypass])

  useEffect(() => { drawCurve() }, [drawCurve])

  const updateBand = useCallback((id: string, patch: Partial<EQBand>) => {
    setBands((prev) => {
      const next = prev.map((b) => b.id === id ? { ...b, ...patch } : b)
      onFilterChange?.(next)
      return next
    })
  }, [onFilterChange])

  const handleApply = useCallback(async () => {
    setLoading(true)
    try {
      const filterChain = bands
        .filter((b) => !b.bypassed && !masterBypass && b.gain !== 0)
        .map((b) => `equalizer=f=${b.frequency}:t=q:w=${b.q}:g=${b.gain}`)
        .join(',')
      await fetch('/api/audio/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, type: 'eq', filterChain }),
      })
    } finally {
      setLoading(false)
    }
  }, [bands, masterBypass, trackId])

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/8 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-[#00e5c8]" />
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Parametric EQ</span>
        </div>
        <button
          onClick={() => setMasterBypass((v) => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] border transition ${
            masterBypass ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-white/10 text-white/30'
          }`}
        >
          <Power className="w-2.5 h-2.5" /> {masterBypass ? 'Bypassed' : 'Active'}
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={280} height={80}
        className="w-full rounded-lg bg-[#12121a] border border-white/6 mb-3"
      />

      {/* Bands */}
      <div className="space-y-1.5">
        {bands.map((band, i) => (
          <div key={band.id} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BAND_COLORS[i] }} />
            <span className="text-[9px] text-white/30 w-12 shrink-0">
              {band.frequency >= 1000 ? `${band.frequency / 1000}kHz` : `${band.frequency}Hz`}
            </span>
            <input
              type="range" min={-24} max={24} step={0.5} value={band.gain}
              onChange={(e) => updateBand(band.id, { gain: Number(e.target.value) })}
              className="flex-1 accent-[#00e5c8] h-1"
            />
            <span className="text-[9px] text-white/40 w-8 text-right">{band.gain > 0 ? '+' : ''}{band.gain}dB</span>
            <button
              onClick={() => updateBand(band.id, { bypassed: !band.bypassed })}
              className={`text-[8px] px-1 py-0.5 rounded border transition ${
                band.bypassed ? 'border-red-500/30 text-red-400/60' : 'border-white/8 text-white/20'
              }`}
            >
              {band.bypassed ? 'OFF' : 'ON'}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => void handleApply()}
        disabled={loading}
        className="w-full mt-3 py-1.5 rounded-lg text-xs font-medium bg-[#00e5c8] text-black hover:bg-[#00f0d5] disabled:opacity-40 transition"
      >
        {loading ? 'Applying…' : 'Apply EQ'}
      </button>
    </div>
  )
}
