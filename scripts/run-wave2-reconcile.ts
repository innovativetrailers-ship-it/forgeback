import 'dotenv/config'
import { runWave2Reconcile } from '../src/lib/reconcile/wave2'
import { db } from '../src/lib/db'

runWave2Reconcile()
  .then(async (report) => {
    console.log(JSON.stringify(report))
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : 'reconcile failed')
    await db.$disconnect()
    process.exit(1)
  })
