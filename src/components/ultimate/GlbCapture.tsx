'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Web 3D import. GLB/GLTF only. Captures are canvas stills; the mesh never leaves the browser.
 */
export function GlbCapture({
  disabled,
  onCapture,
}: {
  disabled: boolean
  onCapture: (file: File, label: string) => Promise<void>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [spin, setSpin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const spinRef = useRef(false)
  const view = useRef<{
    snapshot: () => Promise<Blob>
    turntable: () => Promise<Blob[]>
    reset: () => void
  } | null>(null)

  useEffect(() => { spinRef.current = spin }, [spin])

  useEffect(() => {
    if (!src || !canvasRef.current) return
    const canvas = canvasRef.current
    let stopped = false
    let frame = 0
    let cleanup = () => {}

    void (async () => {
      const THREE = await import('three')
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (stopped) return
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(320, 200, false)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#141414')
      const camera = new THREE.PerspectiveCamera(40, 320 / 200, 0.01, 50)
      const home = new THREE.Vector3(0, 0.8, 2.4)
      camera.position.copy(home)
      const controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true
      controls.target.set(0, 0.4, 0)
      scene.add(new THREE.AmbientLight(0xffffff, 0.65))
      const key = new THREE.DirectionalLight(0xffffff, 1.1)
      key.position.set(2, 3, 2)
      scene.add(key)
      try {
        const gltf = await new GLTFLoader().loadAsync(src)
        if (stopped) return
        const root = gltf.scene
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        root.position.sub(center)
        const span = Math.max(size.x, size.y, size.z) || 1
        root.scale.setScalar(1.4 / span)
        root.position.y += 0.2
        scene.add(root)
      } catch (err) {
        console.warn('[wizard] glb load failed', err instanceof Error ? err.message : err)
        if (!stopped) setError('Could not read that GLB/GLTF file')
        return
      }

      const shot = () => new Promise<Blob>((resolve, reject) => {
        renderer.render(scene, camera)
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))), 'image/png')
      })

      view.current = {
        snapshot: shot,
        reset: () => {
          camera.position.copy(home)
          controls.target.set(0, 0.4, 0)
          controls.update()
        },
        turntable: async () => {
          const blobs: Blob[] = []
          const radius = camera.position.length() || 2.4
          for (let i = 0; i < 4; i += 1) {
            const theta = (i / 4) * Math.PI * 2
            camera.position.set(Math.sin(theta) * radius, 0.8, Math.cos(theta) * radius)
            controls.update()
            blobs.push(await shot())
          }
          camera.position.copy(home)
          controls.update()
          return blobs
        },
      }

      const loop = () => {
        if (stopped) return
        controls.autoRotate = spinRef.current
        controls.autoRotateSpeed = 2
        controls.update()
        renderer.render(scene, camera)
        frame = requestAnimationFrame(loop)
      }
      loop()
      setReady(true)
      cleanup = () => {
        cancelAnimationFrame(frame)
        controls.dispose()
        renderer.dispose()
        view.current = null
        setReady(false)
      }
      if (stopped) cleanup()
    })()

    return () => {
      stopped = true
      cleanup()
      cancelAnimationFrame(frame)
    }
  }, [src])

  return (
    <div className="space-y-1 rounded border border-white/10 p-2">
      <p className="text-[10px] text-white/45">3D on the web is GLB or GLTF. Drag to orbit, scroll to zoom, right-drag to pan. OBJ, FBX, and USDZ open on desktop. Only the rendered still is saved.</p>
      <label className={`inline-block rounded border border-white/10 px-2 py-0.5 text-[10px] ${disabled ? 'cursor-not-allowed text-white/30' : 'cursor-pointer text-white/70'}`}>
        Open GLB/GLTF
        <input
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            const name = file.name.toLowerCase()
            if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
              setError('Web accepts GLB and GLTF only')
              return
            }
            setError(null)
            setSrc((prev) => {
              if (prev) URL.revokeObjectURL(prev)
              return URL.createObjectURL(file)
            })
          }}
        />
      </label>
      <canvas ref={canvasRef} width={320} height={200} className="w-full rounded bg-black" />
      <div className="flex flex-wrap gap-1 text-[10px]">
        <button type="button" disabled={!ready || disabled} className="rounded border border-white/10 px-1 disabled:opacity-40" onClick={() => view.current?.reset()}>Reset view</button>
        <button type="button" disabled={!ready || disabled} className="rounded border border-white/10 px-1 disabled:opacity-40" onClick={() => setSpin((on) => !on)}>{spin ? 'Stop rotate' : 'Auto-rotate'}</button>
        <button
          type="button"
          disabled={!ready || disabled}
          className="rounded border border-white/10 px-1 disabled:opacity-40"
          onClick={() => {
            void view.current?.snapshot().then((blob) => onCapture(new File([blob], 'view.png', { type: 'image/png' }), 'view'))
          }}
        >
          Snapshot this view
        </button>
        <button
          type="button"
          disabled={!ready || disabled}
          className="rounded border border-white/10 px-1 disabled:opacity-40"
          onClick={() => {
            void view.current?.turntable().then(async (blobs) => {
              for (let i = 0; i < blobs.length; i += 1) {
                await onCapture(new File([blobs[i]!], `turn-${i}.png`, { type: 'image/png' }), `turn ${i + 1}`)
              }
            })
          }}
        >
          Turntable · 4
        </button>
      </div>
      {error && <p className="text-[10px] text-red-300">{error}</p>}
    </div>
  )
}
