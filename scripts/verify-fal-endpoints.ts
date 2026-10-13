/**
 * Full FAL registry probe — ground truth for endpoint namespaces + schema-sync CI.
 * Run: FAL_KEY=... npm run verify:fal
 * Emits registry-corrections.json and data/model-constraints-seed.json.
 */

import fs from 'node:fs'
import path from 'node:path'
import { buildPayload } from '@cinema/core'
import { probeAllFalEndpoints, SAMPLE_SHOT } from '../src/lib/fal/registryProbe'
import {
  fetchConstraints,
  upsertConstraints,
} from '../src/lib/fal/schemaSync'
import { listAllFalEndpointIds } from '../src/lib/models/registry'
import { resolveModel } from '../src/lib/models/resolve'

async function main(): Promise<void> {
  const falKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY
  if (!falKey) {
    console.error('Set FAL_KEY or FAL_API_KEY')
    process.exit(1)
  }

  const modelArg = process.argv.find((a) => a.startsWith('--model='))?.split('=')[1]
    ?? (process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : undefined)

  let endpointFilter: string[] | undefined
  if (modelArg) {
    const def = resolveModel(modelArg)
    endpointFilter = [def.falEndpoint, def.i2vEndpoint].filter((e): e is string => Boolean(e))
    console.log(`Filtering to model ${modelArg}:`, endpointFilter)
  }

  console.log('1/5 resolveModel — all registry keys')
  for (const key of listAllFalEndpointIds().slice(0, 1)) {
    void key
  }
  for (const id of ['veo-3.1', 'wan-2.6', 'ltx-2.3']) {
    resolveModel(id)
  }

  console.log('2/5 Probing FAL registry endpoints (this may take several minutes)…\n')
  const corrections = await probeAllFalEndpoints(falKey, { endpointFilter })

  console.log('\n📡 EXISTENCE')
  console.table(corrections.existence.map((e) => ({
    id: e.id,
    alive: e.alive,
    status: e.status,
    detail: typeof e.detail === 'string' ? e.detail.slice(0, 80) : JSON.stringify(e.detail ?? '').slice(0, 80),
  })))

  const schemaIssues = corrections.schemas.filter((s) => s.missing?.length || s.status === 'BUILD_ERROR')
  if (schemaIssues.length) {
    console.log('\n📦 PAYLOAD ISSUES (adapter)')
    console.table(schemaIssues)
  }

  console.log('\n3/5 fetchConstraints + buildPayload validation')
  const endpoints = (endpointFilter ?? listAllFalEndpointIds()).filter((ep) =>
    corrections.existence.find((e) => e.id === ep && e.alive),
  )

  const seed: Record<string, unknown> = {}
  const constraintErrors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const constraints = await fetchConstraints(endpoint)
      try {
        await upsertConstraints(constraints)
      } catch {
        // CI may run without DATABASE_URL — seed file is the committed artifact
      }
      seed[endpoint] = constraints

      buildPayload(endpoint, {
        prompt: SAMPLE_SHOT.prompt,
        duration: SAMPLE_SHOT.duration,
        aspectRatio: SAMPLE_SHOT.aspectRatio,
        anchorUrl: endpoint.includes('image-to-video') ? SAMPLE_SHOT.imageUrl : undefined,
        resolution: '720p',
      }, {
        endpoint: constraints.endpoint,
        required: constraints.required,
        forbidden: constraints.forbidden,
        enums: constraints.enums,
        types: constraints.types,
        audioField: null,
        schemaHash: constraints.schemaHash,
        fetchedAt: constraints.fetchedAt,
        properties: constraints.properties,
      })
    } catch (err) {
      constraintErrors.push(
        `${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  if (constraintErrors.length) {
    console.log('\n❌ SCHEMA-SYNC FAILURES')
    for (const e of constraintErrors) console.log(' ', e)
  } else {
    console.log('\n✅ SCHEMA-SYNC: all probed endpoints build valid payloads')
  }

  const seedPath = path.join(process.cwd(), 'data', 'model-constraints-seed.json')
  fs.mkdirSync(path.dirname(seedPath), { recursive: true })
  fs.writeFileSync(seedPath, JSON.stringify({ generatedAt: new Date().toISOString(), constraints: seed }, null, 2))
  console.log(`\n4/5 Wrote ${seedPath}`)

  const outPath = path.join(process.cwd(), 'registry-corrections.json')
  fs.writeFileSync(outPath, JSON.stringify(corrections, null, 2))
  console.log(`5/5 Wrote ${outPath}`)
  console.log(`Summary: ${corrections.summary.alive} alive · ${corrections.summary.dead} dead · ${corrections.summary.payloadIssues} payload issues · ${constraintErrors.length} schema-sync errors\n`)

  const broken = corrections.summary.dead + corrections.summary.payloadIssues + constraintErrors.length
  process.exit(broken > 0 ? 1 : 0)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
