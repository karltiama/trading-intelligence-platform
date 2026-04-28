-- Trade origin (manual vs scanner vs automation) + optional journal note.

CREATE TYPE "TradeSource" AS ENUM ('SIGNAL', 'MANUAL', 'AUTOMATION');

ALTER TABLE "PaperOrder" ADD COLUMN "source" "TradeSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "PaperOrder" ADD COLUMN "note" TEXT;

CREATE INDEX "PaperOrder_source_idx" ON "PaperOrder"("source");

-- Backfill: scanner-linked UI orders
UPDATE "PaperOrder" SET "source" = 'SIGNAL' WHERE "signalId" IS NOT NULL;

-- Backfill: automation pipeline (order id stored on execution rows)
UPDATE "PaperOrder" o
SET "source" = 'AUTOMATION'
FROM "AutomationSignalExecution" e
WHERE e."orderId" = o."id" AND e."orderId" IS NOT NULL;
