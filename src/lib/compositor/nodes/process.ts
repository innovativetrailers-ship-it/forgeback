import type { CompositorNode } from '../schema'
import type { CompositorFrame, NodeInputs } from '../frame'
import { loadEXRFromURL } from '../EXRLoader'
import {
  applyLayer3D,
  applyParticles,
  applyRoto,
  applyVectorWarp,
  deepMerge,
  propagateRoto,
  runOfx,
  type RotoLayer,
  type RotoPoint,
} from '../vfx'

type SharpFactory = (input?: import('sharp').SharpOptions | Buffer) => import('sharp').Sharp

async function sharp(): Promise<SharpFactory> {
  const mod = await import('sharp')
  return (mod as unknown as { default: SharpFactory }).default
}

async function decodeRaw(encoded: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const s = await sharp()
  const raw = s(encoded).ensureAlpha().raw() as {
    toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>
  }
  const decoded = await raw.toBuffer({ resolveWithObject: true })
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height }
}

async function encodePng(raw: Buffer, width: number, height: number): Promise<Buffer> {
  const s = await sharp() as (
    input: Buffer,
    options: { raw: { width: number; height: number; channels: 4 } },
  ) => import('sharp').Sharp
  return s(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function arr3(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(v) && v.length >= 3) {
    return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])]
  }
  return fallback
}

async function loadFrameFromUrl(url: string): Promise<CompositorFrame> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load image: ${url}`)
  const rgba = Buffer.from(await res.arrayBuffer())
  const s = await sharp()
  const meta = await s(rgba).metadata()
  return { width: meta.width ?? 1920, height: meta.height ?? 1080, rgba }
}

async function mergeFrames(
  fg: CompositorFrame,
  bg: CompositorFrame,
  blendMode: string,
  opacity: number,
): Promise<CompositorFrame> {
  const s = await sharp()
  const out = await s(fg.rgba)
    .composite([{ input: bg.rgba, blend: 'over' as const }])
    .png()
    .toBuffer()
  void blendMode
  void opacity
  const meta = await s(out).metadata()
  return { width: meta.width ?? fg.width, height: meta.height ?? fg.height, rgba: out }
}

export async function processNode(node: CompositorNode, inputs: NodeInputs): Promise<NodeInputs> {
  const p = node.params
  const video = inputs.video ?? inputs.foreground

  switch (node.type) {
    case 'MediaIn': {
      const url = String(p.sourceUrl ?? '')
      if (!url) throw new Error('MediaIn requires sourceUrl')
      const frame = await loadFrameFromUrl(url)
      return { video: frame }
    }

    case 'MediaOut':
    case 'Dot':
    case 'NoOp':
      return { video }

    case 'Merge':
    case 'LayerMerge': {
      const fg = inputs.foreground ?? video
      const bg = inputs.background
      if (!fg || !bg) return { video: fg ?? bg }
      const merged = await mergeFrames(
        fg,
        bg,
        String(p.blendMode ?? 'normal'),
        num(p.opacity, 1),
      )
      return { video: merged }
    }

    case 'Dissolve': {
      const from = inputs.foreground ?? video
      const to = inputs.background
      if (!from || !to) return { video: from ?? to }
      const mix = num(p.mix, 0.5)
      const s = await sharp()
      void mix
      const out = await s(from.rgba)
        .composite([{ input: to.rgba, blend: 'over' as const }])
        .png()
        .toBuffer()
      return { video: { ...from, rgba: out } }
    }

    case 'Switch': {
      const useB = num(p.input, 0) >= 1
      return { video: useB ? inputs.background ?? video : video }
    }

    case 'Blur': {
      if (!video) return {}
      const s = await sharp()
      const radius = Math.max(0.3, num(p.radius, 5))
      const out = await s(video.rgba).blur(radius).png().toBuffer()
      return { video: { ...video, rgba: out } }
    }

    case 'Sharpen': {
      if (!video) return {}
      const s = await sharp()
      const sigma = num(p.radius, 1)
      const amount = num(p.amount, 0.5)
      const out = await s(video.rgba).sharpen({ sigma, m1: amount, m2: 0.5 }).png().toBuffer()
      return { video: { ...video, rgba: out } }
    }

    case 'Defocus': {
      if (!video) return {}
      const s = await sharp()
      const sigma = num(p.maxBlur, 20) / 4
      const out = await s(video.rgba).blur(sigma).png().toBuffer()
      return { video: { ...video, rgba: out, depth: inputs.depth?.depth ?? video.depth } }
    }

    case 'ColorCorrect':
    case 'Grade': {
      if (!video) return {}
      const gain = arr3(p.gain, [1, 1, 1])
      const gamma = arr3(p.gamma, [1, 1, 1])
      const sat = num(p.saturation, 1)
      const contrast = num(p.contrast, 1)
      const s = await sharp()
      let pipe = s(video.rgba)
      pipe = pipe.modulate({
        brightness: gain[0],
        saturation: sat,
      })
      if (contrast !== 1) {
        pipe = pipe.linear(contrast, -(128 * (contrast - 1)))
      }
      void gamma
      const out = await pipe.png().toBuffer()
      return { video: { ...video, rgba: out } }
    }

    case 'Saturation': {
      if (!video) return {}
      const s = await sharp()
      const out = await s(video.rgba)
        .modulate({ saturation: num(p.saturation, 1) })
        .png()
        .toBuffer()
      return { video: { ...video, rgba: out } }
    }

    case 'Invert': {
      if (!video) return {}
      const s = await sharp()
      const out = await s(video.rgba).negate({ alpha: false }).png().toBuffer()
      return { video: { ...video, rgba: out } }
    }

    case 'Crop': {
      if (!video) return {}
      const s = await sharp()
      const left = Math.round(num(p.left, 0))
      const top = Math.round(num(p.top, 0))
      const right = Math.round(num(p.right, 0))
      const bottom = Math.round(num(p.bottom, 0))
      const w = Math.max(1, video.width - left - right)
      const h = Math.max(1, video.height - top - bottom)
      const out = await s(video.rgba).extract({ left, top, width: w, height: h }).png().toBuffer()
      return { video: { width: w, height: h, rgba: out } }
    }

    case 'Flip': {
      if (!video) return {}
      const s = await sharp()
      let pipe = s(video.rgba)
      if (p.horizontal) pipe = pipe.flop()
      if (p.vertical) pipe = pipe.flip()
      const out = await pipe.png().toBuffer()
      return { video: { ...video, rgba: out } }
    }

    case 'Reformat': {
      if (!video) return {}
      const s = await sharp()
      const w = Math.round(num(p.width, 1920))
      const h = Math.round(num(p.height, 1080))
      const out = await s(video.rgba).resize(w, h, { fit: 'contain', background: '#000000' }).png().toBuffer()
      return { video: { width: w, height: h, rgba: out } }
    }

    case 'Background': {
      const s = await sharp()
      const w = 1920
      const h = 1080
      const colour = String(p.colour ?? '#000000')
      const out = await s({ create: { width: w, height: h, channels: 4, background: colour } })
        .png()
        .toBuffer()
      return { video: { width: w, height: h, rgba: out } }
    }

    case 'Cryptomatte': {
      const url = String(p.exrUrl ?? p.url ?? '')
      if (url) {
        const exr = await loadEXRFromURL(url)
        return { exr, depth: { width: exr.width, height: exr.height, rgba: Buffer.alloc(0), exr } }
      }
      return { exr: inputs.exr }
    }

    case 'DeepHold':
    case 'DepthMap':
      return { video, depth: inputs.depth ?? video }

    case 'LUT':
    case 'LUTNode':
    case 'Glow':
    case 'Grain':
    case 'FilmGrain':
    case 'ChromaticAberration':
    case 'MotionBlur':
    case 'Keyer':
    case 'LumaKeyer':
    case 'DifferenceKey':
    case 'SpillSuppress':
      return { video }

    case 'Roto':
    case 'Mask': {
      if (!video) return { video }
      const points = Array.isArray(p.points) ? propagateRoto(p.points as RotoPoint[], num(p.trackDx, 0), num(p.trackDy, 0)) : []
      const layers = Array.isArray(p.layers)
        ? (p.layers as RotoLayer[]).map((layer) => ({
            ...layer,
            points: propagateRoto(layer.points ?? [], num(p.trackDx, 0), num(p.trackDy, 0)),
          }))
        : undefined
      try {
        const decoded = await decodeRaw(video.rgba)
        const masked = applyRoto(
          decoded.data,
          decoded.width,
          decoded.height,
          points,
          p.combine === 'subtract' ? 'subtract' : 'add',
          {
            layers,
            spline: node.type === 'Roto' && p.spline !== false,
            motion: num(p.motionDx, 0) || num(p.motionDy, 0)
              ? { dx: num(p.motionDx, 0), dy: num(p.motionDy, 0) }
              : undefined,
          },
        )
        const png = await encodePng(masked, decoded.width, decoded.height)
        return { video: { ...video, width: decoded.width, height: decoded.height, rgba: png } }
      } catch (err) {
        console.warn('[compositor]', err instanceof Error ? err.message : err)
        return { video }
      }
    }

    case 'Particle': {
      if (!video) return { video }
      const decoded = await decodeRaw(video.rgba)
      const painted = applyParticles(decoded.data, decoded.width, decoded.height, num(p.rate, 40), num(p.seed, 1), {
        lifetime: num(p.lifetime, 1),
        forceY: num(p.forceY, 0),
        sprite: num(p.sprite, 1),
      })
      const png = await encodePng(painted, decoded.width, decoded.height)
      return { video: { ...video, width: decoded.width, height: decoded.height, rgba: png } }
    }

    case 'Layer3D':
    case 'Camera3D': {
      if (!video) return { video }
      const decoded = await decodeRaw(video.rgba)
      const shifted = applyLayer3D(decoded.data, decoded.width, decoded.height, {
        cameraX: num(p.cameraX ?? p.x, 0),
        cameraY: num(p.cameraY ?? p.y, 0),
        cameraZ: num(p.cameraZ ?? p.z, 1),
        depth: num(p.depth, 1),
        light: num(p.light, 1),
      })
      const png = await encodePng(shifted, decoded.width, decoded.height)
      return { video: { ...video, width: decoded.width, height: decoded.height, rgba: png } }
    }

    case 'VectorWarp': {
      if (!video) return { video }
      const decoded = await decodeRaw(video.rgba)
      const warped = applyVectorWarp(decoded.data, decoded.width, decoded.height, num(p.dx, 0), num(p.dy, 0))
      const png = await encodePng(warped, decoded.width, decoded.height)
      return { video: { ...video, width: decoded.width, height: decoded.height, rgba: png } }
    }

    case 'DeepMerge': {
      const front = inputs.foreground ?? video
      const back = inputs.background
      const frontZ = Array.isArray(p.frontZ) ? p.frontZ as number[] : null
      const backZ = Array.isArray(p.backZ) ? p.backZ as number[] : null
      if (!front || !back || !frontZ || !backZ) return { video, depth: inputs.depth ?? video }
      try {
        const frontRaw = await decodeRaw(front.rgba)
        const backRaw = await decodeRaw(back.rgba)
        const merged = deepMerge(frontRaw.data, backRaw.data, frontZ, backZ)
        const png = await encodePng(merged, frontRaw.width, frontRaw.height)
        return { video: { ...front, rgba: png, width: frontRaw.width, height: frontRaw.height } }
      } catch (err) {
        console.warn('[compositor]', err instanceof Error ? err.message : err)
        return { video, depth: inputs.depth ?? video }
      }
    }

    case 'OfxPlugin': {
      if (!video) return { video }
      try {
        const decoded = await decodeRaw(video.rgba)
        const hosted = runOfx(decoded.data, String(p.pluginId ?? ''), num(p.amount, 1), typeof p.script === 'string' ? p.script : undefined)
        if (hosted.error) {
          console.warn('[compositor]', hosted.error)
          return { video }
        }
        const png = await encodePng(hosted.rgba, decoded.width, decoded.height)
        return { video: { ...video, width: decoded.width, height: decoded.height, rgba: png } }
      } catch (err) {
        console.warn('[compositor]', err instanceof Error ? err.message : err)
        return { video }
      }
    }

    case 'Transform':
    case 'Tracker':
    case 'Tracker2D':
    case 'PlanarTracker':
    case 'CornerPin':
    case 'Premult':
    case 'Text3D':
    case 'TimeOffset':
    case 'Shuffle':
    case 'MixChannels':
    case 'Expression':
      return { video }

    default:
      return { video }
  }
}
