ALTER TABLE "StudioClip" ADD COLUMN "cameraAngle" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "cameraMove" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "shotSize" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "lensFeel" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "cameraSpeed" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "cameraPrecision" BOOLEAN NOT NULL DEFAULT false;
