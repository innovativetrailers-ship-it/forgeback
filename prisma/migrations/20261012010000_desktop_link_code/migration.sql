-- Device codes for desktop sign-in. Additive. Codes are single-use.
CREATE TABLE IF NOT EXISTS "DesktopLinkCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceName" TEXT,
  "ipHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesktopLinkCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DesktopLinkCode_code_key" ON "DesktopLinkCode"("code");
CREATE INDEX IF NOT EXISTS "DesktopLinkCode_deviceId_createdAt_idx" ON "DesktopLinkCode"("deviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "DesktopLinkCode_ipHash_createdAt_idx" ON "DesktopLinkCode"("ipHash", "createdAt");
