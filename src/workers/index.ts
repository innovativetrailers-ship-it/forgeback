/**
 * Worker entry point — imports all background workers.
 * Run with: tsx src/workers/index.ts
 */
import './training-pipeline'
import './distillation'
import './das-pull'
import './intelligence-cron'
// quality-gate is triggered on-demand by the training cluster, not on a timer
