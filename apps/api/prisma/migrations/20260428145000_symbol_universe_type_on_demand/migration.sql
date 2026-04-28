-- Phase 2.5: Hybrid symbol universe support.
-- Existing symbols are backfilled to CORE.

CREATE TYPE "UniverseType" AS ENUM ('CORE', 'ON_DEMAND');

ALTER TABLE "Symbol"
ADD COLUMN "universeType" "UniverseType" NOT NULL DEFAULT 'ON_DEMAND',
ADD COLUMN "lastSeenAt" TIMESTAMP(3);

UPDATE "Symbol"
SET "universeType" = 'CORE';

