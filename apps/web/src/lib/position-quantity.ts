export function resolveHalfQuantity(heldQuantity: number): number {
  if (heldQuantity <= 1) {
    return heldQuantity;
  }
  return Math.min(heldQuantity, Math.max(1, Math.floor(heldQuantity * 0.5)));
}
