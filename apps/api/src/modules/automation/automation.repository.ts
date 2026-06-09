import { Injectable } from '@nestjs/common';
import { PaperOrderSide, Prisma, RunStatus, StrategyName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ActiveSignalForExecutionRow = {
  id: string;
  symbolId: string;
  ticker: string;
  signalDate: Date;
  strategyName: StrategyName;
  reason: string;
  confidence: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
};

export type AutomationRunRow = {
  id: string;
  userEmail: string;
  strategy: string;
  status: RunStatus;
  startedAt: Date;
};

export type AutomationRunListRow = {
  id: string;
  userEmail: string;
  strategy: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  notes: string | null;
};

export type AutomationSignalExecutionRow = {
  id: string;
  runId: string;
  signalKey: string;
  symbol: string;
  side: PaperOrderSide;
  status:
    | 'PENDING'
    | 'PLACED'
    | 'SKIPPED_DUPLICATE'
    | 'REJECTED_RISK'
    | 'FAILED';
  reason: string | null;
  orderId: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  fillPrice: number | null;
  tradeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AutomationGuardrailRow = {
  id: string;
  userEmail: string;
  strategy: string;
  enabled: boolean;
  cooldownSeconds: number;
  lastTriggeredAt: Date | null;
  updatedAt: Date;
};

export type AutomationRunListFilters = {
  strategy?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
  cursorStartedAt?: Date;
  cursorRunId?: string;
};

@Injectable()
export class AutomationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveSignalsForExecution(params: {
    strategyName: StrategyName;
    signalIds?: string[];
  }): Promise<ActiveSignalForExecutionRow[]> {
    const where: Prisma.SignalWhereInput = {
      status: 'ACTIVE',
      strategyName: params.strategyName,
    };
    if (params.signalIds && params.signalIds.length > 0) {
      where.id = { in: params.signalIds };
    }

    const rows = await this.prisma.signal.findMany({
      where,
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        symbolId: true,
        signalDate: true,
        strategyName: true,
        reason: true,
        confidence: true,
        entryPrice: true,
        stopLoss: true,
        targetPrice: true,
        symbol: { select: { ticker: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      symbolId: row.symbolId,
      ticker: row.symbol.ticker,
      signalDate: row.signalDate,
      strategyName: row.strategyName,
      reason: row.reason,
      confidence: row.confidence,
      entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
      stopLoss: row.stopLoss ? Number(row.stopLoss) : null,
      targetPrice: row.targetPrice ? Number(row.targetPrice) : null,
    }));
  }

  async createAutomationRun(params: {
    strategy: string;
    userEmail: string;
  }): Promise<AutomationRunRow> {
    return this.prisma.automationRun.create({
      data: {
        strategy: params.strategy,
        userEmail: params.userEmail,
        status: 'RUNNING',
      },
      select: {
        id: true,
        userEmail: true,
        strategy: true,
        status: true,
        startedAt: true,
      },
    });
  }

  async createRun(params: {
    strategy: string;
    userEmail: string;
  }): Promise<AutomationRunRow> {
    return this.createAutomationRun(params);
  }

  async getOrCreateGuardrail(
    userEmail: string,
    strategy: string,
  ): Promise<AutomationGuardrailRow> {
    const existing = await this.prisma.automationGuardrail.findUnique({
      where: {
        userEmail_strategy: {
          userEmail,
          strategy,
        },
      },
      select: {
        id: true,
        userEmail: true,
        strategy: true,
        enabled: true,
        cooldownSeconds: true,
        lastTriggeredAt: true,
        updatedAt: true,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.automationGuardrail.create({
      data: {
        userEmail,
        strategy,
        enabled: true,
        cooldownSeconds: 0,
      },
      select: {
        id: true,
        userEmail: true,
        strategy: true,
        enabled: true,
        cooldownSeconds: true,
        lastTriggeredAt: true,
        updatedAt: true,
      },
    });
  }

  async updateGuardrail(input: {
    userEmail: string;
    strategy: string;
    enabled?: boolean;
    cooldownSeconds?: number;
  }): Promise<AutomationGuardrailRow> {
    return this.prisma.automationGuardrail.upsert({
      where: {
        userEmail_strategy: {
          userEmail: input.userEmail,
          strategy: input.strategy,
        },
      },
      create: {
        userEmail: input.userEmail,
        strategy: input.strategy,
        enabled: input.enabled ?? true,
        cooldownSeconds: input.cooldownSeconds ?? 0,
      },
      update: {
        enabled: input.enabled,
        cooldownSeconds: input.cooldownSeconds,
      },
      select: {
        id: true,
        userEmail: true,
        strategy: true,
        enabled: true,
        cooldownSeconds: true,
        lastTriggeredAt: true,
        updatedAt: true,
      },
    });
  }

  async touchGuardrailTriggered(input: {
    userEmail: string;
    strategy: string;
    triggeredAt: Date;
  }): Promise<void> {
    await this.prisma.automationGuardrail.upsert({
      where: {
        userEmail_strategy: {
          userEmail: input.userEmail,
          strategy: input.strategy,
        },
      },
      create: {
        userEmail: input.userEmail,
        strategy: input.strategy,
        enabled: true,
        cooldownSeconds: 0,
        lastTriggeredAt: input.triggeredAt,
      },
      update: {
        lastTriggeredAt: input.triggeredAt,
      },
    });
  }

  async completeAutomationRun(params: {
    runId: string;
    status: RunStatus;
    notes?: string;
  }): Promise<void> {
    await this.prisma.automationRun.update({
      where: { id: params.runId },
      data: {
        status: params.status,
        finishedAt: new Date(),
        notes: params.notes,
      },
    });
  }

  async completeRun(params: {
    runId: string;
    status: RunStatus;
    notes?: string;
  }): Promise<void> {
    await this.completeAutomationRun(params);
  }

  async failAutomationRun(params: {
    runId: string;
    notes?: string;
  }): Promise<void> {
    await this.completeAutomationRun({
      runId: params.runId,
      status: 'FAILED',
      notes: params.notes,
    });
  }

  async createSignalExecutionAttempt(params: {
    runId: string;
    signalKey: string;
    symbolId: string;
    side: PaperOrderSide;
  }): Promise<{ id: string } | null> {
    try {
      return await this.prisma.automationSignalExecution.create({
        data: {
          runId: params.runId,
          signalKey: params.signalKey,
          symbolId: params.symbolId,
          side: params.side,
          status: 'PENDING',
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.markSignalExecutionDuplicate({
          runId: params.runId,
          signalKey: params.signalKey,
          reason: 'duplicate signalKey within automation run',
        });
        return null;
      }
      throw error;
    }
  }

  async createSignalExecution(params: {
    runId: string;
    signalKey: string;
    symbolId: string;
    side: PaperOrderSide;
  }): Promise<{ id: string } | null> {
    return this.createSignalExecutionAttempt(params);
  }

  async markSignalExecutionPlaced(params: {
    executionId: string;
    orderId: string;
  }): Promise<void> {
    await this.prisma.automationSignalExecution.update({
      where: { id: params.executionId },
      data: {
        status: 'PLACED',
        orderId: params.orderId,
      },
    });
  }

  async markSignalExecutionRejected(params: {
    executionId: string;
    reason: string;
  }): Promise<void> {
    await this.prisma.automationSignalExecution.update({
      where: { id: params.executionId },
      data: {
        status: 'REJECTED_RISK',
        reason: params.reason,
      },
    });
  }

  async markSignalExecutionFailed(params: {
    executionId: string;
    reason: string;
  }): Promise<void> {
    await this.prisma.automationSignalExecution.update({
      where: { id: params.executionId },
      data: {
        status: 'FAILED',
        reason: params.reason,
      },
    });
  }

  async markSignalExecutionRejectedRisk(params: {
    executionId: string;
    reason: string;
  }): Promise<void> {
    await this.markSignalExecutionRejected(params);
  }

  async markSignalExecutionDuplicate(params: {
    runId: string;
    signalKey: string;
    reason?: string;
  }): Promise<void> {
    await this.prisma.automationSignalExecution.updateMany({
      where: {
        runId: params.runId,
        signalKey: params.signalKey,
      },
      data: {
        status: 'SKIPPED_DUPLICATE',
        reason: params.reason ?? 'duplicate signal',
      },
    });
  }

  async listRuns(
    userEmail: string,
    filters: AutomationRunListFilters = {},
  ): Promise<AutomationRunListRow[]> {
    const cursorWhere =
      filters.cursorStartedAt && filters.cursorRunId
        ? {
            OR: [
              { startedAt: { lt: filters.cursorStartedAt } },
              {
                startedAt: filters.cursorStartedAt,
                id: { lt: filters.cursorRunId },
              },
            ],
          }
        : undefined;

    return this.prisma.automationRun.findMany({
      where: {
        userEmail,
        strategy: filters.strategy,
        status: filters.status,
        ...cursorWhere,
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: filters.limit ?? 25,
      skip: filters.offset ?? 0,
      select: {
        id: true,
        userEmail: true,
        strategy: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        notes: true,
      },
    });
  }

  async findRun(
    runId: string,
    userEmail: string,
  ): Promise<AutomationRunListRow | null> {
    return this.prisma.automationRun.findFirst({
      where: { id: runId, userEmail },
      select: {
        id: true,
        userEmail: true,
        strategy: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        notes: true,
      },
    });
  }

  async listRunSignalExecutions(
    runId: string,
  ): Promise<AutomationSignalExecutionRow[]> {
    const rows = await this.prisma.automationSignalExecution.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        runId: true,
        signalKey: true,
        side: true,
        status: true,
        reason: true,
        orderId: true,
        createdAt: true,
        updatedAt: true,
        symbol: { select: { ticker: true } },
        order: {
          select: {
            stopLossPrice: true,
            takeProfitPrice: true,
            note: true,
            signal: {
              select: {
                stopLoss: true,
                targetPrice: true,
                reason: true,
              },
            },
            fill: { select: { price: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      signalKey: row.signalKey,
      symbol: row.symbol.ticker,
      side: row.side,
      status: row.status,
      reason: row.reason,
      orderId: row.orderId,
      stopLossPrice: this.resolveExecutionStopLoss(row.order),
      takeProfitPrice: this.resolveExecutionTakeProfit(row.order),
      fillPrice: row.order?.fill?.price ? Number(row.order.fill.price) : null,
      tradeReason:
        row.order?.signal?.reason?.trim() ||
        row.order?.note?.trim() ||
        null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private resolveExecutionStopLoss(
    order: {
      stopLossPrice: Prisma.Decimal | null;
      signal: { stopLoss: Prisma.Decimal | null } | null;
    } | null,
  ): number | null {
    if (!order) {
      return null;
    }
    if (order.stopLossPrice) {
      return Number(order.stopLossPrice);
    }
    if (order.signal?.stopLoss) {
      return Number(order.signal.stopLoss);
    }
    return null;
  }

  private resolveExecutionTakeProfit(
    order: {
      takeProfitPrice: Prisma.Decimal | null;
      signal: { targetPrice: Prisma.Decimal | null } | null;
    } | null,
  ): number | null {
    if (!order) {
      return null;
    }
    if (order.takeProfitPrice) {
      return Number(order.takeProfitPrice);
    }
    if (order.signal?.targetPrice) {
      return Number(order.signal.targetPrice);
    }
    return null;
  }
}
