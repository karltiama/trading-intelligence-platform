import { BadRequestException } from '@nestjs/common';
import { TradeSource } from '@prisma/client';

import { normalizeOrderNote, resolveHttpTradeSource } from './resolve-trade-source';

describe('resolveHttpTradeSource', () => {
  it('defaults to MANUAL when no source and no signalId', () => {
    expect(resolveHttpTradeSource({})).toEqual({
      source: TradeSource.MANUAL,
      signalId: undefined,
    });
  });

  it('infers SIGNAL when only signalId is provided', () => {
    expect(resolveHttpTradeSource({ signalId: 'sig-1' })).toEqual({
      source: TradeSource.SIGNAL,
      signalId: 'sig-1',
    });
  });

  it('rejects AUTOMATION from HTTP body', () => {
    expect(() => resolveHttpTradeSource({ source: 'AUTOMATION' })).toThrow(BadRequestException);
  });

  it('rejects MANUAL with signalId', () => {
    expect(() =>
      resolveHttpTradeSource({ source: 'MANUAL', signalId: 'x' }),
    ).toThrow(BadRequestException);
  });

  it('requires signalId when source is SIGNAL', () => {
    expect(() => resolveHttpTradeSource({ source: 'SIGNAL' })).toThrow(BadRequestException);
  });
});

describe('normalizeOrderNote', () => {
  it('returns null for blank', () => {
    expect(normalizeOrderNote('  ')).toBeNull();
  });

  it('rejects notes over 500 chars', () => {
    expect(() => normalizeOrderNote('a'.repeat(501))).toThrow(BadRequestException);
  });
});
