-- The serve route must read the object key we uploaded, not rebuild a path from the row id.
ALTER TABLE "StudioClip" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN "storageKey" TEXT;

UPDATE "RenderJob"
SET "storageKey" = substring("outputUrl" from '((?:renders|videos|clips)/[^?]+)')
WHERE "storageKey" IS NULL
  AND "outputUrl" IS NOT NULL
  AND "outputUrl" ~ '(renders|videos|clips)/';

UPDATE "StudioClip"
SET "storageKey" = substring("videoUrl" from '((?:renders|videos|clips)/[^?]+)')
WHERE "storageKey" IS NULL
  AND "videoUrl" IS NOT NULL
  AND "videoUrl" ~ '(renders|videos|clips)/';
