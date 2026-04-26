-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('ORDER_PLACED', 'AUTOMATION_RUN_STARTED', 'AUTOMATION_RUN_COMPLETED', 'AUTOMATION_SIGNAL_REJECTED_RISK');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "userEmail" TEXT NOT NULL,
    "accountId" TEXT,
    "resourceId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_userEmail_createdAt_idx" ON "AuditEvent"("userEmail", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_accountId_createdAt_idx" ON "AuditEvent"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_createdAt_idx" ON "AuditEvent"("eventType", "createdAt");
