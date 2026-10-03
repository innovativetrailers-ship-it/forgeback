/**
 * The render queue has one consumer: `npm run worker:render`
 * (`src/lib/queue/workers/render.worker.ts`).
 * This file used to start a second Worker on the same queue, which marked
 * jobs complete without rendering. It must not start another one.
 */
console.error('[workers] Refusing to start a second render consumer. Use npm run worker:render.')
process.exit(1)
