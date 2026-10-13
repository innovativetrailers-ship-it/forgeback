import type { TimelineRecipe } from '@/lib/timeline/schema'

export interface UE5Clip {
  id: string
  name: string
  sourceUrl: string
  startTime: number
  endTime: number
  trackIndex: number
  clipType: 'video' | 'audio'
}

export interface UE5ExportManifest {
  projectName: string
  projectId: string
  fps: number
  resolution: { width: number; height: number }
  totalDurationSeconds: number
  clips: UE5Clip[]
  sequencerName: string
  exportedAt: string
  version: '1.0'
}

export function buildUE5Manifest(recipe: TimelineRecipe, projectId: string): UE5ExportManifest {
  const date = new Date().toISOString().slice(0, 10)
  const sequencerName = `CF_${projectId.slice(-6)}_${date}`

  const clips: UE5Clip[] = recipe.tracks.flatMap((track, trackIndex) =>
    track.clips.map((clip) => ({
      id: clip.id,
      name: clip.prompt?.slice(0, 40) ?? `clip_${clip.id.slice(-4)}`,
      sourceUrl: clip.sourceUrl ?? '',
      startTime: clip.startTime,
      endTime: clip.endTime,
      trackIndex,
      clipType: track.type === 'audio' ? 'audio' : 'video',
    })),
  )

  const totalDuration = Math.max(...recipe.tracks.flatMap((t) => t.clips.map((c) => c.endTime)), 0)

  return {
    projectName: `CinematicForge_${projectId.slice(-6)}`,
    projectId,
    fps: recipe.fps ?? 24,
    resolution: recipe.resolution ?? { width: 1920, height: 1080 },
    totalDurationSeconds: totalDuration,
    clips,
    sequencerName,
    exportedAt: new Date().toISOString(),
    version: '1.0',
  }
}

export function generateSequencerXml(manifest: UE5ExportManifest): string {
  const tracks = manifest.clips.map((clip) =>
    `  <Track Name="${escapeXml(clip.name)}" Type="${clip.clipType}" StartTime="${clip.startTime.toFixed(4)}" EndTime="${clip.endTime.toFixed(4)}" TrackIndex="${clip.trackIndex}">
    <MediaSource URL="${escapeXml(clip.sourceUrl)}"/>
  </Track>`,
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<DatasmithUnrealScene>
  <Version>0.26</Version>
  <SDKVersion>5.4.0</SDKVersion>
  <Host>CinematicForge</Host>
  <Application Vendor="Cinematic Forge" ProductName="CinematicForge" ProductVersion="2.0"/>
  <Sequence Name="${escapeXml(manifest.sequencerName)}" FPS="${manifest.fps}" Width="${manifest.resolution.width}" Height="${manifest.resolution.height}" Duration="${manifest.totalDurationSeconds.toFixed(4)}">
${tracks}
  </Sequence>
</DatasmithUnrealScene>`
}

export function generateManifestJson(manifest: UE5ExportManifest): string {
  return JSON.stringify(manifest, null, 2)
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
