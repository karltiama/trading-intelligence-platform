import { BadRequestException } from '@nestjs/common';
import { TradeSource } from '@prisma/client';

export type PlaceOrderBodyLike = {
  source?: string;
  signalId?: string;
  note?: string;
};

const NOTE_MAX = 500;

export function normalizeOrderNote(raw?: string): string | null {
  const t = raw?.trim() ?? '';
  if (!t) return null;
  if (t.length > NOTE_MAX) {
    throw new BadRequestException(`note must be at most ${NOTE_MAX} characters.`);
  }
  return t;
}

/**
 * HTTP API may send explicit source or legacy body with only signalId.
 * AUTOMATION is never accepted from the public orders endpoint.
 */
export function resolveHttpTradeSource(body: PlaceOrderBodyLike): {
  source: TradeSource;
  signalId: string | undefined;
} {
  const rawSource = body.source?.trim().toUpperCase();
  const signalId = body.signalId?.trim() || undefined;

  if (rawSource === 'AUTOMATION') {
    throw new BadRequestException('source AUTOMATION is not allowed on this endpoint.');
  }

  if (rawSource === 'MANUAL') {
    if (signalId) {
      throw new BadRequestException('manual orders must not include signalId.');
    }
    return { source: TradeSource.MANUAL, signalId: undefined };
  }

  if (rawSource === 'SIGNAL') {
    if (!signalId) {
      throw new BadRequestException('signalId is required when source is SIGNAL.');
    }
    return { source: TradeSource.SIGNAL, signalId };
  }

  if (signalId) {
    return { source: TradeSource.SIGNAL, signalId };
  }

  return { source: TradeSource.MANUAL, signalId: undefined };
}
