import { runwayDuration } from '@cinema/core'
import { assertGenerationNotPaused } from '@/lib/generation/pause'
import type { GenerateVideoInput, GenerateVideoOutput } from '@/lib/models/types'
import type { ModelDef } from '@/lib/models/resolve'
import type { SubProgressFn } from '@/lib/orchestration/types'

function runwayApiKey(): string {
  const key = process.env.RUNWAYML_API_SECRET ?? process.env.RUNWAY_API_KEY
  if (!key) {
    throw new Error('Runway requires RUNWAYML_API_SECRET or RUNWAY_API_KEY')
  }
  return key
}

async function pollRunwayJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  taskId: string,
  onSubProgress?: SubProgressFn,
): Promise<string> {
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const task = await client.tasks.retrieve(taskId)
    if (task.status === 'RUNNING') {
      const pct = Math.round((task.progress ?? 0.5) * 100)
      onSubProgress?.({ pct, message: `Runway rendering ${pct}%`, vendor: 'runway' })
    } else if (task.status === 'PENDING') {
      onSubProgress?.({ pct: 0, message: 'Runway queued', vendor: 'runway' })
    } else if (task.status === 'SUCCEEDED') {
      onSubProgress?.({ pct: 100, message: 'Runway complete', vendor: 'runway' })
      const url = task.output?.[0]
      if (!url) throw new Error('Runway returned no video URL')
      return url
    } else if (task.status === 'FAILED') {
      throw new Error(`Runway failed: ${task.failure ?? 'unknown'}`)
    }
  }
  throw new Error('Runway timed out after 15 min')
}

type RunwayRatio = '1280:720' | '720:1280' | '960:960'

function mapAspectRatio(aspectRatio?: string): RunwayRatio {
  if (aspectRatio === '9:16' || aspectRatio === '720:1280') return '720:1280'
  if (aspectRatio === '1:1' || aspectRatio === '960:960') return '960:960'
  return '1280:720'
}

function useGen45(endpoint: string | undefined): boolean {
  return endpoint === 'gen4.5' || endpoint === 'runway-gen4.5'
}

export interface RunwayVideoParams {
  prompt: string
  duration: number
  imageUrl?: string
  aspectRatio?: string
  existingTaskId?: string
  onTaskId?: (taskId: string) => Promise<void>
  onSubProgress?: SubProgressFn
}

export async function runwayVideo(
  model: ModelDef,
  params: RunwayVideoParams,
): Promise<string> {
  assertGenerationNotPaused(`runway:${model.id}`)
  const RunwayML = (await import('@runwayml/sdk')).default
  const client = new RunwayML({ apiKey: runwayApiKey() })
  const ratio = mapAspectRatio(params.aspectRatio)
  const gen45 = useGen45(model.falEndpoint)
  // Gen-4.5 fields are promptText, duration, ratio, seed, contentModeration, and promptImage on image-to-video.
  // There is no camera or motion-brush parameter. Camera direction is the Camera sentence in promptText.

  if (params.existingTaskId) {
    return pollRunwayJob(client, params.existingTaskId, params.onSubProgress)
  }

  const submitted = params.imageUrl && !gen45 ? 'gen4_turbo' : 'gen4.5'
  const duration = runwayDuration(params.duration, submitted)

  if (params.imageUrl) {
    const task = gen45
      ? await client.imageToVideo.create({
          model: 'gen4.5',
          promptText: params.prompt,
          promptImage: params.imageUrl,
          duration,
          ratio,
        })
      : await client.imageToVideo.create({
          model: 'gen4_turbo',
          promptText: params.prompt,
          promptImage: params.imageUrl,
          duration,
          ratio,
        })
    await params.onTaskId?.(task.id)
    return pollRunwayJob(client, task.id, params.onSubProgress)
  }

  const task = gen45
    ? await client.textToVideo.create({
        model: 'gen4.5',
        promptText: params.prompt,
        duration,
        ratio: ratio === '960:960' ? '1280:720' : ratio,
      })
    : await client.textToVideo.create({
        model: 'gen4.5',
        promptText: params.prompt,
        duration,
        ratio: ratio === '960:960' ? '1280:720' : ratio,
      })
  await params.onTaskId?.(task.id)
  return pollRunwayJob(client, task.id, params.onSubProgress)
}

type I2VRatio = '1280:720' | '720:1280' | '1104:832' | '832:1104' | '960:960' | '1584:672'
type T2VRatio = '1280:720' | '720:1280'

function mapI2VRatio(ratio?: string): I2VRatio {
  const map: Record<string, I2VRatio> = {
    '16:9': '1280:720',
    '9:16': '720:1280',
    '4:3': '1104:832',
    '3:4': '832:1104',
    '1:1': '960:960',
  }
  return map[ratio ?? '16:9'] ?? '1280:720'
}

function mapT2VRatio(ratio?: string): T2VRatio {
  return ratio === '9:16' ? '720:1280' : '1280:720'
}

async function getRunwayClient() {
  const RunwayML = (await import('@runwayml/sdk')).default
  return new RunwayML({ apiKey: runwayApiKey() })
}

/** Create-only. Poll an existing task with pollStatus — do not submit again. */
export async function generateVideo(
  input: GenerateVideoInput,
): Promise<GenerateVideoOutput> {
  assertGenerationNotPaused('runway:generateVideo')
  const client = await getRunwayClient()
  const submitted = input.startFrameUrl ? 'gen4_turbo' : 'gen4.5'
  const duration = runwayDuration(input.duration, submitted)

  if (input.startFrameUrl) {
    const task = await client.imageToVideo.create({
      model: 'gen4_turbo',
      promptText: input.prompt,
      promptImage: input.startFrameUrl,
      duration,
      ratio: mapI2VRatio(input.aspectRatio),
    })
    return { jobId: task.id, status: 'pending' }
  }

  const task = await client.textToVideo.create({
    model: 'gen4.5',
    promptText: input.prompt,
    duration,
    ratio: mapT2VRatio(input.aspectRatio),
  })
  return { jobId: task.id, status: 'pending' }
}

function taskFailureMessage(task: { status: string; failure?: string; failureCode?: string }): string {
  return task.failure ?? task.failureCode ?? 'Runway generation failed'
}

/** Poll an existing Runway task. Does not create a new job. */
export async function pollStatus(
  externalJobId: string,
): Promise<GenerateVideoOutput> {
  const client = await getRunwayClient()

  for (let i = 0; i < 300; i++) {
    const task = await client.tasks.retrieve(externalJobId)

    if (task.status === 'SUCCEEDED') {
      return {
        jobId: externalJobId,
        status: 'complete',
        videoUrl: task.output?.[0],
      }
    }

    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      return {
        jobId: externalJobId,
        status: 'failed',
        error: taskFailureMessage(task),
      }
    }

    await new Promise((r) => setTimeout(r, 3000))
  }

  return { jobId: externalJobId, status: 'processing' }
}
