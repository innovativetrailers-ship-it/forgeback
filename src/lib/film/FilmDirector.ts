import { runModel1 } from '../brain/model1'
import { callCouncil } from '../brain/council'
import { ShotListRouter } from '../routing/ShotListRouter'
import { LongFormOrchestrator } from '../swarm/LongFormOrchestrator'
import { db } from '../db'
import { uploadToR2 } from '../storage/r2'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import path from 'path'
import os from 'os'

export interface ParsedScript {
  title: string
  total_scenes: number
  acts: ParsedAct[]
}

interface ParsedAct { number: number; scenes: ParsedScene[] }
interface ParsedScene {
  number: string
  heading: string
  int_ext: string
  location: string
  time_of_day: string
  action: string
  characters: string[]
  dialogue: Array<{ character: string; parenthetical: string | null; line: string }>
  estimated_duration_seconds: number
}
interface LocalFilmScene { heading: string; actionLines: string; characterIds: string[]; dialogue: unknown }
interface Shot { shot_id?: string; sequence_index?: number; duration_seconds: number }

export class FilmDirector {
  private router = new ShotListRouter()
  private longForm = new LongFormOrchestrator()

  async parseFountainScript(fountainText: string): Promise<ParsedScript> {
    const response = await runModel1({
      systemPrompt: `You are a professional script supervisor. Parse this Fountain-format screenplay into structured JSON.
Return: {
  "title": string,
  "total_scenes": number,
  "acts": [{ "number": 1, "scenes": [{ "number": "1", "heading": "INT. LOCATION - TIME", "int_ext": "INT|EXT", "location": string, "time_of_day": "DAY|NIGHT|DAWN|DUSK", "action": string, "characters": [string], "dialogue": [{"character": string, "parenthetical": string|null, "line": string}], "estimated_duration_seconds": number }] }]
}`,
      userMessage: fountainText,
      requireJSON: true,
      useAgenticLoop: true,
    })

    return JSON.parse(response.content)
  }

  async generateShotList(scene: LocalFilmScene, castMembers: unknown[]): Promise<Shot[]> {
    const response = await runModel1({
      systemPrompt: `You are a film director breaking down a scene into shots. Generate a professional shot list.
For each shot include: shot_type (ECU/CU/MS/WS/EWS/POV/OTS), camera_movement, description, duration_seconds, scene_category (from the swarm routing matrix).
Return JSON array of shots.`,
      userMessage: `Scene: ${scene.heading}\n\nAction: ${scene.actionLines}\n\nCharacters: ${scene.characterIds.join(', ')}\n\nDialogue: ${JSON.stringify(scene.dialogue)}`,
      requireJSON: true,
    })

    return JSON.parse(response.content)
  }

  async produceAct(params: {
    filmProjectId: string
    actId: string
    tier: 'Draft' | 'Studio' | 'Blockbuster'
    userId: string
  }): Promise<string> {
    const act = await db.act.findUnique({
      where: { id: params.actId },
      include: { sequences: { include: { scenes: true } } },
    })
    if (!act) throw new Error('Act not found')

    const allScenes = act.sequences.flatMap(seq => seq.scenes)

    const allShots = await Promise.all(
      allScenes.map(scene => this.generateShotList({
        heading: scene.heading,
        actionLines: scene.actionLines,
        characterIds: scene.characterIds,
        dialogue: scene.dialogue,
      }, []))
    )

    const flatShots = allShots.flat().map((shot, i) => ({
      ...shot,
      shot_id: `shot_${String(i + 1).padStart(4, '0')}`,
      sequence_index: i + 1,
    }))

    const shotList = {
      project_id: params.filmProjectId,
      tier: params.tier,
      total_duration_seconds: flatShots.reduce((s, sh) => s + sh.duration_seconds, 0),
      shots: flatShots,
      estimated_total_credits: 0,
      model_distribution: {},
      cost_breakdown: {},
    }

    return this.longForm.renderLongForm({
      shotList: shotList as Parameters<typeof this.longForm.renderLongForm>[0]['shotList'],
      userId: params.userId,
      projectId: params.filmProjectId,
    })
  }

  async produceFullFilm(params: {
    filmProjectId: string
    tier: 'Draft' | 'Studio' | 'Blockbuster'
    userId: string
  }): Promise<string> {
    const film = await db.filmProject.findUnique({
      where: { id: params.filmProjectId },
      include: { acts: { include: { sequences: { include: { scenes: true } } } } },
    })
    if (!film) throw new Error('Film project not found')

    const actUrls: string[] = []
    for (const act of film.acts.sort((a, b) => a.number - b.number)) {
      const actUrl = await this.produceAct({
        filmProjectId: params.filmProjectId,
        actId: act.id,
        tier: params.tier,
        userId: params.userId,
      })
      actUrls.push(actUrl)
    }

    return this.assembleActs(actUrls, film.title)
  }

  private async assembleActs(actUrls: string[], title: string): Promise<string> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cinema-film-'))
    const listPath = path.join(tmp, 'acts.txt')
    const outPath = path.join(tmp, 'final_film.mp4')

    const localPaths: string[] = []
    for (let i = 0; i < actUrls.length; i++) {
      const p = path.join(tmp, `act_${i + 1}.mp4`)
      const resp = await fetch(actUrls[i])
      if (!resp.body) throw new Error(`Failed to download act ${i + 1}`)
      await pipeline(resp.body as unknown as NodeJS.ReadableStream, createWriteStream(p))
      localPaths.push(p)
    }

    const concatContent = localPaths.map(p => `file '${p}'`).join('\n')
    await fs.writeFile(listPath, concatContent)
    const { runArgv } = await import('@/lib/shell/argv')
    runArgv('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath])

    const buffer = await fs.readFile(outPath)
    const key = `films/${title.replace(/\s+/g, '_')}_${Date.now()}.mp4`
    const url = await uploadToR2(buffer, key, 'video/mp4')
    await fs.rm(tmp, { recursive: true, force: true })
    return url
  }
}
