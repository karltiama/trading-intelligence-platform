-- CreateEnum
CREATE TYPE "SignalExecutionStatus" AS ENUM ('PENDING', 'PLACED', 'SKIPPED_DUPLICATE', 'REJECTED_RISK', 'FAILED');

-- CreateTable
CREATE TABLE "AutomationSignalExecution" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "signalKey" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "side" "PaperOrderSide" NOT NULL,
    "status" "SignalExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSignalExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationSignalExecution_runId_createdAt_idx" ON "AutomationSignalExecution"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationSignalExecution_symbolId_createdAt_idx" ON "AutomationSignalExecution"("symbolId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationSignalExecution_orderId_idx" ON "AutomationSignalExecution"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationSignalExecution_runId_signalKey_key" ON "AutomationSignalExecution"("runId", "signalKey");

-- AddForeignKey
ALTER TABLE "AutomationSignalExecution" ADD CONSTRAINT "AutomationSignalExecution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "StrategyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationSignalExecution" ADD CONSTRAINT "AutomationSignalExecution_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationSignalExecution" ADD CONSTRAINT "AutomationSignalExecution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaperOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
