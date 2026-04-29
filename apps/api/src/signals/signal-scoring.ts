export type TrendPullbackInput = {
  closes: number[];
  volumes: number[];
  highs: number[];
  lows: number[];
};

export type ScannerGrade = 'STRONG' | 'WATCHLIST' | 'WEAK' | 'IGNORE';

export type ScannerScore = {
  totalScore: number;
  grade: ScannerGrade;
  components: {
    trend: number;
    pullback: number;
    stochastic: number;
    volume: number;
    riskReward: number;
  };
};

export type TrendPullbackScore = {
  isValid: boolean;
  confidence: number;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  reason: string;
  reasons: string[];
  scannerScore: ScannerScore;
  timeHorizon: '3-10 trading days';
};

export function calculateSma(values: number[], period: number): number | null {
  if (period < 1 || values.length < period) {
    return null;
  }
  const window = values.slice(values.length - period);
  const sum = window.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

export function calculateRelativeVolume(
  volumes: number[],
  period: number,
): number | null {
  if (period < 1 || volumes.length < period + 1) {
    return null;
  }
  const latestVolume = volumes[volumes.length - 1];
  const baselineSlice = volumes.slice(
    volumes.length - (period + 1),
    volumes.length - 1,
  );
  const baseline =
    baselineSlice.reduce((acc, value) => acc + value, 0) / period;
  if (baseline <= 0) {
    return null;
  }
  return latestVolume / baseline;
}

function calculateStochasticK(
  closes: number[],
  highs: number[],
  lows: number[],
  period: number,
): number | null {
  if (
    period < 1 ||
    closes.length < period ||
    highs.length < period ||
    lows.length < period
  ) {
    return null;
  }
  const recentHighs = highs.slice(highs.length - period);
  const recentLows = lows.slice(lows.length - period);
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  if (highestHigh <= lowestLow) {
    return null;
  }
  const latestClose = closes[closes.length - 1];
  return ((latestClose - lowestLow) / (highestHigh - lowestLow)) * 100;
}

function gradeFromScore(totalScore: number): ScannerGrade {
  if (totalScore >= 80) return 'STRONG';
  if (totalScore >= 60) return 'WATCHLIST';
  if (totalScore >= 40) return 'WEAK';
  return 'IGNORE';
}

function emptyScannerScore(): ScannerScore {
  return {
    totalScore: 0,
    grade: 'IGNORE',
    components: {
      trend: 0,
      pullback: 0,
      stochastic: 0,
      volume: 0,
      riskReward: 0,
    },
  };
}

export function scoreTrendPullback(
  input: TrendPullbackInput,
): TrendPullbackScore {
  const { closes, volumes, highs, lows } = input;
  const reasons: string[] = [];
  if (
    closes.length < 200 ||
    volumes.length < 30 ||
    highs.length < 30 ||
    lows.length < 30
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Insufficient historical data for trend pullback scan.',
      reasons: ['Need at least 200 closes and 30 volumes.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  const latestClose = closes[closes.length - 1];
  const latestLow = lows[lows.length - 1];
  const sma20 = calculateSma(closes, 20);
  const sma50 = calculateSma(closes, 50);
  const sma200 = calculateSma(closes, 200);
  const stochasticK = calculateStochasticK(closes, highs, lows, 14);
  const relativeVolume = calculateRelativeVolume(volumes, 20);
  if (
    sma20 === null ||
    sma50 === null ||
    sma200 === null ||
    stochasticK === null ||
    relativeVolume === null
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Could not compute indicators for trend pullback scan.',
      reasons: ['Missing indicator values after validation.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  let trendScore = 0;
  let pullbackScore = 0;
  let stochasticScore = 0;
  let volumeScore = 0;
  let riskRewardScore = 0;

  const uptrend = latestClose > sma50 && latestClose > sma200;
  if (uptrend) {
    trendScore = 25;
    reasons.push('Price is above 50/200 SMA: trend intact.');
  } else {
    reasons.push('Trend is weak: close is not above both 50/200 SMA.');
  }

  const distanceToSma20 = Math.abs(latestClose - sma20) / sma20;
  if (distanceToSma20 <= 0.02) {
    pullbackScore = 20;
    reasons.push('Pullback depth is ideal near 20 SMA.');
  } else if (distanceToSma20 <= 0.04) {
    pullbackScore = 10;
    reasons.push('Pullback depth is acceptable but not ideal.');
  } else {
    reasons.push('Pullback depth is outside preferred range.');
  }

  if (stochasticK >= 20 && stochasticK <= 45) {
    stochasticScore = 20;
    reasons.push('Stochastic is in reset/turn zone.');
  } else if (stochasticK > 45 && stochasticK <= 60) {
    stochasticScore = 10;
    reasons.push('Stochastic is improving but not fully reset.');
  } else {
    reasons.push('Stochastic has not reset to preferred zone.');
  }

  if (relativeVolume >= 1.0) {
    volumeScore = 20;
    reasons.push('Volume confirms setup vs baseline.');
  } else if (relativeVolume >= 0.8) {
    volumeScore = 10;
    reasons.push('Volume is acceptable but not strong.');
  } else {
    reasons.push('Volume is below confirmation threshold.');
  }

  const entryPrice = latestClose;
  const stopLoss = Math.min(latestLow, sma20 * 0.99);
  const risk = entryPrice - stopLoss;
  const targetPrice = entryPrice + risk * 2;
  const riskReward = risk > 0 ? (targetPrice - entryPrice) / risk : null;
  const riskPercent = entryPrice > 0 ? risk / entryPrice : 0;
  if (
    riskReward !== null &&
    riskReward >= 1.5 &&
    riskPercent >= 0.005 &&
    riskPercent <= 0.025
  ) {
    riskRewardScore = 15;
    reasons.push('Risk profile is tight with strong reward potential.');
  } else if (
    riskReward !== null &&
    riskReward >= 1.5 &&
    riskPercent > 0 &&
    riskPercent <= 0.04
  ) {
    riskRewardScore = 8;
    reasons.push('Risk profile is acceptable but wider than ideal.');
  } else {
    reasons.push('Stop distance is too wide for preferred risk profile.');
  }

  const totalScore = Math.min(
    100,
    trendScore +
      pullbackScore +
      stochasticScore +
      volumeScore +
      riskRewardScore,
  );
  const scannerScore: ScannerScore = {
    totalScore,
    grade: gradeFromScore(totalScore),
    components: {
      trend: trendScore,
      pullback: pullbackScore,
      stochastic: stochasticScore,
      volume: volumeScore,
      riskReward: riskRewardScore,
    },
  };
  const isValid = scannerScore.grade === 'STRONG';
  const lastReason = isValid
    ? 'Trend pullback setup qualifies.'
    : 'Trend pullback setup does not qualify.';

  return {
    isValid,
    confidence: totalScore,
    entryPrice,
    stopLoss,
    targetPrice,
    riskReward,
    reason: `${lastReason} ${reasons.join(' ')}`.trim(),
    reasons,
    scannerScore,
    timeHorizon: '3-10 trading days',
  };
}

export function scoreRelativeStrengthBreakout(
  input: TrendPullbackInput,
): TrendPullbackScore {
  const { closes, volumes, highs, lows } = input;
  if (
    closes.length < 200 ||
    volumes.length < 30 ||
    highs.length < 30 ||
    lows.length < 30
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason:
        'Insufficient historical data for relative strength breakout scan.',
      reasons: ['Need at least 200 closes and 30 volumes.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  const latestClose = closes[closes.length - 1];
  const latestLow = lows[lows.length - 1];
  const sma50 = calculateSma(closes, 50);
  const sma200 = calculateSma(closes, 200);
  const relativeVolume = calculateRelativeVolume(volumes, 20);
  if (sma50 === null || sma200 === null || relativeVolume === null) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason:
        'Could not compute indicators for relative strength breakout scan.',
      reasons: ['Missing indicator values after validation.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  const reasons: string[] = [];
  const recent20High = Math.max(...highs.slice(highs.length - 20));
  const breakoutDistance =
    recent20High > 0 ? (recent20High - latestClose) / recent20High : 1;
  const lookback20 = closes.slice(closes.length - 20);
  const lookback60 = closes.slice(closes.length - 60);
  const ret20 = (latestClose - lookback20[0]) / lookback20[0];
  const ret60 = (latestClose - lookback60[0]) / lookback60[0];

  let trendScore = 0;
  let pullbackScore = 0;
  let stochasticScore = 0;
  let volumeScore = 0;
  let riskRewardScore = 0;

  if (latestClose > sma50 && latestClose > sma200) {
    trendScore = 20;
    reasons.push(
      'Price is above 50/200 SMA: breakout trend context is healthy.',
    );
  } else {
    reasons.push('Trend context is weak for breakout continuation.');
  }

  if (ret20 >= 0.06 && ret60 >= 0.12) {
    pullbackScore = 25;
    reasons.push('Relative strength is strong over 20D and 60D windows.');
  } else if (ret20 >= 0.03 && ret60 >= 0.08) {
    pullbackScore = 12;
    reasons.push('Relative strength is building but not leading yet.');
  } else {
    reasons.push('Relative strength is not strong enough yet.');
  }

  if (breakoutDistance <= 0.01) {
    stochasticScore = 20;
    reasons.push('Price is near recent highs: breakout trigger is close.');
  } else if (breakoutDistance <= 0.03) {
    stochasticScore = 10;
    reasons.push('Price is approaching breakout level.');
  } else {
    reasons.push('Price is still far from breakout level.');
  }

  if (relativeVolume >= 1.2) {
    volumeScore = 20;
    reasons.push('Volume expansion supports breakout probability.');
  } else if (relativeVolume >= 1.0) {
    volumeScore = 10;
    reasons.push('Volume is acceptable for a watchlist breakout.');
  } else {
    reasons.push('Volume is light for breakout confirmation.');
  }

  const entryPrice = latestClose;
  const stopLoss = Math.min(latestLow, latestClose * 0.96);
  const risk = entryPrice - stopLoss;
  const targetPrice = entryPrice + risk * 2;
  const riskReward = risk > 0 ? (targetPrice - entryPrice) / risk : null;
  if (riskReward !== null && riskReward >= 1.8) {
    riskRewardScore = 15;
    reasons.push('Risk/reward profile is favorable for breakout trade.');
  } else if (riskReward !== null && riskReward >= 1.5) {
    riskRewardScore = 8;
    reasons.push('Risk/reward profile is acceptable for watchlist status.');
  } else {
    reasons.push('Risk/reward profile is below breakout standard.');
  }

  const totalScore = Math.min(
    100,
    trendScore +
      pullbackScore +
      stochasticScore +
      volumeScore +
      riskRewardScore,
  );
  const scannerScore: ScannerScore = {
    totalScore,
    grade: gradeFromScore(totalScore),
    components: {
      trend: trendScore,
      pullback: pullbackScore,
      stochastic: stochasticScore,
      volume: volumeScore,
      riskReward: riskRewardScore,
    },
  };
  const isValid = scannerScore.grade === 'STRONG';
  const lastReason = isValid
    ? 'Relative strength breakout setup qualifies.'
    : 'Relative strength breakout setup does not qualify.';

  return {
    isValid,
    confidence: totalScore,
    entryPrice,
    stopLoss,
    targetPrice,
    riskReward,
    reason: `${lastReason} ${reasons.join(' ')}`.trim(),
    reasons,
    scannerScore,
    timeHorizon: '3-10 trading days',
  };
}

export function scoreOversoldBounce(
  input: TrendPullbackInput,
): TrendPullbackScore {
  const { closes, volumes, highs, lows } = input;
  if (
    closes.length < 200 ||
    volumes.length < 30 ||
    highs.length < 30 ||
    lows.length < 30
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Insufficient historical data for oversold bounce scan.',
      reasons: ['Need at least 200 closes and 30 volumes.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  const latestClose = closes[closes.length - 1];
  const latestLow = lows[lows.length - 1];
  const sma20 = calculateSma(closes, 20);
  const sma50 = calculateSma(closes, 50);
  const stochasticK = calculateStochasticK(closes, highs, lows, 14);
  const relativeVolume = calculateRelativeVolume(volumes, 20);
  if (
    sma20 === null ||
    sma50 === null ||
    stochasticK === null ||
    relativeVolume === null
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Could not compute indicators for oversold bounce scan.',
      reasons: ['Missing indicator values after validation.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  const reasons: string[] = [];
  let trendScore = 0;
  let pullbackScore = 0;
  let stochasticScore = 0;
  let volumeScore = 0;
  let riskRewardScore = 0;

  if (latestClose >= sma50 * 0.95) {
    trendScore = 15;
    reasons.push(
      'Higher timeframe structure is stable enough for bounce attempt.',
    );
  } else {
    reasons.push('Higher timeframe trend is too weak for a reliable bounce.');
  }

  const extensionBelowSma20 = sma20 > 0 ? (sma20 - latestClose) / sma20 : 0;
  if (extensionBelowSma20 >= 0.04 && extensionBelowSma20 <= 0.1) {
    pullbackScore = 25;
    reasons.push('Price is sufficiently oversold versus short-term mean.');
  } else if (extensionBelowSma20 >= 0.02) {
    pullbackScore = 12;
    reasons.push('Pullback is moderate; bounce potential is present.');
  } else {
    reasons.push('Price is not oversold enough for this scanner.');
  }

  if (stochasticK <= 20) {
    stochasticScore = 25;
    reasons.push('Stochastic confirms oversold condition.');
  } else if (stochasticK <= 30) {
    stochasticScore = 12;
    reasons.push('Stochastic is nearing oversold zone.');
  } else {
    reasons.push('Momentum is not oversold by scanner rules.');
  }

  if (relativeVolume >= 1.1) {
    volumeScore = 20;
    reasons.push('Volume supports potential mean-reversion bounce.');
  } else if (relativeVolume >= 0.9) {
    volumeScore = 10;
    reasons.push('Volume is acceptable but not strongly supportive.');
  } else {
    reasons.push('Volume is too weak for bounce confirmation.');
  }

  const entryPrice = latestClose;
  const stopLoss = Math.min(latestLow, latestClose * 0.97);
  const risk = entryPrice - stopLoss;
  const targetPrice = entryPrice + risk * 1.8;
  const riskReward = risk > 0 ? (targetPrice - entryPrice) / risk : null;
  if (riskReward !== null && riskReward >= 1.6) {
    riskRewardScore = 15;
    reasons.push('Risk/reward profile supports bounce trade.');
  } else if (riskReward !== null && riskReward >= 1.3) {
    riskRewardScore = 8;
    reasons.push('Risk/reward profile is watchlist quality.');
  } else {
    reasons.push('Risk/reward profile is weak for bounce setup.');
  }

  const totalScore = Math.min(
    100,
    trendScore +
      pullbackScore +
      stochasticScore +
      volumeScore +
      riskRewardScore,
  );
  const scannerScore: ScannerScore = {
    totalScore,
    grade: gradeFromScore(totalScore),
    components: {
      trend: trendScore,
      pullback: pullbackScore,
      stochastic: stochasticScore,
      volume: volumeScore,
      riskReward: riskRewardScore,
    },
  };
  const isValid = scannerScore.grade === 'STRONG';
  const lastReason = isValid
    ? 'Oversold bounce setup qualifies.'
    : 'Oversold bounce setup does not qualify.';

  return {
    isValid,
    confidence: totalScore,
    entryPrice,
    stopLoss,
    targetPrice,
    riskReward,
    reason: `${lastReason} ${reasons.join(' ')}`.trim(),
    reasons,
    scannerScore,
    timeHorizon: '3-10 trading days',
  };
}
