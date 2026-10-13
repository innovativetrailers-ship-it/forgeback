'use client'

import { useMemo } from 'react'
import { useEditorStore } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import type { ClipColourGrade } from '@/lib/timeline/schema'

const W = 180
const H = 60

interface Point { x: number; y: number }

function catmullRomPath(pts: Point[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, pts.length - 1)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x} ${p2.y}`
  }
  return d
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function gradeToPoints(grade: ClipColourGrade | null): Point[] {
  const shadows = grade?.shadows ?? 0      // -100 to +100
  const midtones = grade?.midtones ?? 0
  const highlights = grade?.highlights ?? 0
  const temperature = grade?.temperature ?? 0  // -100 to +100 (unused visually)

  // 5-point tone curve: black → shadow → mid → highlight → white
  // Y=0 is top (bright output), Y=H is bottom (dark output)
  return [
    { x: 0, y: H },                                                        // black point
    { x: W * 0.25, y: clamp(H * 0.75 - (shadows / 100) * (H * 0.2), 0, H) },   // shadow
    { x: W * 0.5,  y: clamp(H * 0.5  - (midtones / 100) * (H * 0.15), 0, H) }, // midpoint
    { x: W * 0.75, y: clamp(H * 0.25 - (highlights / 100) * (H * 0.15), 0, H) }, // highlight
    { x: W, y: 0 },                                                        // white point
  ]
}

interface Props {
  clipId?: string
}

export function GradePreviewBar({ clipId }: Props) {
  const recipe = useEditorRecipeView()
  const selectedClipId = useEditorStore((s) => s.selectedClipId)

  const effectiveClipId = clipId ?? selectedClipId

  const clip = useMemo(
    () => recipe?.tracks.flatMap((t) => t.clips).find((c) => c.id === effectiveClipId),
    [recipe, effectiveClipId],
  )

  const grade = (clip?.colourGradeJson as ClipColourGrade | null) ?? null
  const points = useMemo(() => gradeToPoints(grade), [grade])
  const path = useMemo(() => catmullRomPath(points), [points])
  const linearPath = `M 0 ${H} L ${W} 0`

  const hasGrade = grade !== null && Object.keys(grade).length > 0
  const temp = grade?.temperature ?? 0

  return (
    <div className="rounded-lg bg-[#0d1117] border border-white/6 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider">Tone Curve</p>
        {hasGrade ? (
          <span className="text-[8px] text-[#00e5c8]">Grade active</span>
        ) : (
          <span className="text-[8px] text-white/20">No grade</span>
        )}
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
        {/* Background grid */}
        <line x1={W * 0.25} y1={0} x2={W * 0.25} y2={H} stroke="#ffffff06" strokeWidth={0.5} />
        <line x1={W * 0.5}  y1={0} x2={W * 0.5}  y2={H} stroke="#ffffff08" strokeWidth={0.5} />
        <line x1={W * 0.75} y1={0} x2={W * 0.75} y2={H} stroke="#ffffff06" strokeWidth={0.5} />
        <line x1={0} y1={H * 0.25} x2={W} y2={H * 0.25} stroke="#ffffff05" strokeWidth={0.5} />
        <line x1={0} y1={H * 0.5}  x2={W} y2={H * 0.5}  stroke="#ffffff08" strokeWidth={0.5} />
        <line x1={0} y1={H * 0.75} x2={W} y2={H * 0.75} stroke="#ffffff05" strokeWidth={0.5} />

        {/* Linear reference */}
        <path d={linearPath} stroke="#ffffff10" strokeWidth={0.75} fill="none" strokeDasharray="2 2" />

        {/* Tone curve */}
        <path d={path} stroke="#00e5c8" strokeWidth={1.5} fill="none" />

        {/* Temperature tint indicator */}
        {temp !== 0 && (
          <rect
            x={W - 6} y={0} width={4} height={H}
            fill={temp > 0 ? '#f97316' : '#3b82f6'}
            opacity={Math.min(Math.abs(temp) / 100, 1) * 0.4}
            rx={1}
          />
        )}
      </svg>

      {/* Compact stats */}
      {hasGrade && (
        <div className="flex items-center gap-2 mt-1.5">
          {[
            { label: 'S', value: grade?.shadows, color: '#1d4ed8' },
            { label: 'M', value: grade?.midtones, color: '#00e5c8' },
            { label: 'H', value: grade?.highlights, color: '#fbbf24' },
          ].map(({ label, value, color }) =>
            value !== undefined && value !== 0 ? (
              <div key={label} className="flex items-center gap-0.5">
                <span className="text-[8px]" style={{ color }}>{label}</span>
                <span className="text-[8px] font-mono text-white/40">
                  {value > 0 ? '+' : ''}{value}
                </span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
