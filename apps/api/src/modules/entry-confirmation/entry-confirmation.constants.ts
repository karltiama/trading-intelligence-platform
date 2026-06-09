export const ENTRY_CONFIRMATION_DEFAULTS = {
  minH1Bars: 25,
  closesAboveSma20Count: 5,
  smaPeriod: 20,
  structureLookback: 5,
  relativeVolumeBaseline: 20,
  relativeVolumeMin: 1.0,
  requireRelativeVolume: false,
} as const;

export type EntryConfirmationConfig = {
  minH1Bars: number;
  closesAboveSma20Count: number;
  smaPeriod: number;
  structureLookback: number;
  relativeVolumeBaseline: number;
  relativeVolumeMin: number;
  requireRelativeVolume: boolean;
};

export function resolveEntryConfirmationConfig(
  overrides?: Partial<EntryConfirmationConfig>,
): EntryConfirmationConfig {
  return {
    ...ENTRY_CONFIRMATION_DEFAULTS,
    ...overrides,
  };
}
