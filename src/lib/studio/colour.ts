import { uploadToR2 } from '../storage/r2'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { FILM_EMULATION_LUTS } from './filmLuts'

export { FILM_EMULATION_LUTS } from './filmLuts'

export async function applyLUT(params: {
  videoUrl: string
  lutUrl: string
  intensity: number
}): Promise<{ outputUrl: string }> {
  const { videoUrl, lutUrl, intensity } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/lut-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    // Download .cube LUT file
    const lutBuf = Buffer.from(await (await fetch(lutUrl)).arrayBuffer())
    const lutPath = join(tmpDir, 'grade.cube')
    writeFileSync(lutPath, lutBuf)

    const outputPath = join(tmpDir, 'graded.mp4')

    // Apply LUT with intensity blend using FFmpeg lut3d + hue/sat/brightness
    if (intensity < 1.0) {
      // Blend original + graded
      execSync(
        `ffmpeg -i "${videoUrl}" -vf "split[orig][graded];[graded]lut3d='${lutPath}'[graded_out];[orig][graded_out]blend=all_expr='A*${(1 - intensity).toFixed(3)}+B*${intensity.toFixed(3)}'" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y 2>/dev/null`
      )
    } else {
      execSync(
        `ffmpeg -i "${videoUrl}" -vf "lut3d='${lutPath}'" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y 2>/dev/null`
      )
    }

    const buffer = execSync(`cat "${outputPath}"`)
    const outputUrl = await uploadToR2(buffer, `colour/${jobId}_lut.mp4`, 'video/mp4')
    return { outputUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function applyASCCDL(params: {
  videoUrl: string
  lift: [number, number, number]
  gamma: [number, number, number]
  gain: [number, number, number]
  saturation: number
}): Promise<{ outputUrl: string }> {
  const { videoUrl, lift, gamma, gain, saturation } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/cdl-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const outputPath = join(tmpDir, 'cdl.mp4')

    // Build FFmpeg colorgrade filter chain
    const [lr, lg, lb] = lift
    const [gr, gg, gb] = gamma
    const [gnr, gng, gnb] = gain

    // ASC CDL formula: out = (in * gain + lift) ^ (1/gamma)
    // FFmpeg curves filter approximates this
    const colorchannelFilter = `colorchannelmixer=rr=${gnr}:gg=${gng}:bb=${gnb}`
    const brightnessFilter = `eq=brightness=${((lr + lg + lb) / 3).toFixed(4)}:saturation=${saturation}`
    const gammaFilter = `eq=gamma=${((gr + gg + gb) / 3).toFixed(4)}`

    execSync(
      `ffmpeg -i "${videoUrl}" -vf "${colorchannelFilter},${brightnessFilter},${gammaFilter}" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y 2>/dev/null`
    )

    const buffer = execSync(`cat "${outputPath}"`)
    const outputUrl = await uploadToR2(buffer, `colour/${jobId}_cdl.mp4`, 'video/mp4')
    return { outputUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function applyFilmEmulation(
  videoUrl: string,
  preset: keyof typeof FILM_EMULATION_LUTS | string,
  intensity: number,
): Promise<{ outputUrl: string }> {
  const lutPath = FILM_EMULATION_LUTS[preset] ?? FILM_EMULATION_LUTS.kodak_5219
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const lutUrl = lutPath.startsWith('http') ? lutPath : `${base}${lutPath}`
  return applyLUT({ videoUrl, lutUrl, intensity })
}

export async function applyColourCorrection(params: {
  videoUrl: string
  shadows?: number
  midtones?: number
  highlights?: number
  temperature?: number
  tint?: number
}): Promise<{ outputUrl: string }> {
  const lift = (params.shadows ?? 0) * 0.1
  const gain = 1 + (params.highlights ?? 0) * 0.1
  const gamma = 1 + (params.midtones ?? 0) * 0.05
  const sat = 1 + (params.tint ?? 0) * 0.05
  return applyASCCDL({
    videoUrl: params.videoUrl,
    lift: [lift, lift, lift],
    gamma: [gamma, gamma, gamma],
    gain: [gain, gain, gain],
    saturation: sat,
  })
}
