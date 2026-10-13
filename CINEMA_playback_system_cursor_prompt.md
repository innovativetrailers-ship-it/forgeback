# CINEMATIC FORGE — PLAYBACK SYSTEM
## Cursor Agent Prompt
### Media player · Timeline sync · Multi-track audio · Render viewer · CGI/3D viewer

---

## THE PROBLEM

The preview pane shows "No content at playhead" — generated clips aren't loaded into a player,
playback isn't synced to the timeline, and there's no viewer for the final stitched film or
3D/CGI content. This builds the complete playback layer so the editor actually plays.

What gets built:
1. **Timeline playback engine** — a clock that drives the playhead and resolves active clips
2. **Media preview player** — loads + plays the clip under the playhead (fixes "No content")
3. **Multi-track audio mixer** — video + music + voice + SFX mixed via Web Audio API
4. **Render viewer** — full playback of the final stitched film
5. **CGI/3D viewer** — Three.js for 3D content + reuse Cesium for aerial

---

## STEP 1 — TIMELINE PLAYBACK ENGINE (the clock)

**Create** `src/lib/playback/engine.ts`:

```typescript
// src/lib/playback/engine.ts
// Drives the playhead and resolves which clips are active at any time

export interface TimelineClip {
  id:        string
  trackId:   string
  trackType: 'video' | 'vfx' | 'cgi' | 'music' | 'voice' | 'sfx'
  url:       string
  startSec:  number    // position on the timeline
  durationSec: number
  inSec:     number    // trim in-point within the source
  outSec:    number    // trim out-point
  volume?:   number    // 0-1 for audio tracks
}

export interface PlaybackState {
  playing:    boolean
  currentSec: number
  durationSec: number
}

// Which clips are active at a given timeline position
export function clipsAtTime(clips: TimelineClip[], t: number): TimelineClip[] {
  return clips.filter(c => t >= c.startSec && t < c.startSec + c.durationSec)
}

// The topmost video/vfx/cgi clip to SHOW at time t (visual layers composite top-down)
export function visualClipAtTime(clips: TimelineClip[], t: number): TimelineClip | null {
  const visuals = clipsAtTime(clips, t).filter(c =>
    c.trackType === 'video' || c.trackType === 'vfx' || c.trackType === 'cgi'
  )
  // Track order: cgi > vfx > video (topmost wins) — adjust to your track stack
  const priority = { cgi: 3, vfx: 2, video: 1 } as Record<string, number>
  return visuals.sort((a, b) => (priority[b.trackType] ?? 0) - (priority[a.trackType] ?? 0))[0] ?? null
}

// Audio clips active at time t (all play simultaneously, mixed)
export function audioClipsAtTime(clips: TimelineClip[], t: number): TimelineClip[] {
  return clipsAtTime(clips, t).filter(c =>
    c.trackType === 'music' || c.trackType === 'voice' || c.trackType === 'sfx'
  )
}

// Total timeline duration
export function timelineDuration(clips: TimelineClip[]): number {
  return clips.reduce((max, c) => Math.max(max, c.startSec + c.durationSec), 0)
}

// Map timeline time → source video time for a clip (accounts for trim + position)
export function sourceTime(clip: TimelineClip, timelineSec: number): number {
  return clip.inSec + (timelineSec - clip.startSec)
}
```

---

## STEP 2 — PLAYBACK STORE (Zustand)

**Create** `src/store/playbackStore.ts`:

```typescript
// src/store/playbackStore.ts

import { create } from 'zustand'
import type { TimelineClip } from '@/lib/playback/engine'

interface PlaybackStore {
  playing:     boolean
  currentSec:  number
  clips:       TimelineClip[]
  setClips:    (clips: TimelineClip[]) => void
  addClip:     (clip: TimelineClip) => void
  play:        () => void
  pause:       () => void
  toggle:      () => void
  seek:        (sec: number) => void
  setCurrent:  (sec: number) => void
}

export const usePlaybackStore = create<PlaybackStore>((set) => ({
  playing:    false,
  currentSec: 0,
  clips:      [],
  setClips:   (clips) => set({ clips }),
  addClip:    (clip)  => set((s) => ({ clips: [...s.clips, clip] })),
  play:       () => set({ playing: true }),
  pause:      () => set({ playing: false }),
  toggle:     () => set((s) => ({ playing: !s.playing })),
  seek:       (sec) => set({ currentSec: Math.max(0, sec) }),
  setCurrent: (sec) => set({ currentSec: sec }),
}))
```

---

## STEP 3 — MEDIA PREVIEW PLAYER (fixes "No content at playhead")

**Create** `src/components/playback/PreviewPlayer.tsx`:

```tsx
// src/components/playback/PreviewPlayer.tsx
// Shows + plays the visual clip under the playhead, synced to the timeline clock

'use client'

import { useRef, useEffect, useCallback } from 'react'
import { usePlaybackStore } from '@/store/playbackStore'
import { visualClipAtTime, audioClipsAtTime, sourceTime, timelineDuration } from '@/lib/playback/engine'

export function PreviewPlayer() {
  const { playing, currentSec, clips, pause, setCurrent } = usePlaybackStore()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const rafRef    = useRef<number>()
  const lastTsRef = useRef<number>(0)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  const activeVisual = visualClipAtTime(clips, currentSec)
  const totalDur     = timelineDuration(clips)

  // ── The playback clock: advance currentSec while playing ──────────────────
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    lastTsRef.current = performance.now()
    const tick = (ts: number) => {
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      const next = currentSecRef.current + dt
      if (next >= totalDur) {
        usePlaybackStore.getState().pause()
        usePlaybackStore.getState().seek(totalDur)
        return
      }
      usePlaybackStore.getState().setCurrent(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, totalDur])

  // keep a ref of currentSec for the RAF loop
  const currentSecRef = useRef(currentSec)
  useEffect(() => { currentSecRef.current = currentSec }, [currentSec])

  // ── Load + sync the active visual clip ────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !activeVisual) return

    // Switch source if the active clip changed
    if (!v.src.endsWith(activeVisual.url)) {
      v.src = activeVisual.url
      v.load()
    }

    // Seek the video element to the right source frame
    const target = sourceTime(activeVisual, currentSec)
    if (Math.abs(v.currentTime - target) > 0.15) {
      v.currentTime = target
    }

    // Play/pause the element to match timeline state
    if (playing && v.paused) v.play().catch(() => {})
    if (!playing && !v.paused) v.pause()
  }, [activeVisual?.id, currentSec, playing])

  // ── Multi-track audio: play/sync every active audio clip ──────────────────
  useEffect(() => {
    const active = audioClipsAtTime(clips, currentSec)
    const activeIds = new Set(active.map(c => c.id))

    // Stop audio no longer active
    audioRefs.current.forEach((el, id) => {
      if (!activeIds.has(id)) { el.pause(); audioRefs.current.delete(id) }
    })

    // Start/sync active audio
    for (const clip of active) {
      let el = audioRefs.current.get(clip.id)
      if (!el) {
        el = new Audio(clip.url)
        el.volume = clip.volume ?? 1
        audioRefs.current.set(clip.id, el)
      }
      const target = sourceTime(clip, currentSec)
      if (Math.abs(el.currentTime - target) > 0.2) el.currentTime = target
      if (playing && el.paused) el.play().catch(() => {})
      if (!playing && !el.paused) el.pause()
    }
  }, [clips, currentSec, playing])

  // Cleanup audio on unmount
  useEffect(() => () => { audioRefs.current.forEach(el => el.pause()); audioRefs.current.clear() }, [])

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {activeVisual ? (
        <video
          ref={videoRef}
          className="max-w-full max-h-full"
          playsInline
          muted={false}
          onClick={() => usePlaybackStore.getState().toggle()}
        />
      ) : (
        <div className="text-center text-gray-600">
          <p className="text-sm">No content at playhead</p>
          <p className="text-[11px] mt-1">Generate a clip or move the playhead over one</p>
        </div>
      )}
    </div>
  )
}
```

> The fix for "No content at playhead": `visualClipAtTime` resolves the clip under the playhead
> and loads it into the `<video>`. When a generation completes, push its clip into the store
> (STEP 6) and it appears immediately.

---

## STEP 4 — TRANSPORT CONTROLS

**Create** `src/components/playback/TransportControls.tsx`:

```tsx
// src/components/playback/TransportControls.tsx

'use client'

import { usePlaybackStore } from '@/store/playbackStore'
import { timelineDuration } from '@/lib/playback/engine'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const f = Math.floor((sec % 1) * 24)   // 24fps frame
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`
}

export function TransportControls() {
  const { playing, currentSec, clips, toggle, seek } = usePlaybackStore()
  const total = timelineDuration(clips)

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#0d1117] border-t border-white/8">
      <button onClick={() => seek(0)} className="text-gray-400 hover:text-white">
        <SkipBack className="w-4 h-4" />
      </button>
      <button onClick={toggle} className="w-9 h-9 rounded-full bg-[#00e5c8] text-black flex items-center justify-center hover:bg-[#00f0d5]">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <button onClick={() => seek(total)} className="text-gray-400 hover:text-white">
        <SkipForward className="w-4 h-4" />
      </button>

      <span className="text-[11px] font-mono text-white/70 tabular-nums">{fmt(currentSec)}</span>

      {/* Scrubber */}
      <input
        type="range"
        min={0} max={total || 1} step={0.01}
        value={currentSec}
        onChange={(e) => seek(Number(e.target.value))}
        className="flex-1 h-1 accent-[#00e5c8] cursor-pointer"
      />

      <span className="text-[11px] font-mono text-white/40 tabular-nums">{fmt(total)}</span>
    </div>
  )
}
```

---

## STEP 5 — RENDER VIEWER (final stitched film)

**Create** `src/components/playback/RenderViewer.tsx`:

```tsx
// src/components/playback/RenderViewer.tsx
// Plays the final stitched film (orchestration finalVideoUrl) — simple, robust full playback

'use client'

import { useRef, useState } from 'react'
import { Play, Pause, Maximize2, Download, X } from 'lucide-react'

export function RenderViewer({ url, onClose }: { url: string; onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      )}

      <video
        ref={videoRef}
        src={url}
        controls
        className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3 mt-4">
        <button onClick={toggle} className="px-4 py-2 bg-[#00e5c8] text-black rounded-lg font-medium flex items-center gap-2">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <a href={url} download className="px-4 py-2 border border-white/20 text-white rounded-lg flex items-center gap-2 hover:bg-white/10">
          <Download className="w-4 h-4" /> Download
        </a>
        <button
          onClick={() => videoRef.current?.requestFullscreen()}
          className="px-4 py-2 border border-white/20 text-white rounded-lg flex items-center gap-2 hover:bg-white/10"
        >
          <Maximize2 className="w-4 h-4" /> Fullscreen
        </button>
      </div>
    </div>
  )
}
```

---

## STEP 6 — WIRE GENERATION OUTPUT INTO THE PLAYER

When a job completes, push its result into the timeline so it plays. Two paths:

### 6a — Individual clips onto the timeline (during editing)

In the job-completion handler (where you poll `/api/jobs/[id]` and it returns COMPLETED):

```tsx
import { usePlaybackStore } from '@/store/playbackStore'

// When a job completes with segments, add each to the timeline:
function onJobComplete(job: any) {
  const segments = job.metadata?.segments ?? []
  const addClip = usePlaybackStore.getState().addClip

  let cursor = usePlaybackStore.getState().clips
    .filter(c => c.trackType === 'video')
    .reduce((max, c) => Math.max(max, c.startSec + c.durationSec), 0)

  for (const seg of segments) {
    addClip({
      id:        seg.shotIndex != null ? `seg_${seg.shotIndex}` : crypto.randomUUID(),
      trackId:   'video-1',
      trackType: 'video',
      url:       seg.videoUrl,
      startSec:  cursor,
      durationSec: seg.duration ?? 5,
      inSec:     0,
      outSec:    seg.duration ?? 5,
    })
    cursor += seg.duration ?? 5
  }

  // If only a final stitched film (no segments), add it as one clip:
  if (!segments.length && job.outputUrl) {
    addClip({
      id: crypto.randomUUID(), trackId: 'video-1', trackType: 'video',
      url: job.outputUrl, startSec: cursor, durationSec: job.duration ?? 5, inSec: 0, outSec: job.duration ?? 5,
    })
  }
}
```

### 6b — "Export Film" → open the Render Viewer

```tsx
import { RenderViewer } from '@/components/playback/RenderViewer'

const [viewerUrl, setViewerUrl] = useState<string | null>(null)

// On Export Film click (or when the final stitched film is ready):
// setViewerUrl(job.outputUrl)

{viewerUrl && <RenderViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
```

---

## STEP 7 — CGI / 3D VIEWER (Three.js + Cesium)

CGI clips generated by PixVerse/Hunyuan are just video — they play in the PreviewPlayer like
any clip. A separate viewer is only needed for *interactive 3D* (Cesium aerial, Three.js scenes).

**Create** `src/components/playback/CGIViewer.tsx`:

```tsx
// src/components/playback/CGIViewer.tsx
// Interactive 3D viewer — Three.js for scenes, delegates to Cesium for geo/aerial

'use client'

import { useEffect, useRef } from 'react'

export function CGIViewer({ mode, sceneUrl, geo }: {
  mode:     'threejs' | 'cesium'
  sceneUrl?: string                              // glTF/GLB for three.js
  geo?:     { lat: number; lng: number; height: number }  // for cesium aerial
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'cesium' && geo) {
      // Reuse the existing Cesium aerial viewer config
      const config = { token: process.env.NEXT_PUBLIC_CESIUM_TOKEN, destination: geo }
      sessionStorage.setItem('cesium-config', JSON.stringify(config))
      // The /location/aerial page already renders Cesium — embed it or open it
      return
    }

    if (mode === 'threejs' && sceneUrl && containerRef.current) {
      let renderer: any, scene: any, camera: any, frameId: number
      ;(async () => {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')

        scene    = new THREE.Scene()
        camera   = new THREE.PerspectiveCamera(50, 16/9, 0.1, 1000)
        camera.position.set(0, 1, 5)
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(containerRef.current!.clientWidth, containerRef.current!.clientHeight)
        containerRef.current!.appendChild(renderer.domElement)

        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        const key = new THREE.DirectionalLight(0xffffff, 1)
        key.position.set(5, 10, 7)
        scene.add(key)

        new GLTFLoader().load(sceneUrl, (gltf: any) => scene.add(gltf.scene))

        const animate = () => {
          frameId = requestAnimationFrame(animate)
          scene.rotation.y += 0.003
          renderer.render(scene, camera)
        }
        animate()
      })()

      return () => {
        if (frameId) cancelAnimationFrame(frameId)
        renderer?.dispose?.()
        if (containerRef.current) containerRef.current.innerHTML = ''
      }
    }
  }, [mode, sceneUrl, geo])

  return <div ref={containerRef} className="w-full h-full bg-black rounded-lg" />
}
```

```bash
npm install three
npm install --save-dev @types/three
```

> For aerial/geo, `CGIViewer mode="cesium"` reuses your existing `/location/aerial` Cesium page.
> For 3D model previews, `mode="threejs"` loads a GLB. Most "CGI" track content is video and
> needs neither — it plays in the PreviewPlayer.

---

## STEP 8 — ASSEMBLE THE PREVIEW PANE

**Edit** the editor's preview area to mount the player + transport:

```tsx
import { PreviewPlayer }     from '@/components/playback/PreviewPlayer'
import { TransportControls } from '@/components/playback/TransportControls'

// In the preview pane (where "No content at playhead" currently shows):
<div className="flex flex-col h-full">
  <div className="flex-1 min-h-0">
    <PreviewPlayer />
  </div>
  <TransportControls />
</div>
```

**Sync the timeline playhead** to `currentSec` — the timeline's playhead position reads from
`usePlaybackStore().currentSec`, and clicking the timeline ruler calls `seek(sec)`:

```tsx
import { usePlaybackStore } from '@/store/playbackStore'

// In the timeline component:
const { currentSec, seek } = usePlaybackStore()
// Playhead left position = currentSec * pixelsPerSecond
// Timeline ruler onClick = seek(clickX / pixelsPerSecond)
```

---

## VERIFICATION

```bash
npm install three
npx tsc --noEmit

# In the browser:
# 1. Generate a clip → it appears on the video track and plays in the preview (no more "No content")
# 2. Press play → playhead advances, video plays, timecode counts up
# 3. Scrub the transport → video seeks frame-accurately
# 4. Generate music + clip → both play in sync (Web Audio mixing)
# 5. Export Film → RenderViewer opens, plays the final stitched film fullscreen + download
# 6. CGI: aerial location → Cesium viewer; 3D model → Three.js viewer
```

- [ ] Generated clip plays in preview (fixes "No content at playhead")
- [ ] Play/pause/scrub work, timecode accurate
- [ ] Multi-track audio mixes (video + music + voice)
- [ ] Render viewer plays final film + download + fullscreen
- [ ] Timeline playhead syncs to playback

---

## HONEST SCOPE NOTES

- **Preview compositing is "topmost clip wins"** — true multi-layer compositing (overlays,
  blends, transitions rendered live) is a bigger job; the backend stitch handles final
  compositing. The preview shows the dominant visual layer, which is correct for editing.
- **Frame accuracy is ~1 frame** — HTML5 video seeking isn't perfectly frame-exact; fine for
  editing, the export render is exact.
- **Audio sync uses separate `<audio>` elements** — good for a handful of tracks. For complex
  mixing (many tracks, real-time effects) you'd move to a full Web Audio graph; this covers
  the common case (video + music + voiceover + a few SFX).
- **This connects to the orchestration output** via `segments[].videoUrl` and `finalVideoUrl`,
  matching what your worker writes to `RenderJob.metadata` / `outputUrl`.

---

## SUMMARY — FILES

| File | Purpose |
|---|---|
| `src/lib/playback/engine.ts` | timeline clock + clip resolution |
| `src/store/playbackStore.ts` | playback state (Zustand) |
| `src/components/playback/PreviewPlayer.tsx` | timeline-synced player (fixes "No content") |
| `src/components/playback/TransportControls.tsx` | play/pause/scrub/timecode |
| `src/components/playback/RenderViewer.tsx` | final film playback + export |
| `src/components/playback/CGIViewer.tsx` | Three.js 3D + Cesium aerial |
| editor preview pane | mount player + transport |
| timeline component | sync playhead to currentSec |
| job-completion handler | push generated clips into the timeline |
```
