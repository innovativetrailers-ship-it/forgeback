#!/usr/bin/env npx tsx
/** Emergency: obliterate render queue — no billable jobs. Safe when GENERATION_PAUSED. */
import { drainRenderQueueIfPaused } from '../src/lib/queue/drainRenderQueue'

void drainRenderQueueIfPaused(true).then(() => {
  console.log('done')
  process.exit(0)
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
