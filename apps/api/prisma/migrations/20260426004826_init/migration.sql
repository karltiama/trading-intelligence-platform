-- CreateTable
CREATE TABLE "AutomationGuardrail" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationGuardrail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationGuardrail_userEmail_updatedAt_idx" ON "AutomationGuardrail"("userEmail", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationGuardrail_userEmail_strategy_key" ON "AutomationGuardrail"("userEmail", "strategy");
