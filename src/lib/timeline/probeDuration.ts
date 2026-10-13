/** Measure video duration in the browser via metadata — avoids bogus timeline defaults. */

export function probeDuration(videoUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.crossOrigin = 'anonymous'

    const cleanup = () => {
      v.removeAttribute('src')
      v.load()
    }

    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5
      cleanup()
      resolve(d)
    }

    v.onerror = () => {
      cleanup()
      resolve(5)
    }

    v.src = videoUrl
  })
}
