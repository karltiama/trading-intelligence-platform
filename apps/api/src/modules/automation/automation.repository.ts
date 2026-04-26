import { Injectable } from '@nestjs/common';
import { PaperOrderSide, Prisma, RunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
  createdAt: Date;
  updatedAt: Date;
};

export type AutomationRunListFilters = {
  strategy?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
};

@Injectable()
export class AutomationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(params: {
    strategy: string;
    userEmail: string;
  }): Promise<AutomationRunRow> {
    return this.prisma.strategyRun.create({
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

  async completeRun(params: {
    runId: string;
    status: RunStatus;
    notes?: string;
  }): Promise<void> {
    await this.prisma.strategyRun.update({
      where: { id: params.runId },
      data: {
        status: params.status,
        finishedAt: new Date(),
        notes: params.notes,
      },
    });
  }

  async createSignalExecution(params: {
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
        return null;
      }
      throw error;
    }
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
    await this.prisma.automationSignalExecution.update({
      where: { id: params.executionId },
      data: {
        status: 'REJECTED_RISK',
        reason: params.reason,
      },
    });
  }

  async listRuns(
    userEmail: string,
    filters: AutomationRunListFilters = {},
  ): Promise<AutomationRunListRow[]> {
    return this.prisma.strategyRun.findMany({
      where: {
        userEmail,
        strategy: filters.strategy,
        status: filters.status,
      },
      orderBy: { startedAt: 'desc' },
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
    return this.prisma.strategyRun.findFirst({
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}
