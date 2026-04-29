-- Add new scanner strategies for separate signal engines
ALTER TYPE "StrategyName"
ADD VALUE IF NOT EXISTS 'RELATIVE_STRENGTH_BREAKOUT';

ALTER TYPE "StrategyName"
ADD VALUE IF NOT EXISTS 'OVERSOLD_BOUNCE';
