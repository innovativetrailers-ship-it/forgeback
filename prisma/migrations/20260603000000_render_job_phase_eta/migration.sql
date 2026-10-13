-- AddColumn phase and etaSeconds to RenderJob for live progress tracking
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "phase" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "etaSeconds" INTEGER;
