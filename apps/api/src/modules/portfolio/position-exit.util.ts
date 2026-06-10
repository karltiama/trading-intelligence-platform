export type PositionExitTrigger = 'STOP_LOSS' | 'TAKE_PROFIT';

export function resolvePositionExitTrigger(input: {
  currentPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
}): PositionExitTrigger | null {
  const { currentPrice, stopLossPrice, takeProfitPrice } = input;

  if (stopLossPrice !== null && currentPrice <= stopLossPrice) {
    return 'STOP_LOSS';
  }
  if (takeProfitPrice !== null && currentPrice >= takeProfitPrice) {
    return 'TAKE_PROFIT';
  }
  return null;
}

export function resolvePartialCloseQuantity(
  heldQuantity: number,
  fraction: number,
): number {
  if (!Number.isFinite(heldQuantity) || heldQuantity <= 0) {
    return 0;
  }
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    return heldQuantity;
  }
  if (heldQuantity <= 1) {
    return heldQuantity;
  }
  const partial = Math.floor(heldQuantity * fraction);
  return Math.min(heldQuantity, Math.max(1, partial));
}
