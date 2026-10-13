'use client'

import { useEffect, useRef } from 'react'

/** Local preview. This is not the final render and it does not call a model. */
export function MakeupViewport({ colour, label }: { colour: string; label: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let stop = false
    let cleanup = () => {}
    void import('three').then((THREE) => {
      if (stop || !el) return
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(el.clientWidth || 240, 180)
      el.replaceChildren(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(40, (el.clientWidth || 240) / 180, 0.1, 20)
      camera.position.set(0, 0.2, 3.2)
      const light = new THREE.DirectionalLight(0xffffff, 1.2)
      light.position.set(2, 3, 4)
      scene.add(light)
      scene.add(new THREE.AmbientLight(0xffffff, 0.4))
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 32, 32),
        new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55 }),
      )
      scene.add(head)
      let dragging = false
      let lastX = 0
      const onDown = (event: PointerEvent) => { dragging = true; lastX = event.clientX }
      const onUp = () => { dragging = false }
      const onMove = (event: PointerEvent) => {
        if (!dragging) return
        head.rotation.y += (event.clientX - lastX) * 0.01
        lastX = event.clientX
      }
      renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointermove', onMove)
      let frame = 0
      const tick = () => {
        frame = requestAnimationFrame(tick)
        renderer.render(scene, camera)
      }
      tick()
      cleanup = () => {
        cancelAnimationFrame(frame)
        renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointermove', onMove)
        renderer.dispose()
      }
    }).catch((err: unknown) => {
      console.warn('[makeup-viewport]', err instanceof Error ? err.message : err)
    })
    return () => { stop = true; cleanup() }
  }, [colour])

  return (
    <div className="space-y-1">
      <div ref={host} className="h-[180px] w-full overflow-hidden rounded bg-black/40" />
      <p className="text-[10px] text-[var(--text-tertiary)]">{label} Tinted sphere. Drag to orbit. This preview is approximate and is not the final render.</p>
    </div>
  )
}
