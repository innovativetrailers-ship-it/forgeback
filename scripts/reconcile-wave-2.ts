import 'dotenv/config'
import { runWave2Reconcile } from '../src/lib/reconcile/wave2'
import { db } from '../src/lib/db'

async function main() {
  const report = await runWave2Reconcile()
  console.log(JSON.stringify(report))
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'reconcile failed')
  process.exit(1)
})
