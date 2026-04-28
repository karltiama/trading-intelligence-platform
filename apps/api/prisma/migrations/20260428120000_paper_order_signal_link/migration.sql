-- Optional link from paper orders to scanner signals (journaling / outcome tracking).

ALTER TABLE "PaperOrder" ADD COLUMN "signalId" TEXT;

CREATE INDEX "PaperOrder_signalId_idx" ON "PaperOrder"("signalId");

ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
