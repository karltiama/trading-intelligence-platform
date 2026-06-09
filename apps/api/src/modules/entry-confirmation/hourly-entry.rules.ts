import {
  type EntryConfirmationConfig,
  resolveEntryConfirmationConfig,
} from './entry-confirmation.constants';

/** Completed H1 bar, ascending by timestamp (oldest first). */
export type CompletedH1Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EntryConfirmationChecks = {
  hasSufficientHistory: boolean;
  closesAboveSma20: boolean;
  aboveEntryPrice: boolean;
  structureNotMakingLowerLows: boolean;
  relativeVolumePass?: boolean;
};

export type EntryConfirmationResult = {
  passed: boolean;
  reasons: string[];
  checks: EntryConfirmationChecks;
};

export type EvaluateHourlyEntryConfirmationInput = {
  candles: CompletedH1Candle[];
  entryPrice: number | null;
  config?: Partial<EntryConfirmationConfig>;
};

function sma(values: number[], period: number): number | null {
  if (period < 1 || values.length < period) {
    return null;
  }
  const window = values.slice(values.length - period);
  const sum = window.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function relativeVolume(
  volumes: number[],
  baselinePeriod: number,
): number | null {
  if (baselinePeriod < 1 || volumes.length < baselinePeriod + 1) {
    return null;
  }
  const latestVolume = volumes[volumes.length - 1];
  const baselineSlice = volumes.slice(
    volumes.length - (baselinePeriod + 1),
    volumes.length - 1,
  );
  const baseline =
    baselineSlice.reduce((acc, value) => acc + value, 0) / baselinePeriod;
  if (baseline <= 0) {
    return null;
  }
  return latestVolume / baseline;
}

export function hasSufficientH1History(
  candles: CompletedH1Candle[],
  minBars: number,
): boolean {
  return candles.length >= minBars;
}

export function lastClosesAboveSma(
  closes: number[],
  smaPeriod: number,
  closeCount: number,
): boolean {
  const smaValue = sma(closes, smaPeriod);
  if (smaValue === null || closeCount < 1 || closes.length < closeCount) {
    return false;
  }
  const recentCloses = closes.slice(-closeCount);
  return recentCloses.every((close) => close > smaValue);
}

export function latestCloseAboveEntryPrice(
  closes: number[],
  entryPrice: number | null,
): boolean {
  if (entryPrice === null || closes.length === 0) {
    return false;
  }
  return closes[closes.length - 1] > entryPrice;
}

export function lowsAreNonDecreasing(
  lows: number[],
  lookback: number,
): boolean {
  if (lookback < 2 || lows.length < lookback) {
    return false;
  }
  const recentLows = lows.slice(-lookback);
  for (let i = 1; i < recentLows.length; i += 1) {
    if (recentLows[i] < recentLows[i - 1]) {
      return false;
    }
  }
  return true;
}

export function h1RelativeVolumePasses(
  volumes: number[],
  baselinePeriod: number,
  minRatio: number,
): boolean {
  const ratio = relativeVolume(volumes, baselinePeriod);
  if (ratio === null) {
    return false;
  }
  return ratio >= minRatio;
}

export function evaluateHourlyEntryConfirmation(
  input: EvaluateHourlyEntryConfirmationInput,
): EntryConfirmationResult {
  const config = resolveEntryConfirmationConfig(input.config);
  const closes = input.candles.map((bar) => bar.close);
  const lows = input.candles.map((bar) => bar.low);
  const volumes = input.candles.map((bar) => bar.volume);

  const checks: EntryConfirmationChecks = {
    hasSufficientHistory: hasSufficientH1History(
      input.candles,
      config.minH1Bars,
    ),
    closesAboveSma20: false,
    aboveEntryPrice: false,
    structureNotMakingLowerLows: false,
  };

  const reasons: string[] = [];

  if (!checks.hasSufficientHistory) {
    reasons.push(
      `Insufficient H1 history: need at least ${config.minH1Bars} completed bars.`,
    );
  } else {
    checks.closesAboveSma20 = lastClosesAboveSma(
      closes,
      config.smaPeriod,
      config.closesAboveSma20Count,
    );
    checks.aboveEntryPrice = latestCloseAboveEntryPrice(
      closes,
      input.entryPrice,
    );
    checks.structureNotMakingLowerLows = lowsAreNonDecreasing(
      lows,
      config.structureLookback,
    );
  }

  if (checks.hasSufficientHistory && !checks.closesAboveSma20) {
    reasons.push(
      `Last ${config.closesAboveSma20Count} H1 closes are not all above H1 SMA${config.smaPeriod}.`,
    );
  }

  if (input.entryPrice === null) {
    reasons.push('Missing daily entryPrice on signal.');
  } else if (checks.hasSufficientHistory && !checks.aboveEntryPrice) {
    reasons.push(
      `Latest H1 close is not above daily entry price (${input.entryPrice}).`,
    );
  }

  if (checks.hasSufficientHistory && !checks.structureNotMakingLowerLows) {
    reasons.push(
      `Last ${config.structureLookback} H1 lows are making lower lows.`,
    );
  }

  if (config.requireRelativeVolume) {
    checks.relativeVolumePass = h1RelativeVolumePasses(
      volumes,
      config.relativeVolumeBaseline,
      config.relativeVolumeMin,
    );
    if (!checks.relativeVolumePass) {
      reasons.push(
        `H1 relative volume is below minimum (${config.relativeVolumeMin}).`,
      );
    }
  }

  const requiredChecks = [
    checks.hasSufficientHistory,
    checks.closesAboveSma20,
    checks.aboveEntryPrice,
    checks.structureNotMakingLowerLows,
  ];

  if (config.requireRelativeVolume) {
    requiredChecks.push(checks.relativeVolumePass === true);
  }

  const passed = requiredChecks.every(Boolean);

  if (passed) {
    reasons.push('H1 entry confirmation passed.');
  }

  return { passed, reasons, checks };
}
