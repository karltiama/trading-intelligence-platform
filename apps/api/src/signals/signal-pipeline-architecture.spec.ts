import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_SRC = join(__dirname, '..');

const INTELLIGENCE_LAYER_FILES = [
  join(API_SRC, 'signals', 'signals.service.ts'),
  join(API_SRC, 'signals', 'signal-scoring.ts'),
  join(API_SRC, 'modules', 'market-state', 'market-state.service.ts'),
  join(API_SRC, 'modules', 'dashboard', 'dashboard.service.ts'),
  join(API_SRC, 'modules', 'dashboard', 'market-summary.mapper.ts'),
];

const FORBIDDEN_PATTERNS = [
  /\bcandle\b/i,
  /\bCandle\b/,
  /\bTimeframe\b/,
  /\bhourlyBars\b/i,
  /\bhourly-bars\b/i,
];

describe('signal pipeline architecture (daily-only intelligence layer)', () => {
  it.each(INTELLIGENCE_LAYER_FILES)(
    '%s does not reference intraday Candle data',
    (filePath) => {
      const source = readFileSync(filePath, 'utf8');
      const hits = FORBIDDEN_PATTERNS.filter((pattern) => pattern.test(source));
      expect(hits).toEqual([]);
    },
  );

  it('signals.service queries dailyPrices for scanner input', () => {
    const source = readFileSync(
      join(API_SRC, 'signals', 'signals.service.ts'),
      'utf8',
    );
    expect(source).toMatch(/dailyPrices\s*:/);
  });
});
