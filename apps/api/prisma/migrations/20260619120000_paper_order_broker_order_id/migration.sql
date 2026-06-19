-- AlterTable
ALTER TABLE "PaperOrder" ADD COLUMN "brokerOrderId" TEXT;

-- CreateIndex
CREATE INDEX "PaperOrder_brokerOrderId_idx" ON "PaperOrder"("brokerOrderId");
