"use client";

import Link from "next/link";

import {
  closePosition,
  updateOrderLevels,
  type PortfolioPosition,
} from "@/lib/api";
import { fmtUsd } from "@/lib/order-levels";
import { resolveHalfQuantity } from "@/lib/position-quantity";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PositionActionButtonsProps = {
  position: PortfolioPosition;
  busySymbol: string | null;
  onBusyChange: (symbol: string | null) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  onActionStart?: () => void;
  onEdit?: () => void;
};

export function PositionActionButtons({
  position,
  busySymbol,
  onBusyChange,
  onSuccess,
  onError,
  onRefresh,
  onActionStart,
  onEdit,
}: PositionActionButtonsProps): React.JSX.Element {
  const isBusy = busySymbol === position.symbol;

  async function handleClose(quantity?: number) {
    onActionStart?.();
    onBusyChange(position.symbol);
    try {
      const result = await closePosition(
        position.symbol,
        quantity === undefined ? undefined : { quantity },
      );
      onSuccess(
        quantity === undefined || quantity >= position.quantity
          ? `Closed ${result.symbol} position (${result.quantity} shares).`
          : `Sold ${result.quantity} shares of ${result.symbol}.`,
      );
      await onRefresh();
    } catch (err: unknown) {
      onError(
        err instanceof Error ? err.message : "Failed to close position.",
      );
    } finally {
      onBusyChange(null);
    }
  }

  async function handleBreakeven() {
    if (!position.linkedOrderId) {
      onError("No linked order to update stop levels.");
      return;
    }
    if (
      position.currentPrice === null ||
      position.currentPrice <= position.averageCost
    ) {
      onError("Price must be above average cost to move stop to breakeven.");
      return;
    }

    onActionStart?.();
    onBusyChange(position.symbol);
    try {
      await updateOrderLevels(position.linkedOrderId, {
        stopLossPrice: position.averageCost,
      });
      onSuccess(
        `Moved ${position.symbol} stop to breakeven (${fmtUsd(position.averageCost)}).`,
      );
      await onRefresh();
    } catch (err: unknown) {
      onError(
        err instanceof Error ? err.message : "Failed to move stop to breakeven.",
      );
    } finally {
      onBusyChange(null);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isBusy}
        onClick={() => void handleClose()}
      >
        Close
      </Button>
      {position.quantity > 1 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => void handleClose(resolveHalfQuantity(position.quantity))}
        >
          50%
        </Button>
      ) : null}
      {position.linkedOrderId &&
      position.currentPrice !== null &&
      position.currentPrice > position.averageCost ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => void handleBreakeven()}
        >
          Breakeven
        </Button>
      ) : null}
      {onEdit ? (
        <Button size="sm" variant="outline" disabled={isBusy} onClick={onEdit}>
          Edit
        </Button>
      ) : position.linkedOrderId ? (
        <Link
          href={`/dashboard/orders?symbol=${encodeURIComponent(position.symbol)}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            isBusy && "pointer-events-none opacity-50",
          )}
          aria-disabled={isBusy}
        >
          Edit
        </Link>
      ) : null}
    </div>
  );
}
