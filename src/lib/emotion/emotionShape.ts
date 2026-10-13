export type EmotionType = 'tension' | 'joy' | 'sadness' | 'confusion' | 'resolution' | 'climax'
export type ArcPosition = 'build' | 'peak' | 'resolution' | 'transition'
export type OverallArc = 'rising' | 'falling' | 'circular' | 'broken' | 'flat'

export interface EmotionalBeat {
  clipId: string
  timestamp: number
  emotion: EmotionType
  intensity: number
  confidence: number
  drivingElement: string
  arcPosition: ArcPosition
}

export interface ThreeActStructure {
  act1End: number
  act2End: number
  act1Emotion: EmotionType
  act2Emotion: EmotionType
  act3Emotion: EmotionType
}

export interface NarrativePace {
  avgShotLength: number
  cutTension: number
  musicAlignment: number
  silenceRatio: number
  recommendations: {
    cutFaster: boolean
    addSilence: boolean
    increaseMusicProminence: boolean
    extendEmotionalMoments: boolean
  }
}

export interface WeakPoint {
  timestamp: number
  clipId: string
  issue: string
  suggestion: string
}

export interface EmotionLatticeResult {
  beats: EmotionalBeat[]
  overallArc: OverallArc
  threeActStructure: ThreeActStructure
  paceRecommendations: NarrativePace
  weakPoints: WeakPoint[]
}

const EMOTION_TYPES = new Set<EmotionType>(['tension', 'joy', 'sadness', 'confusion', 'resolution', 'climax'])
const ARC_POSITIONS = new Set<ArcPosition>(['build', 'peak', 'resolution', 'transition'])
const OVERALL_ARCS = new Set<OverallArc>(['rising', 'falling', 'circular', 'broken', 'flat'])

function isEmotionType(v: unknown): v is EmotionType { return typeof v === 'string' && EMOTION_TYPES.has(v as EmotionType) }
function isArcPosition(v: unknown): v is ArcPosition { return typeof v === 'string' && ARC_POSITIONS.has(v as ArcPosition) }
function isOverallArc(v: unknown): v is OverallArc { return typeof v === 'string' && OVERALL_ARCS.has(v as OverallArc) }

function isEmotionalBeat(v: unknown): v is EmotionalBeat {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.clipId === 'string' && typeof o.timestamp === 'number' &&
    isEmotionType(o.emotion) && typeof o.intensity === 'number' &&
    typeof o.confidence === 'number' && typeof o.drivingElement === 'string' &&
    isArcPosition(o.arcPosition)
}

function isThreeActStructure(v: unknown): v is ThreeActStructure {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.act1End === 'number' && typeof o.act2End === 'number' &&
    isEmotionType(o.act1Emotion) && isEmotionType(o.act2Emotion) && isEmotionType(o.act3Emotion)
}

function isNarrativePace(v: unknown): v is NarrativePace {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.avgShotLength !== 'number' || typeof o.cutTension !== 'number' ||
    typeof o.musicAlignment !== 'number' || typeof o.silenceRatio !== 'number') return false
  if (typeof o.recommendations !== 'object' || o.recommendations === null) return false
  const r = o.recommendations as Record<string, unknown>
  return typeof r.cutFaster === 'boolean' && typeof r.addSilence === 'boolean' &&
    typeof r.increaseMusicProminence === 'boolean' && typeof r.extendEmotionalMoments === 'boolean'
}

function isWeakPoint(v: unknown): v is WeakPoint {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.timestamp === 'number' && typeof o.clipId === 'string' &&
    typeof o.issue === 'string' && typeof o.suggestion === 'string'
}

export function isEmotionLatticeResult(v: unknown): v is EmotionLatticeResult {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.beats) && o.beats.every(isEmotionalBeat) &&
    isOverallArc(o.overallArc) && isThreeActStructure(o.threeActStructure) &&
    isNarrativePace(o.paceRecommendations) &&
    Array.isArray(o.weakPoints) && o.weakPoints.every(isWeakPoint)
}

export function computeArcPath(beats: EmotionalBeat[], totalWidth: number, height: number): string {
  if (beats.length === 0) return ''
  const totalTime = Math.max(...beats.map((b) => b.timestamp), 1)
  const points = beats.map((b) => ({
    x: (b.timestamp / totalTime) * totalWidth,
    y: height - (b.intensity / 10) * height,
  }))
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return path
}

export const EMOTION_COLORS: Record<EmotionType, string> = {
  tension: '#ef4444', joy: '#22c55e', sadness: '#3b82f6',
  confusion: '#f97316', resolution: '#00e5c8', climax: '#8b5cf6',
}
