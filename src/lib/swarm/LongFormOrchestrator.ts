import { runFal } from '../fal/client'
import { SwarmRouter } from './SwarmRouter'
import { SeamlessBlender } from './SeamlessBlender'
import { redis, channelKey } from '../redis'
import { uploadToR2 } from '../storage/r2'
import { writeFile as fsWriteFile } from 'fs/promises'
import { mkdtemp, writeFile, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { ShotList, SwarmResult, Shot } from './types'

interface ContinuityContext {
  establishedCharacters: Array<{
    characterId: string
    lastSeenModelUsed: string
    lastSeenUrl: string
    lastSeenFrame: string
    appearance: string
  }>
  establishedLocations: Array<{
    locationId: string
    lastSeenUrl: string
    lightingCondition: string
  }>
  lastShotDescription: string
  cumulativeMood: string
  narrativeAct: 'setup' | 'confrontation' | 'resolution'
}

export class LongFormOrchestrator {
  private router = new SwarmRouter()
  private blender = new SeamlessBlender()

  async renderLongForm(params: {
    shotList: ShotList
    userId: string
    projectId: string
    batchSize?: number
  }): Promise<string> {
    const { shotList, userId, projectId, batchSize = 12 } = params
    const shots = shotList.shots
    const batches: Shot[][] = []

    for (let i = 0; i < shots.length; i += batchSize) {
      batches.push(shots.slice(i, i + batchSize))
    }

    await redis.publish(channelKey(`swarm:${projectId}`), JSON.stringify({
      event: 'longform_start',
      total_shots: shots.length,
      total_batches: batches.length,
      batches: batches.map((b, i) => ({ batch: i + 1, shots: b.length })),
    }))

    const batchUrls: string[] = []
    let continuityContext: ContinuityContext = {
      establishedCharacters: [],
      establishedLocations: [],
      lastShotDescription: '',
      cumulativeMood: 'neutral',
      narrativeAct: 'setup',
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const enrichedBatch = await this.enrichWithContinuity(batch, continuityContext)

      await redis.publish(channelKey(`swarm:${projectId}`), JSON.stringify({
        event: 'batch_start', batch: i + 1, of: batches.length, shots: batch.length,
      }))

      const batchList: ShotList = {
        ...shotList,
        shots: enrichedBatch,
        total_duration_seconds: enrichedBatch.reduce((s, sh) => s + sh.duration_seconds, 0),
      }

      const batchResults = await this.router.dispatch({
        shotList: batchList,
        userId,
        projectId,
        onShotComplete: (r) => {
          redis.publish(channelKey(`swarm:${projectId}`), JSON.stringify({
            event: 'shot_complete', batch: i + 1, shot_id: r.shot_id,
          })).catch((err) => {
            console.warn("[caught] src/lib/swarm/LongFormOrchestrator.ts:85", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
        },
      })

      const batchUrl = await this.blender.blend({
        results: batchResults,
        shots: enrichedBatch,
        applyHouseLook: true,
      })
      batchUrls.push(batchUrl)

      continuityContext = await this.updateContinuityContext(batchResults, enrichedBatch, continuityContext)

      await redis.publish(channelKey(`swarm:${projectId}`), JSON.stringify({
        event: 'batch_complete', batch: i + 1, of: batches.length, url: batchUrl,
      }))
    }

    const finalUrl = await this.stitchBatches(batchUrls, projectId)

    await redis.publish(channelKey(`swarm:${projectId}`), JSON.stringify({
      event: 'longform_complete', url: finalUrl,
    }))

    return finalUrl
  }

  private async enrichWithContinuity(shots: Shot[], context: ContinuityContext): Promise<Shot[]> {
    return shots.map(shot => {
      let enrichedPrompt = shot.prompt_enhanced ?? shot.description

      shot.character_ids.forEach(charId => {
        const lastSeen = context.establishedCharacters.find(c => c.characterId === charId)
        if (lastSeen) {
          enrichedPrompt += `\n[CONTINUITY: Character appearance must match — ${lastSeen.appearance}]`
        }
      })

      if (shot.location_id) {
        const lastLoc = context.establishedLocations.find(l => l.locationId === shot.location_id)
        if (lastLoc) {
          enrichedPrompt += `\n[CONTINUITY: Location lighting = ${lastLoc.lightingCondition}, match previous shot aesthetic]`
        }
      }

      return { ...shot, prompt_enhanced: enrichedPrompt }
    })
  }

  private async updateContinuityContext(
    results: SwarmResult[],
    shots: Shot[],
    prev: ContinuityContext
  ): Promise<ContinuityContext> {
    const newContext = { ...prev }
    const lastShot = shots[shots.length - 1]
    const lastResult = results.find(r => r.shot_id === lastShot.shot_id)

    if (lastResult) {
      newContext.lastShotDescription = lastShot.description
      try {
        const { extractVideoFrame } = await import('@/lib/fal/frameExtract')
        const lastFrame = await extractVideoFrame(lastResult.output_url, { frameType: 'last' }).catch(
          (err) => {
          console.warn("[caught] src/lib/swarm/LongFormOrchestrator.ts:147", err instanceof Error ? { name: err.name, message: err.message } : err)
          return lastResult.output_url
        })

        lastShot.character_ids.forEach(charId => {
          const existing = newContext.establishedCharacters.findIndex(c => c.characterId === charId)
          const record = {
            characterId: charId,
            lastSeenModelUsed: lastResult.model_used,
            lastSeenUrl: lastResult.output_url,
            lastSeenFrame: lastFrame,
            appearance: lastShot.description,
          }
          if (existing >= 0) newContext.establishedCharacters[existing] = record
          else newContext.establishedCharacters.push(record)
        })

        if (lastShot.location_id) {
          const locIdx = newContext.establishedLocations.findIndex(l => l.locationId === lastShot.location_id)
          const locRecord = {
            locationId: lastShot.location_id!,
            lastSeenUrl: lastResult.output_url,
            lightingCondition: lastShot.mood,
          }
          if (locIdx >= 0) newContext.establishedLocations[locIdx] = locRecord
          else newContext.establishedLocations.push(locRecord)
        }
      } catch (err) {
        console.warn("[caught] src/lib/swarm/LongFormOrchestrator.ts:174", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* continuity degrades gracefully */ }
    }

    return newContext
  }

  private async stitchBatches(batchUrls: string[], projectId: string): Promise<string> {
    const tmp = await mkdtemp(join(tmpdir(), 'cinema-longform-'))
    const listPath = join(tmp, 'concat.txt')
    const outputPath = join(tmp, 'final.mp4')

    const localPaths: string[] = []
    for (let i = 0; i < batchUrls.length; i++) {
      const p = join(tmp, `batch_${i}.mp4`)
      const resp = await fetch(batchUrls[i])
      await fsWriteFile(p, Buffer.from(await resp.arrayBuffer()))
      localPaths.push(p)
    }

    const concatContent = localPaths.map(p => `file '${p}'`).join('\n')
    await writeFile(listPath, concatContent)

    const { default: ffmpeg } = await import('fluent-ffmpeg')
    await new Promise<void>((res, rej) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', () => res())
        .on('error', rej)
        .run()
    })

    const fileBuffer = await readFile(outputPath)
    const finalUrl = await uploadToR2(fileBuffer, `longform/${projectId}_${Date.now()}.mp4`, 'video/mp4')
    await rm(tmp, { recursive: true, force: true })
    return finalUrl
  }
}
