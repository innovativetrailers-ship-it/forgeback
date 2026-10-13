export type QualityTier = 'draft' | 'standard' | 'cinematic' | 'film_grade'
export type AspectRatio = '16:9' | '9:16' | '1:1' | '21:9'
export type Duration = 5 | 10 | 15 | 30 | 60 | 'custom'
export type SimpleTab = 'text' | 'image' | 'audio' | 'social'

export interface QualityPill {
  id: QualityTier
  label: string
  credits: number
  model: string
  description: string
}

export const QUALITY_PILLS: QualityPill[] = [
  { id: 'draft', label: 'Quick Draft', credits: 2, model: 'ltx-2.3-fast', description: '~8s • Budget' },
  { id: 'standard', label: 'Standard', credits: 20, model: 'seedance-2.0', description: '~15s • Performance' },
  { id: 'cinematic', label: 'Cinematic', credits: 17, model: 'kling-3.0', description: '~30s • Motion' },
  { id: 'film_grade', label: 'Film Grade', credits: 23, model: 'veo-3.1', description: '~60s • Cinema' },
]

export const DURATION_OPTIONS: Array<{ value: Duration; label: string }> = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 'custom', label: 'Custom' },
]

export const ASPECT_RATIOS: Array<{ value: AspectRatio; label: string; icon: string }> = [
  { value: '16:9', label: '16:9', icon: '▬' },
  { value: '9:16', label: '9:16', icon: '▮' },
  { value: '1:1', label: '1:1', icon: '■' },
  { value: '21:9', label: '21:9', icon: '▬▬' },
]

export const ALL_MODELS = [
  { group: 'Draft', models: ['ltx-2.3-fast', 'wan-2.7'] },
  { group: 'Performance', models: ['seedance-2.0', 'kling-3.0'] },
  { group: 'Cinema', models: ['gemini-omni', 'runway-gen4', 'veo-3.1', 'grok-imagine-video'] },
]

export interface GeneratedClip {
  id: string
  jobId: string
  prompt: string
  videoUrl?: string
  thumbnailUrl?: string
  model: string
  quality: QualityTier
  creditsUsed: number
  duration: number
  aspectRatio: AspectRatio
  status: 'queued' | 'processing' | 'complete' | 'failed'
  progress?: number
  progressMessage?: string
  userMessage?: string
  phase?: string
  etaSeconds?: number | null
  error?: string
  createdAt: Date
  folderId?: string | null
  libraryKind?: 'video' | 'imported' | 'music' | 'voice'
  mediaId?: string
  variationOf?: string | null
  label?: string
}

export const MODEL_FAMILY_COLOURS: Record<string, string> = {
  kling_standard: '#3b82f6',
  kling_pro: '#2563eb',
  veo3: '#7c3aed',
  seedance: '#0d9488',
  runway: '#db2777',
  luma: '#ea580c',
  pika: '#00b8a0',
  minimax: '#059669',
  animatediff: '#6b7280',
  'ltx-2.3-fast': '#6b7280',
  'ltx-2.3': '#6b7280',
  wan: '#78716c',
}
