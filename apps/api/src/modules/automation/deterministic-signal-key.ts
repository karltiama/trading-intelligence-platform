import { PaperOrderSide } from '@prisma/client';

export function buildDeterministicSignalKey(input: {
  strategy: string;
  symbol: string;
  side: PaperOrderSide;
  signalAt: Date;
}): string {
  return `${input.strategy}|${input.symbol}|${input.side}|${input.signalAt.toISOString()}`;
}
