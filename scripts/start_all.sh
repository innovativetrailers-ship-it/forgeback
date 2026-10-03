#!/bin/bash
# Start all Cinematic Forge services
# Usage: ./scripts/start_all.sh

set -e

echo "🎬 Starting Cinematic Forge services..."
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found"; exit 1; }
command -v npx >/dev/null 2>&1  || { echo "❌ npx not found"; exit 1; }

# Ensure .env exists
if [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
  echo "⚠️  No .env.local found — copy .env.example and fill in values"
  exit 1
fi

# Python microservices (OTIO, IMF, ShotGrid, EXR)
echo "▶ Starting Python microservices..."
bash scripts/start_services.sh

# Main Next.js app
echo "▶ Starting Next.js dev server..."
npm run dev &
NEXTJS_PID=$!

# Wait for Next.js to boot
sleep 3

# BullMQ workers
echo "▶ Starting render worker..."
npm run worker:render &

echo "▶ Starting training worker..."
npm run worker:training &

echo "▶ Starting export worker..."
npm run worker:export &

echo "▶ Starting DAS pull worker..."
npm run worker:das &

# Intelligence cron is disabled — it billed FAL and Anthropic on a schedule.

# Growth Engine workers (optional — only if training pipeline is configured)
if [ "${ENABLE_TRAINING_PIPELINE:-false}" = "true" ]; then
  echo "▶ Starting training pipeline..."
  npx tsx src/workers/training-pipeline.ts &

  echo "▶ Starting quality gate..."
  npx tsx src/workers/quality-gate.ts &

  echo "▶ Starting distillation worker..."
  npx tsx src/workers/distillation.ts &
fi

echo ""
echo "✅ Cinematic Forge running at http://localhost:3000"
echo "   Workers: render, training, export, DAS pull"
if [ "${ENABLE_TRAINING_PIPELINE:-false}" = "true" ]; then
  echo "   Growth Engine: training-pipeline, quality-gate, distillation"
fi
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for all background processes
wait
