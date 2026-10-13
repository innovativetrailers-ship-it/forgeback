-- Manual shot-by-shot direction: awaiting_direction status + anchor control

ALTER TYPE "StudioClipStatus" ADD VALUE IF NOT EXISTS 'AWAITING_DIRECTION';

CREATE TYPE "AnchorSource" AS ENUM ('AUTO', 'MANUAL', 'KEYFRAME', 'NONE');

ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "anchorFrameUrl" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "anchorSource" "AnchorSource" NOT NULL DEFAULT 'NONE';
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "directionNotes" TEXT;
