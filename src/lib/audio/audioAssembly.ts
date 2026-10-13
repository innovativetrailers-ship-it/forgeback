import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db } from '@/lib/db'
import { exec, probeDurationSec, probeHasAudioStream } from '@/lib/media/ffmpegExec'
import { downloadToTmp } from '@/lib/media/download'
import { uploadToR2 } from '@/lib/storage/r2'

function dbToAmplitude(db: number): number {
  return Math.pow(10, db / 20)
}

export interface AudioAssemblyOpts {
  projectId: string
  videoPath: string
  shotOffsets: Map<string, number>
  outputPath?: string
  jobId?: string
}

export async function assembleAudio(opts: AudioAssemblyOpts): Promise<string> {
  const tracks = await db.audioTrack.findMany({
    where: {
      projectId: opts.projectId,
      status: 'READY',
      muted: false,
      url: { not: null },
    },
  })

  const work = mkdtempSync(join(tmpdir(), 'forge-mix-'))
  const outPath = opts.outputPath ?? join(work, 'mixed.mp4')

  const videoDur = await probeDurationSec(opts.videoPath)
  const hasVidAud = await probeHasAudioStream(opts.videoPath)

  if (!tracks.length && !hasVidAud) {
    await exec('ffmpeg', ['-i', opts.videoPath, '-c', 'copy', '-y', outPath])
    return uploadMixed(outPath, opts.jobId)
  }

  const local = await Promise.all(tracks.map(async (t) => ({
    track: t,
    path: await downloadToTmp(t.url!, t.type === 'DIALOGUE' ? 'mp3' : 'mp3'),
  })))

  const inputs: string[] = ['-i', opts.videoPath]
  const filters: string[] = []
  const dialogueLabels: string[] = []
  const duckedLabels: string[] = []
  const plainLabels: string[] = []

  let idx = 1
  for (const { track: t, path } of local) {
    inputs.push('-i', path)
    const label = `t${idx}`
    const start = t.startSec ?? (t.shotPlanId ? opts.shotOffsets.get(t.shotPlanId) ?? 0 : 0)
    const delayMs = Math.round(start * 1000)

    const chain = [
      `[${idx}:a]`,
      delayMs > 0 ? `adelay=${delayMs}:all=1,` : '',
      t.fadeInMs ? `afade=t=in:st=0:d=${t.fadeInMs / 1000},` : '',
      t.fadeOutMs && t.durationMs
        ? `afade=t=out:st=${(t.durationMs - t.fadeOutMs) / 1000}:d=${t.fadeOutMs / 1000},` : '',
      `volume=${dbToAmplitude(t.volumeDb)}`,
      `[${label}]`,
    ].join('')
    filters.push(chain)

    if (t.type === 'DIALOGUE') dialogueLabels.push(`[${label}]`)
    else if (t.duckUnderDialogue) duckedLabels.push(`[${label}]`)
    else plainLabels.push(`[${label}]`)
    idx++
  }

  if (hasVidAud) plainLabels.push('[0:a]')

  let dlgBus: string | null = null
  if (dialogueLabels.length) {
    dlgBus = '[dlg]'
    filters.push(`${dialogueLabels.join('')}amix=inputs=${dialogueLabels.length}:normalize=0[dlg]`)
  }

  let bedBus: string | null = null
  if (duckedLabels.length) {
    filters.push(`${duckedLabels.join('')}amix=inputs=${duckedLabels.length}:normalize=0[bedraw]`)
    if (dlgBus) {
      filters.push(`${dlgBus}asplit=2[dlgmix][dlgkey]`)
      filters.push('[bedraw][dlgkey]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[bed]')
      dlgBus = '[dlgmix]'
      bedBus = '[bed]'
    } else {
      bedBus = '[bedraw]'
    }
  }

  const master = [dlgBus, bedBus, ...plainLabels].filter(Boolean) as string[]

  if (master.length === 0) {
    await exec('ffmpeg', ['-i', opts.videoPath, '-c', 'copy', '-y', outPath])
    return uploadMixed(outPath, opts.jobId)
  }

  filters.push(
    `${master.join('')}amix=inputs=${master.length}:normalize=0:dropout_transition=2,` +
    `apad,atrim=duration=${videoDur},alimiter=limit=0.95[aout]`,
  )

  await exec('ffmpeg', [
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-y', outPath,
  ])

  return uploadMixed(outPath, opts.jobId)
}

async function uploadMixed(outPath: string, jobId?: string): Promise<string> {
  const buf = readFileSync(outPath)
  const key = jobId ? `films/${jobId}/final-mixed.mp4` : `films/mixed/${Date.now()}.mp4`
  return uploadToR2(buf, key, 'video/mp4')
}

/** Legacy wrapper for URL-based video input. */
export async function assembleAudioFromUrl(input: {
  projectId: string
  videoUrl: string
  shotOffsets: Map<string, number>
  jobId?: string
}): Promise<string> {
  const videoPath = await downloadToTmp(input.videoUrl, 'mp4')
  return assembleAudio({
    projectId: input.projectId,
    videoPath,
    shotOffsets: input.shotOffsets,
    jobId: input.jobId,
  })
}
