-- Add stop/take-profit planning fields to paper orders.
-- Safe rollout: fields are nullable to preserve existing historical rows.
ALTER TABLE "PaperOrder"
ADD COLUMN "stopLossPrice" DECIMAL(18,8),
ADD COLUMN "takeProfitPrice" DECIMAL(18,8);
