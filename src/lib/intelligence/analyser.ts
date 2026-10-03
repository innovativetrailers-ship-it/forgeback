/**
 * ModelIntelligenceAnalyser
 *
 * Runs the probe battery against models, assesses outputs using cheap crew
 * (Claude Haiku for text, fal.ai frame extraction for vision), and writes
 * structured intelligence reports stored in the intelligence domain.
 */


import { intelligenceDb, callDomainLLM, pushIntelligenceSignal } from '../firewall/domain-guard'
import { assertIntelligenceProbesAllowed } from './guards'
import type { ProbeSet, RawProbeResult, RawProbeResults, ModelIntelligenceReport } from './report-schema'
import { OUTPUT_ASSESSMENT_PROMPT, buildReportPrompt } from './crew'
import {
  generateSeedance20,
  generateVeo3,
  generateKling30,
  generateRunway,
  generateSkyReels,
  generateLTXSwarm,
  generateWan22,
  generateMochi,
} from '../models/index'
import type { OutcomeTier } from '../routing/types'

type ProbePayload = { prompt: string; duration: number; aspectRatio: '16:9' }

// Map model IDs to generate functions
const MODEL_DISPATCH: Record<string, (p: ProbePayload) => Promise<string>> = {
  veo_3_1:        (p) => generateVeo3(p),
  kling_3_0:      (p) => generateKling30(p),
  seedance_2_0:   (p) => generateSeedance20(p),
  runway_gen4_5:  (p) => generateRunway(p),
  skyreels_v1:    (p) => generateSkyReels({ prompt: p.prompt, duration: p.duration, aspectRatio: p.aspectRatio }),
  ltx_2_3:        (p) => generateLTXSwarm(p),
  wan_2_6:        (p) => generateWan22(p),
  mochi_1:        (p) => generateMochi(p),
}

export class ModelIntelligenceAnalyser {

  async probeModel(params: {
    modelId: string
    modelVersion: string
    probeSet: ProbeSet[]
    tier: OutcomeTier
  }): Promise<RawProbeResults> {
    assertIntelligenceProbesAllowed(`probeModel:${params.modelId}`)
    const results: RawProbeResult[] = []
    const generateFn = MODEL_DISPATCH[params.modelId]

    if (!generateFn) {
      throw new Error(`No dispatch function registered for model: ${params.modelId}`)
    }

    for (const set of params.probeSet) {
      for (const probe of set.probes) {
        const startMs = Date.now()
        let videoUrl = ''

        try {
          videoUrl = await generateFn({
            prompt: probe.prompt,
            duration: 8,
            aspectRatio: '16:9',
          })
        } catch (err) {
          console.error(`Probe ${probe.id} generation failed for ${params.modelId}:`, err)
          continue
        }

        const generationMs = Date.now() - startMs
        const frames = await this.extractKeyFrames(videoUrl)
        const assessment = await this.assessOutput({ probe, videoUrl, frames, target: probe.target })

        const result: RawProbeResult = {
          probe_id: probe.id,
          category: set.category,
          model_id: params.modelId,
          model_version: params.modelVersion,
          prompt: probe.prompt,
          probe_prompt: probe.prompt,
          video_url: videoUrl,
          assessment,
          generated_at: new Date().toISOString(),
          generation_ms: generationMs,
        }

        results.push(result)

        // Store immediately — don't wait for full batch
        await intelligenceDb.createProbeResult({
          probe_id: probe.id,
          category: set.category,
          model_id: params.modelId,
          model_version: params.modelVersion,
          prompt: probe.prompt,
          video_url: videoUrl,
          quality_score: assessment.quality_score,
          issues: assessment.issues,
          strengths: assessment.strengths,
          assessment_json: assessment as unknown as Record<string, unknown>,
          generated_at: result.generated_at,
          tier_used: params.tier,
          generation_ms: generationMs,
        })
      }
    }

    return results
  }

  // Cheap crew writes the analysis report (Claude Haiku — text only)
  async writeAnalysisReport(modelId: string, results: RawProbeResult[]): Promise<ModelIntelligenceReport> {
    const groupedByCategory = this.groupResults(results)

    const rawReport = await callDomainLLM('intelligence', {
      source: 'intelligence:probe:writeReport',
      billableClass: 'eval',
      systemPrompt: `You are a machine learning research analyst writing internal competitive intelligence reports.
Write precise, factual, technical reports based on benchmark probe results.
Focus on: failure patterns, prompt sensitivity, capability boundaries.
Be specific. No marketing language. No hedging. State what was observed.
Return structured JSON only.`,
      userMessage: buildReportPrompt(modelId, groupedByCategory as Record<string, unknown>),
      requireJSON: true,
    })

    let report: ModelIntelligenceReport
    try {
      report = JSON.parse(rawReport)
    } catch {
      throw new Error(`Failed to parse intelligence report for ${modelId}: ${rawReport.slice(0, 200)}`)
    }

    await intelligenceDb.createModelReport({
      model_id: modelId,
      model_version: results[0]?.model_version ?? 'unknown',
      report_date: new Date().toISOString(),
      generated_by: 'claude-haiku',
      report_json: report as unknown as Record<string, unknown>,
      probe_count: results.length,
    })

    await this.extractTrainingSignals(results, report)

    return report
  }

  private async extractKeyFrames(videoUrl: string): Promise<string[]> {
    try {
      const { extractVideoFrameSamples } = await import('@/lib/fal/frameExtract')
      return await extractVideoFrameSamples(videoUrl, 3)
    } catch (err) {
      console.warn("[caught] src/lib/intelligence/analyser.ts:154", err instanceof Error ? { name: err.name, message: err.message } : err)

      return [videoUrl]
    }
  }

  private async assessOutput(params: {
    probe: { id: string; prompt: string }
    videoUrl: string
    frames: string[]
    target: string
  }): Promise<{ quality_score: number; issues: string[]; strengths: string[]; notes: string }> {
    const frameList = params.frames.slice(0, 3).join(', ')

    try {
      const raw = await callDomainLLM('intelligence', {
        source: 'intelligence:probe:assessOutput',
        billableClass: 'eval',
        systemPrompt: OUTPUT_ASSESSMENT_PROMPT,
        userMessage: `Probe ID: ${params.probe.id}
Probe prompt: "${params.probe.prompt}"
Target criteria: "${params.target}"
Extracted frame URLs: ${frameList}
Video URL: ${params.videoUrl}

Assess this probe result.`,
        requireJSON: true,
      })

      const parsed = JSON.parse(raw)
      return {
        quality_score: Number(parsed.quality_score ?? 5),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        notes: String(parsed.notes ?? ''),
      }
    } catch (err) {
      console.warn("[caught] src/lib/intelligence/analyser.ts:189", err instanceof Error ? { name: err.name, message: err.message } : err)

      return { quality_score: 5, issues: ['Assessment failed'], strengths: [], notes: '' }
    }
  }

  private groupResults(results: RawProbeResult[]): Record<string, RawProbeResult[]> {
    const groups: Record<string, RawProbeResult[]> = {}
    for (const r of results) {
      if (!groups[r.category]) groups[r.category] = []
      groups[r.category].push(r)
    }
    return groups
  }

  private async extractTrainingSignals(
    results: RawProbeResult[],
    _report: ModelIntelligenceReport
  ): Promise<void> {
    const now = new Date().toISOString()

    const trainingPairs = results
      .filter(r => r.assessment.quality_score >= 8)
      .map(r => ({
        source_model: r.model_id,
        source_version: r.model_version,
        prompt: r.probe_prompt,
        video_url: r.video_url,
        quality_score: r.assessment.quality_score,
        category: r.category,
        type: 'probe_high_quality',
        ingested_at: now,
      }))

    const failureExamples = results
      .filter(r => r.assessment.quality_score <= 4)
      .map(r => ({
        source_model: r.model_id,
        source_version: r.model_version,
        prompt: r.probe_prompt,
        video_url: r.video_url,
        failure_description: r.assessment.issues.join('; '),
        category: r.category,
        type: 'probe_failure_negative',
        ingested_at: now,
      }))

    const allSignals = [...trainingPairs, ...failureExamples]
    if (allSignals.length > 0) {
      await intelligenceDb.createTrainingSignals(allSignals)
    }

    // Push to Redis queue for training cluster pickup
    await pushIntelligenceSignal('training:probe_signals', { trainingPairs, failureExamples })
  }
}
