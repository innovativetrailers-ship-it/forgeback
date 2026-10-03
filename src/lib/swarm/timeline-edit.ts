import { falEndpoint } from '@cinema/core/endpoints'
import { runModel1 } from '../brain/model1'
import { EDIT_ANALYST_PROMPT, ART_DIRECTOR_PROMPT, QA_INSPECTOR_PROMPT } from './brain-prompts'
import { SwarmRouter } from './SwarmRouter'
import { runFal } from '../fal/client'
import { uploadToR2 } from '../storage/r2'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { TimelineEditRequest, ModelId, OutcomeTier } from './types'

const router = new SwarmRouter()

export async function executeTimelineEdit(req: TimelineEditRequest): Promise<{
  stitched_clip_url: string
  model_used: string
  reasoning: string
  quality_score: number
}> {
  // 1. Extract context frames around the edit region
  const [frameBefore, frameMid, frameAfter] = await Promise.all([
    extractFrame(req.clip_url, Math.max(0, req.start_time - 0.1)),
    extractFrame(req.clip_url, (req.start_time + req.end_time) / 2),
    extractFrame(req.clip_url, req.end_time + 0.1),
  ])

  // 2. Edit Analyst examines frames and instruction
  const analysisResponse = await runModel1({
    systemPrompt: EDIT_ANALYST_PROMPT,
    userMessage: `Instruction: "${req.user_instruction}"\nEdit region: ${req.start_time}s → ${req.end_time}s (${(req.end_time - req.start_time).toFixed(1)}s duration)`,
    images: [frameBefore, frameMid, frameAfter],
    requireJSON: true,
  })
  const analysis = JSON.parse(analysisResponse.content)

  // 3. Art Director enhances the repair prompt for the optimal model
  const shotForEnhancement = {
    description: analysis.what_user_wants,
    scene_category: analysis.scene_category,
    shot_type: 'MS',
    camera_motion: 'static',
    mood: 'neutral',
    has_text_in_frame: false,
    has_human_primary: true,
    has_fluid_physics: false,
    has_audio_requirement: false,
    duration_seconds: req.end_time - req.start_time,
  } as Parameters<typeof router.enhancePrompt>[0]

  const enhancedPrompt = await router.enhancePrompt(shotForEnhancement, analysis.optimal_model as ModelId)

  // 4. Execute V2V with frame anchors
  const repaintedUrl = await router.callModel(analysis.optimal_model as ModelId, enhancedPrompt, {
    ...shotForEnhancement,
    shot_id: `edit_${req.clip_id}`,
    sequence_index: 0,
    secondary_categories: [],
    has_human_background: false,
    has_fire_explosion: false,
    has_animal: false,
    has_crowd: false,
    has_dialogue: false,
    has_vehicle: false,
    is_hero_shot: false,
    is_long_form: false,
    character_ids: req.character_ids ?? [],
    reference_image_count: 2,
    prompt_raw: req.user_instruction,
    prompt_enhanced: enhancedPrompt,
    assigned_model: analysis.optimal_model,
    estimated_cost_credits: 0,
    requires_post_lipsync: false,
    requires_face_enhance: analysis.requires_face_enhance ?? false,
    requires_relight: false,
    stitch_config: { transition: 'dissolve', duration_ms: 150, motion_match: false, colour_match: analysis.colour_match_needed ?? true },
  })

  // 5. Optional CodeFormer face pass
  let finalRepaintedUrl = repaintedUrl
  if (analysis.requires_face_enhance) {
    const enhanced = await runFal(falEndpoint('codeformer'), { image_url: repaintedUrl, fidelity: 0.75 }) as { image?: { url: string } }
    finalRepaintedUrl = enhanced.image?.url ?? repaintedUrl
  }

  // 6. FFmpeg stitch — splice repainted segment back into original
  const stitchedUrl = await stitchSegment(req.clip_url, finalRepaintedUrl, req.start_time, req.end_time)

  // 7. QA check on stitched output
  const qaFrame = await extractFrame(stitchedUrl, req.start_time + (req.end_time - req.start_time) / 2)
  const qaResponse = await runModel1({
    systemPrompt: QA_INSPECTOR_PROMPT,
    userMessage: `Original instruction: "${req.user_instruction}"\nPrompt used: "${enhancedPrompt}"`,
    images: [qaFrame],
    requireJSON: true,
  })
  const qa = JSON.parse(qaResponse.content)

  return {
    stitched_clip_url: stitchedUrl,
    model_used: analysis.optimal_model,
    reasoning: analysis.reasoning,
    quality_score: qa.quality_score,
  }
}

export async function analyseTimelineEdit(req: Omit<TimelineEditRequest, 'project_id' | 'clip_id'>): Promise<{
  model: string
  reasoning: string
  enhanced_instruction: string
}> {
  const [frameBefore, frameMid, frameAfter] = await Promise.all([
    extractFrame(req.clip_url, Math.max(0, req.start_time - 0.1)),
    extractFrame(req.clip_url, (req.start_time + req.end_time) / 2),
    extractFrame(req.clip_url, req.end_time + 0.1),
  ])

  const analysisResponse = await runModel1({
    systemPrompt: EDIT_ANALYST_PROMPT,
    userMessage: `Instruction: "${req.user_instruction}"\nEdit region: ${req.start_time}s → ${req.end_time}s`,
    images: [frameBefore, frameMid, frameAfter],
    requireJSON: true,
  })
  const analysis = JSON.parse(analysisResponse.content)

  return {
    model: analysis.optimal_model,
    reasoning: analysis.reasoning,
    enhanced_instruction: analysis.enhanced_instruction,
  }
}

async function stitchSegment(
  originalUrl: string,
  repaintedUrl: string,
  startTime: number,
  endTime: number
): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cinema-edit-'))
  const origPath = path.join(tmp, 'orig.mp4')
  const repPath  = path.join(tmp, 'rep.mp4')
  const outPath  = path.join(tmp, 'out.mp4')

  await Promise.all([downloadFile(originalUrl, origPath), downloadFile(repaintedUrl, repPath)])

  await new Promise<void>((res, rej) => {
    ffmpeg()
      .input(origPath).input(repPath).input(origPath)
      .complexFilter([
        `[0:v]trim=0:${startTime},setpts=PTS-STARTPTS[a]`,
        `[0:a]atrim=0:${startTime},asetpts=PTS-STARTPTS[aa]`,
        `[1:v]setpts=PTS-STARTPTS[b]`,
        `[1:a]asetpts=PTS-STARTPTS[ba]`,
        `[2:v]trim=${endTime},setpts=PTS-STARTPTS[c]`,
        `[2:a]atrim=${endTime},asetpts=PTS-STARTPTS[ca]`,
        `[a][b]xfade=transition=dissolve:duration=0.15:offset=${Math.max(0, startTime - 0.15).toFixed(3)}[ab]`,
        `[ab][c]xfade=transition=dissolve:duration=0.15:offset=${(endTime - 0.15).toFixed(3)}[out]`,
        `[aa][ba]acrossfade=d=0.15[aab]`,
        `[aab][ca]acrossfade=d=0.15[aout]`,
      ])
      .outputOptions(['-map', '[out]', '-map', '[aout]', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac'])
      .output(outPath)
      .on('end', () => res())
      .on('error', rej)
      .run()
  })

  const buffer = await fs.readFile(outPath)
  const url = await uploadToR2(buffer, `edits/${Date.now()}.mp4`, 'video/mp4')
  await fs.rm(tmp, { recursive: true, force: true })
  return url
}

async function extractFrame(videoUrl: string, timestamp: number): Promise<string> {
  const { extractVideoFrame } = await import('@/lib/fal/frameExtract')
  try {
    return await extractVideoFrame(videoUrl, { timestamp })
  } catch (err) {
    console.warn("[caught] src/lib/swarm/timeline-edit.ts:177", err instanceof Error ? { name: err.name, message: err.message } : err)

    return videoUrl
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const resp = await fetch(url)
  await fs.writeFile(dest, Buffer.from(await resp.arrayBuffer()))
}
