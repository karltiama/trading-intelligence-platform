-- Align run table naming with Phase 3 automation domain.
-- Safe rename to preserve existing run history rows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'StrategyRun'
  ) THEN
    ALTER TABLE "StrategyRun" RENAME TO "AutomationRun";
  END IF;
END $$;

