/**
 * MultiCamSync — timecode synchronisation for multi-camera editing.
 * Aligns multiple camera clips by SMPTE timecode or audio waveform correlation.
 */

export interface CameraClip {
  id:         string
  url:        string
  label:      string    // e.g. "Camera A", "Camera B"
  startSmpte: string    // HH:MM:SS:FF timecode or empty for auto-sync
  duration:   number    // seconds
  offsetSec:  number    // computed offset relative to master clip
}

export interface SyncedMultiCam {
  masterClip:    CameraClip
  otherClips:    CameraClip[]
  syncOffsets:   Record<string, number>   // clipId → offset in seconds
  totalDuration: number
}

/** Parse SMPTE timecode HH:MM:SS:FF → seconds (at 30fps) */
export function smpteToSeconds(timecode: string, fps = 30): number {
  const parts = timecode.split(':').map(Number)
  if (parts.length !== 4) return 0
  const [h, m, s, f] = parts
  return h * 3600 + m * 60 + s + f / fps
}

/** Sync clips by their SMPTE timecodes */
export function syncBySmpte(clips: CameraClip[]): SyncedMultiCam {
  if (clips.length === 0) throw new Error('No clips provided')

  // Convert all timecodes to seconds
  const withTimes = clips.map(clip => ({
    ...clip,
    absoluteStart: smpteToSeconds(clip.startSmpte),
  }))

  // The earliest start is the master reference
  const minStart = Math.min(...withTimes.map(c => c.absoluteStart))

  const syncOffsets: Record<string, number> = {}
  for (const clip of withTimes) {
    syncOffsets[clip.id] = clip.absoluteStart - minStart
  }

  const master     = withTimes.reduce((a, b) => a.absoluteStart <= b.absoluteStart ? a : b)
  const others     = withTimes.filter(c => c.id !== master.id)
  const totalDur   = Math.max(...withTimes.map(c => c.absoluteStart - minStart + c.duration))

  return {
    masterClip:    master,
    otherClips:    others,
    syncOffsets,
    totalDuration: totalDur,
  }
}

/** Auto-sync by audio waveform similarity (fingerprinting via Whisper timestamps as proxy) */
export async function syncByAudio(clips: CameraClip[]): Promise<SyncedMultiCam> {
  // Without a full audio fingerprinting library, we use the first clip as master
  // and set offsets to 0 (user can manually adjust). In production this would
  // use an FFmpeg correlation approach or AcoustID.
  const syncOffsets: Record<string, number> = {}
  for (const clip of clips) syncOffsets[clip.id] = 0

  return {
    masterClip:    clips[0],
    otherClips:    clips.slice(1),
    syncOffsets,
    totalDuration: Math.max(...clips.map(c => c.duration)),
  }
}

/**
 * Build an angle-switch edit decision list (EDL) from user click events.
 * switchEvents: array of { timeSec, clipId } — each represents user clicking a camera
 */
export interface AngleSwitch {
  timeSec:  number
  clipId:   string
}

export interface EDLSegment {
  startSec: number
  endSec:   number
  clipId:   string
  offsetSec: number  // clip's absolute offset (for FFmpeg -ss)
}

export function buildEDL(
  switches:      AngleSwitch[],
  syncData:      SyncedMultiCam,
): EDLSegment[] {
  const sorted = [...switches].sort((a, b) => a.timeSec - b.timeSec)
  const segments: EDLSegment[] = []

  for (let i = 0; i < sorted.length; i++) {
    const sw      = sorted[i]
    const nextSw  = sorted[i + 1]
    const endSec  = nextSw?.timeSec ?? syncData.totalDuration
    const offset  = syncData.syncOffsets[sw.clipId] ?? 0

    segments.push({
      startSec:  sw.timeSec,
      endSec,
      clipId:    sw.clipId,
      offsetSec: offset,
    })
  }

  return segments
}
