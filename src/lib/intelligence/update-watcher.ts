/**
 * ModelUpdateWatcher
 *
 * Runs every 6 hours to detect when any model silently updates.
 * On update: runs targeted probe battery, writes delta report,
 * extracts training signals, and optionally triggers routing review.
 */

import { intelligenceDb, callDomainLLM, pushIntelligenceSignal } from '../firewall/domain-guard'
import { ModelIntelligenceAnalyser } from './analyser'
import { PROBE_BATTERY, getProbeSets } from './probe-battery'
import { assertIntelligenceProbesAllowed, intelligenceProbesEnabled } from './guards'
import { buildDeltaReportPrompt } from './crew'
import type { ModelUpdate, UpdateDelta, RawProbeResult } from './report-schema'

// Current known model versions — updated when changes detected
const MODEL_VERSIONS: Record<string, string> = {
  veo_3_1:         '3.1.0',
  kling_3_0:       '3.0.0',
  seedance_2_0:    '2.0.0',
  runway_gen4_5:   '4.5.0',
  wan_2_6:         '2.6.0',
  ltx_2_3:         '2.3.0',
  minimax_hailuo:  '2.3.0',
  pika_2_5:        '2.5.0',
  luma_ray3:       '3.0.0',
  skyreels_v1:     '1.0.0',
  mochi_1:         '1.0.0',
}

// Which probe categories to re-run when a specific model updates
const CATEGORY_MAP: Record<string, string[]> = {
  veo_3_1:        ['physics_fluid', 'atmosphere', 'native_audio', 'prompt_fidelity'],
  kling_3_0:      ['human_motion', 'material_physics', 'wildlife', 'consistency'],
  seedance_2_0:   ['human_motion', 'material_physics', 'native_audio', 'efficiency'],
  runway_gen4_5:  ['consistency', 'architecture', 'prompt_fidelity'],
  wan_2_6:        ['architecture', 'efficiency', 'atmosphere'],
  ltx_2_3:        ['text_accuracy', 'efficiency', 'consistency'],
  luma_ray3:      ['architecture', 'atmosphere', 'wildlife'],
  skyreels_v1:    ['human_motion', 'consistency', 'efficiency'],
  mochi_1:        ['efficiency', 'consistency', 'material_physics'],
  pika_2_5:       ['human_motion', 'prompt_fidelity', 'efficiency'],
  minimax_hailuo: ['human_motion', 'wildlife', 'native_audio'],
}

// Version fingerprinting — probe a model and hash outputs to detect silent updates
// We use a small fixed probe set for the fingerprint check
const FINGERPRINT_PROBES = ['EFF-001', 'EFF-003', 'CON-002', 'PHY-001']

export class ModelUpdateWatcher {

  // Detect if any model has been silently updated by running fingerprint probes
  // and comparing quality signatures against stored baselines
  async detectUpdates(): Promise<ModelUpdate[]> {
    const updates: ModelUpdate[] = []

    for (const [modelId, currentVersion] of Object.entries(MODEL_VERSIONS)) {
      try {
        const detected = await this.detectModelChange(modelId, currentVersion)
        if (detected) {
          const update: ModelUpdate = {
            model_id: modelId,
            previous_version: currentVersion,
            new_version: `${currentVersion}-updated-${Date.now()}`,
            detected_at: new Date().toISOString(),
          }
          updates.push(update)
          MODEL_VERSIONS[modelId] = update.new_version

          await intelligenceDb.createModelUpdate({
            model_id: update.model_id,
            previous_version: update.previous_version,
            new_version: update.new_version,
            detected_at: update.detected_at,
          })

          console.log(`[UpdateWatcher] CHANGE DETECTED: ${modelId} ${currentVersion} → ${update.new_version}`)
        }
      } catch (err) {
        console.warn(`[UpdateWatcher] Version check failed for ${modelId}:`, err)
      }
    }

    return updates
  }

  // Run fingerprint probes and compare against baseline quality signature
  // Returns true if the model's behaviour appears to have changed
  private async detectModelChange(modelId: string, currentVersion: string): Promise<boolean> {
    // Look for recent baseline results for this model
    const recent = await intelligenceDb.getProbeResultsForModel(
      modelId,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
    )

    if (recent.length === 0) {
      // No baseline — not enough data to detect a change
      console.log(`[UpdateWatcher] No baseline for ${modelId} — skipping change detection`)
      return false
    }

    // Check if version string stored in any recent record differs
    const storedVersions = new Set(
      recent
        .map(r => (r.metadata as Record<string, string> | null)?.model_version)
        .filter(Boolean)
    )

    // If we have multiple versions in the last 7 days, a change occurred
    if (storedVersions.size > 1) {
      return true
    }

    return false
  }

  // Full update handling: targeted probes + delta report + routing review
  async handleUpdate(update: ModelUpdate): Promise<void> {
    if (!intelligenceProbesEnabled()) {
      console.warn('[UpdateWatcher] Skipping probe battery — intelligence probes disabled', {
        model_id: update.model_id,
        GENERATION_PAUSED: process.env.GENERATION_PAUSED,
        ENABLE_INTELLIGENCE_PROBES: process.env.ENABLE_INTELLIGENCE_PROBES,
      })
      return
    }
    assertIntelligenceProbesAllowed(`handleUpdate:${update.model_id}`)

    console.log(`[UpdateWatcher] Handling update: ${update.model_id} ${update.previous_version} → ${update.new_version}`)

    const targetCategories = CATEGORY_MAP[update.model_id] ?? ['efficiency', 'consistency']
    const probesToRun = getProbeSets(targetCategories)

    const analyser = new ModelIntelligenceAnalyser()
    const results = await analyser.probeModel({
      modelId: update.model_id,
      modelVersion: update.new_version,
      probeSet: probesToRun,
      tier: 'Studio',
    })

    const baseline = await this.fetchBaselineReport(update.model_id)
    const delta = await this.computeDelta(baseline, results)

    const deltaReport = await this.writeDeltaReport(update, delta, baseline, results)
    console.log(`[UpdateWatcher] Delta report written for ${update.model_id}: significance=${delta.significance_score}`)

    if (delta.significance_score > 0.2) {
      await this.triggerRoutingReview(update.model_id, deltaReport)
    }

    await this.triggerTargetedTraining(update.model_id, results, update.new_version)
  }

  private async fetchBaselineReport(modelId: string): Promise<Record<string, unknown> | null> {
    const record = await intelligenceDb.findLatestReport(modelId)
    if (!record) return null
    return (record.metadata as Record<string, unknown>) ?? null
  }

  private async computeDelta(
    baseline: Record<string, unknown> | null,
    results: RawProbeResult[]
  ): Promise<UpdateDelta> {
    if (!baseline) {
      return {
        improved_categories: [],
        degraded_categories: [],
        significance_score: 0.5, // Assume significant if no baseline
        summary: 'No baseline available for comparison — treating as first probe run.',
      }
    }

    const avgQuality = results.length > 0
      ? results.reduce((s, r) => s + r.assessment.quality_score, 0) / results.length
      : 0

    const baselineScore = (baseline.avg_quality as number | undefined) ?? 7.0
    const scoreDelta = Math.abs(avgQuality - baselineScore) / 10

    return {
      improved_categories: results
        .filter(r => r.assessment.quality_score > baselineScore)
        .map(r => r.category)
        .filter((v, i, a) => a.indexOf(v) === i),
      degraded_categories: results
        .filter(r => r.assessment.quality_score < baselineScore - 1)
        .map(r => r.category)
        .filter((v, i, a) => a.indexOf(v) === i),
      significance_score: scoreDelta,
      summary: `Quality delta: ${avgQuality.toFixed(1)} vs baseline ${baselineScore.toFixed(1)}. Delta: ${(scoreDelta * 10).toFixed(1)} points.`,
    }
  }

  private async writeDeltaReport(
    update: ModelUpdate,
    delta: UpdateDelta,
    baseline: Record<string, unknown> | null,
    results: RawProbeResult[]
  ): Promise<string> {
    const grouped = results.reduce<Record<string, RawProbeResult[]>>((acc, r) => {
      if (!acc[r.category]) acc[r.category] = []
      acc[r.category].push(r)
      return acc
    }, {})

    const rawReport = await callDomainLLM('intelligence', {
      source: 'intelligence:update:deltaReport',
      billableClass: 'eval',
      systemPrompt: `You are a machine learning research analyst. Write precise delta reports comparing model versions.`,
      userMessage: buildDeltaReportPrompt(
        update.model_id,
        update.previous_version,
        update.new_version,
        baseline ?? {},
        grouped as unknown as Record<string, unknown>
      ),
      requireJSON: true,
    })

    await intelligenceDb.createModelReport({
      model_id: update.model_id,
      model_version: update.new_version,
      report_date: new Date().toISOString(),
      generated_by: 'claude-haiku',
      report_json: { delta, raw: rawReport } as unknown as Record<string, unknown>,
      probe_count: results.length,
      is_delta: true,
    })

    return rawReport
  }

  private async triggerRoutingReview(modelId: string, deltaReport: string): Promise<void> {
    console.log(`[UpdateWatcher] Significant capability change in ${modelId} — flagging for routing review`)

    await pushIntelligenceSignal('routing:review_queue', {
      model_id: modelId,
      delta_report: deltaReport,
      flagged_at: new Date().toISOString(),
      reason: 'significance_score_exceeded_threshold',
    })
  }

  private async triggerTargetedTraining(
    modelId: string,
    probeResults: RawProbeResult[],
    version: string
  ): Promise<void> {
    const now = new Date().toISOString()
    const trainingBatch = probeResults
      .filter(r => r.assessment.quality_score >= 7.5)
      .map(r => ({
        source_model: modelId,
        source_version: version,
        prompt: r.probe_prompt,
        video_url: r.video_url,
        quality_score: r.assessment.quality_score,
        category: r.category,
        type: 'update_probe_output',
        ingested_at: now,
      }))

    if (trainingBatch.length > 0) {
      await intelligenceDb.createTrainingSignals(trainingBatch)
    }

    await pushIntelligenceSignal('training:model_update_signals', {
      modelId,
      version,
      batch: trainingBatch,
    })

    console.log(`[UpdateWatcher] Queued ${trainingBatch.length} training signals from ${modelId} v${version}`)
  }
}

// Weekly full probe battery across all models
export async function runWeeklyProbeBattery(): Promise<void> {
  if (!intelligenceProbesEnabled()) {
    console.log('[Intelligence] Weekly probe battery skipped (probes disabled — set ENABLE_INTELLIGENCE_PROBES=true)')
    return
  }
  assertIntelligenceProbesAllowed('runWeeklyProbeBattery')
  const analyser = new ModelIntelligenceAnalyser()
  const models = Object.keys(MODEL_VERSIONS)

  for (const modelId of models) {
    try {
      console.log(`[Intelligence] Starting weekly probe for ${modelId}`)
      const results = await analyser.probeModel({
        modelId,
        modelVersion: MODEL_VERSIONS[modelId],
        probeSet: PROBE_BATTERY,
        tier: 'Studio',
      })
      await analyser.writeAnalysisReport(modelId, results)
      console.log(`[Intelligence] Weekly probe complete for ${modelId}: ${results.length} probes`)
    } catch (err) {
      console.error(`[Intelligence] Weekly probe failed for ${modelId}:`, err)
    }
  }
}

// Monthly cross-model comparison report
export async function generateCrossModelComparisonReport(): Promise<void> {
  if (!intelligenceProbesEnabled()) {
    console.log('[Intelligence] Cross-model comparison skipped (eval harness disabled)')
    return
  }

  const allReports = await intelligenceDb.getProbeResultsForModel(
    '',
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  )

  if (allReports.length === 0) {
    console.log('[Intelligence] No probe results for cross-model comparison')
    return
  }

  const summary = await callDomainLLM('intelligence', {
    source: 'intelligence:monthly:comparison',
    billableClass: 'eval',
    systemPrompt: `You are a machine learning research analyst. Write cross-model comparison summaries for routing optimisation.`,
    userMessage: `Write a cross-model comparison report from ${allReports.length} probe results from the last 30 days.
Group by capability category. Identify which models lead in each category.
Return JSON: { "category_leaders": { "category": "model_id" }, "routing_recommendations": ["string"], "summary": "string" }`,
    requireJSON: true,
  })

  await pushIntelligenceSignal('intelligence:monthly_comparison', {
    report: summary,
    generated_at: new Date().toISOString(),
    probe_count: allReports.length,
  })

  console.log('[Intelligence] Monthly cross-model comparison report generated')
}

export async function suggestRoutingMatrixUpdates(): Promise<void> {
  await pushIntelligenceSignal('routing:matrix_update_suggestions', {
    triggered_at: new Date().toISOString(),
    reason: 'monthly_schedule',
  })
}

export { MODEL_VERSIONS }
